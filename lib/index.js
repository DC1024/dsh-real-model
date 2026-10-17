/** dsh-real-model: one tool that reports the real upstream model per assistant reply. */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

export const name = 'dsh-real-model'

const SKIP_MAGIC = 0x184d2a50
const ZSTD_MAGIC = 0xfd2fb528

/** Parse possibly multi-frame zstd JSONL into lines. */
function readLogLines(file) {
  const buf = fs.readFileSync(file)
  const out = []
  let off = 0
  const u32 = o => (o + 4 <= buf.length ? buf.readUInt32LE(o) >>> 0 : 0)
  while (off < buf.length) {
    const m = u32(off)
    if (m === SKIP_MAGIC) { off += 12 + u32(off + 4); continue }
    if (m === ZSTD_MAGIC) {
      let end = off + 4
      while (end + 4 <= buf.length) {
        const m2 = u32(end)
        if (m2 === ZSTD_MAGIC || m2 === SKIP_MAGIC) break
        end++
      }
      try {
        out.push(zstdDecompressSync(buf.subarray(off, end)).toString())
      } catch {
        out.push(zstdDecompressSync(buf.subarray(off)).toString())
        break
      }
      off = end
      continue
    }
    off++
  }
  return out.join('\n').split('\n').filter(Boolean)
}

function sessionDirs() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const roaming = path.join(os.homedir(), 'AppData', 'Roaming', 'dsh-desktop', 'harness', 'sessions')
  return [roaming, path.join(home, 'sessions')].filter(p => fs.existsSync(p))
}

/** Locate session logs; optionally filter by cwd slug or session id substring. */
function findSessionLogs({ cwd, session } = {}) {
  const results = []
  for (const root of sessionDirs()) {
    let buckets = fs.readdirSync(root)
    if (cwd) buckets = buckets.filter(b => b.toLowerCase().includes(cwd.toLowerCase()))
    for (const b of buckets) {
      const bucketDir = path.join(root, b)
      let sessions = []
      try { sessions = fs.readdirSync(bucketDir) } catch { continue }
      for (const s of sessions) {
        if (session && !b.includes(session) && !s.includes(session)) continue
        const dir = path.join(bucketDir, s)
        let files = []
        try { files = fs.readdirSync(dir) } catch { continue }
        for (const f of files) {
          if (!/^session\.v\d+\.jsonl\.zstd$/.test(f)) continue
          const full = path.join(dir, f)
          const st = fs.statSync(full)
          results.push({ dir: s, bucket: b, file: full, mtime: st.mtimeMs, size: st.size })
        }
      }
    }
  }
  results.sort((a, b) => b.mtime - a.mtime)
  return results
}

/** Extract per-reply real model info from one session log. */
function extractReplies(file, { last } = {}) {
  const lines = readLogLines(file)
  const sessionLine = lines.find(l => l.startsWith('{"type":"session"'))
  let sessionId
  try { sessionId = JSON.parse(sessionLine)?.id } catch {}
  const replies = []
  for (const l of lines) {
    if (!l.startsWith('{"type":"assistant/message"')) continue
    let j
    try { j = JSON.parse(l) } catch { continue }
    const msg = j?.data?.message
    const src = msg?.source
    if (src?.kind !== 'model') continue
    const resp = src?.replayState?.response
    const textBlock = (msg?.content ?? []).find(b => b.type === 'text')
    replies.push({
      turn: j?.data?.turn,
      step: j?.data?.step,
      time: new Date(j.time).toISOString(),
      labelModel: src.model ?? resp?.model,
      realModel: resp?.responseModel ?? src.model ?? '?',
      responseId: resp?.responseId,
      preview: (textBlock?.text ?? '').slice(0, 120),
    })
  }
  return { sessionId, replies: last ? replies.slice(-last) : replies }
}

function summary(rows) {
  const counts = new Map()
  for (const r of rows) counts.set(r.realModel, (counts.get(r.realModel) ?? 0) + 1)
  return [...counts.entries()].map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count)
}

const PARAMETERS = {
  type: 'object',
  properties: {
    session: { type: 'string', description: 'Session id substring filter; defaults to the most recent session.' },
    cwd: { type: 'string', description: 'CWD slug substring filter, e.g. "deepseekharness".' },
    last: { type: 'number', description: 'Return only the last N replies (1-50).' },
    summaryOnly: { type: 'boolean', description: 'Return per-model counts instead of every reply.' },
  },
  additionalProperties: false,
}

export function apply(root) {
  // HTTP route for the client half: a turn's real model for the current session.
  root.inject(['webServer'], ctx => {
    const writeJson = (res, code, value) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(value))
    }
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-real-model/',
        handler: async (req, res) => {
          const url = new URL(req.url, 'http://local')
          const session = url.searchParams.get('session')
          const logs = findSessionLogs(session ? { session } : {})
          if (!logs.length) return writeJson(res, 404, { error: 'session log not found' })
          const turnParam = url.pathname.endsWith('/turn-model') ? url.searchParams.get('turn') : null
          try {
            const { sessionId, replies } = extractReplies(logs[0].file, {})
            if (turnParam === null) {
              return writeJson(res, 200, { sessionId, models: summary(replies), last: replies.at(-1) ?? null })
            }
            const turn = Number(turnParam)
            const list = replies.filter(r => r.turn === turn)
            if (!list.length) return writeJson(res, 404, { error: `no replies for turn ${turn}` })
            const counts = new Map()
            for (const r of list) counts.set(r.realModel, (counts.get(r.realModel) ?? 0) + 1)
            const model = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
            return writeJson(res, 200, { sessionId, turn, model, replies: list.length })
          } catch (e) {
            return writeJson(res, 500, { error: String(e?.message ?? e) })
          }
        },
      }))
      ctx.logger?.info?.('dsh-real-model: /dsh-real-model/ routes registered')
    } catch (e) {
      ctx.logger?.warn?.(`dsh-real-model: web route failed: ${e?.message ?? e}`)
    }
  }, 'dsh-real-model: routes')

  root.inject(['tools'], ctx => {
    ctx.tools.register({
    name: 'real_model',
    description:
      'Query the real upstream model used for assistant replies in DSH sessions. '
      + 'Reads session logs (session.vN.jsonl.zstd) and extracts responseModel (the actual serving model), '
      + 'which may differ from the UI label (a routing group like group/smart-split).',
    parameters: PARAMETERS,
    async execute(args) {
      const { session, cwd, last, summaryOnly } = args ?? {}
      const logs = findSessionLogs({ cwd, session })
      if (!logs.length) return { error: 'no session logs matched' }
      const picked = logs.slice(0, session || cwd ? 5 : 1)
      const out = []
      for (const log of picked) {
        try {
          const { sessionId, replies } = extractReplies(log.file, { last })
          out.push({
            sessionId: sessionId ?? log.dir,            logFile: log.file,
            replyCount: replies.length,
            models: summary(replies),
            replies: summaryOnly ? undefined : replies,
          })
        } catch (e) {
          out.push({ sessionId: log.dir, logFile: log.file, error: String(e?.message ?? e) })
        }
      }
      return { matched: logs.length, inspected: out.length, sessions: out }
    },
    })
  }, 'dsh-real-model: real_model tool')
  root.logger?.info?.('dsh-real-model: real_model tool registered.')
}
