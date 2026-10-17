/**
 * dsh-real-model — client half.
 * Renders a small real-model tag in each completed turn's tail,
 * by asking the host half for the turn's actual serving model.
 */
window.__ModuleLoader__.load({
  id: 'dsh-real-model',
  factory: (require) => {
    const React = require('react')
    const h = (type, props, ...kids) => React.createElement(type, props, ...kids)

    const CSS = `
.drm-tag{display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:11px;line-height:18px;
  padding:0 8px;border-radius:9px;opacity:.62;vertical-align:middle;
  background:var(--dsh-bg-tertiary,rgba(127,127,127,.14));color:var(--dsh-fg-secondary,inherit);
  user-select:text;white-space:nowrap;cursor:default}
.drm-tag:hover{opacity:1}
.drm-tag .drm-warn{color:#d97706}
`

    /** Normalize the owner's TurnLocation prop to a plain turn number. */
    function turnNumber(turn) {
      if (turn === null || turn === undefined) return undefined
      if (typeof turn === 'number') return turn
      if (typeof turn === 'object') {
        if (typeof turn.turn === 'object' && turn.turn !== null) return turn.turn.turn
        if (typeof turn.turn === 'number') return turn.turn
        if (typeof turn.id === 'number') return turn.id
      }
      const n = Number(turn)
      return Number.isFinite(n) ? n : undefined
    }

    /** ModelTag: one completed turn's real-model chip. */
    function ModelTag({ turn, sessionId, fetchModel }) {
      const turnNo = turnNumber(turn)
      const [state, setState] = React.useState({ status: 'loading' })
      React.useEffect(() => {
        let live = true
        if (turnNo === undefined) { setState({ status: 'nocell' }); return () => { live = false } }
        setState({ status: 'loading' })
        fetchModel(turnNo, sessionId).then(
          (value) => { if (live) setState({ status: 'ok', model: value }) },
          (error) => { if (live) setState({ status: 'error', error: String(error?.message ?? error) }) },
        )
        return () => { live = false }
      }, [turnNo, sessionId, fetchModel])
      if (state.status === 'nocell') return null
      if (state.status === 'loading') return h('span', { className: 'drm-tag' }, '…')
      if (state.status === 'error') return h('span', { className: 'drm-tag', title: state.error }, h('span', { className: 'drm-warn' }, '?'))
      const m = state.model
      return h('span', { className: 'drm-tag', title: `real model: ${m}\n(UI label is the routing group)` },
        h('span', { style: { opacity: 0.7 } }, '⚙'),
        String(m).replace(/^deepseek\//, ''))
    }

    function apply(ctx) {
      const tag = document.createElement('style')
      tag.dataset.pluginCss = 'dsh-real-model'
      tag.textContent = CSS
      document.head.appendChild(tag)

      // Per-(session, turn) cache. The key MUST include the session: a bare
      // turn number collides across sessions (turn 1 exists everywhere), which
      // made a freshly opened session show a previous session's model.
      // A TTL keeps a still-running turn's value from going stale as its
      // steps accumulate, and an unknown session is never cached at all
      // because the host would resolve it to whatever log is newest.
      const cache = new Map()
      const CACHE_TTL = 30000
      const fetchModel = async (turn, sessionId) => {
        const resp = await fetch('/dsh-real-model/turn-model?turn=' + encodeURIComponent(turn)
          + (sessionId ? '&session=' + encodeURIComponent(sessionId) : ''), { cache: 'no-store' })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json()
        if (data.error) throw new Error(data.error)
        return data.model ?? '?'
      }
      const cachedFetch = (turn, sessionId) => {
        if (!sessionId) return fetchModel(turn, sessionId)
        const key = sessionId + '#' + turn
        const hit = cache.get(key)
        if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value
        const value = fetchModel(turn, sessionId).catch((e) => { cache.delete(key); throw e })
        cache.set(key, { at: Date.now(), value })
        return value
      }

      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register(
        { name: 'conversation.chat.turnTail', id: 'dsh-real-model', order: 90 },
        (props) => h(ModelTag, { ...props, fetchModel: cachedFetch }),
      ))
      console.log('[dsh-real-model] client half ready')
    }

    var module = { exports: {} }
    module.exports.apply = apply
    module.exports.inject = ['slots']
    return module.exports
  },
})