# dsh-real-model

一个 DeepSeek Harness（DSH）插件，用来揭示每条 AI 回复背后**真实使用的上游模型**——而不是界面上显示的路由组标签（如 `group/smart-split`，那只是 magpie 路由组的名字，不是真正干活的模型）。

## 功能

### 1. 每轮回复尾部的真实模型徽标（UI）

每条完成的回复下方会显示一个小徽标，例如 `⚙ glm-5.3-flash`、`⚙ deepseek-v4.1-flash`，鼠标悬停可看详情。同一会话的不同轮次可能落在不同的上游模型上，所以徽标是**按轮次**显示的。

### 2. `real_model` 工具（对话里可直接问）

在对话里让 AI 调用 `real_model` 工具，即可查询任意会话每条回复的真实模型，含按模型聚合的计数：

```
请用 real_model 工具查一下我这个会话用的真实模型
```

支持参数：`session`（会话 id 片段过滤）、`cwd`（按工作目录过滤）、`last`（只看最近 N 条）、`summaryOnly`（只看按模型计数）。

## 数据来源

DSH 会话日志（`session.vN.jsonl.zstd`，多帧 zstd）里，每条 `assistant/message` 记录的
`source.replayState.response.responseModel` 是供应商**实际服务的模型**；
而日志顶层和 UI 显示的 `model` 字段只是路由组名。同一会话的不同轮次/步骤可能混用不同上游模型。

## 安装

```bash
pnpm pack
```

然后在 DSH 里：**设置 → 插件** → 安装生成的 tarball（或让 AI 执行 `plugin_manager install_bundle <tarball>`），重启 DSH 生效。

> 版本升级时请务必升版本号：DSH 按 generation 路径缓存已加载的 ESM，同版本重装不会生效。

## 工作原理

- **Host 半**（`lib/index.js`）：
  - 解析会话日志的多帧 zstd（顺序扫描 skippable 帧 `0x184D2A50` 与数据帧 `0xFD2FB528`）；
  - 注册 HTTP 路由 `GET /dsh-real-model/turn-model?turn=N&session=<id>`（DSH 的 `webServer.register` 只支持 `kind: "exact"`）；不传 `session` 时取修改时间最新的日志；
  - 对该轮的全部回复做多数投票得出该轮真实模型；
  - 注册 `real_model` 工具（新版 DSH 强制工具声明 `output: { schema, render }`，缺失会导致插件激活失败）。
- **Client 半**（`lib/client.js`）：
  - 挂载 `conversation.chat.turnTail` 槽位渲染徽标；
  - 槽位组件收到的 `turn` prop 是 `TurnLocation` 对象（`{ turn: number, status, … }`），内部先规范化为数字再请求。

## 日志位置

插件依次检查：`%APPDATA%/dsh-desktop/harness/sessions` 和 `$DSH_HOME/sessions`。

## DSH 插件开发踩坑要点（给想写插件的人）

1. **工具注册**必须包在 `root.inject(['tools'], ctx => …)` 里，`parameters` 用裸 JSON Schema，且必须声明 `output: { schema, render }`；
2. **静态 client.js** 被打进 `plugins/??` 组合 bundle，必须写成 `window.__ModuleLoader__.load({ id, factory })`，工厂内 `require('react')` 并设置 `module.exports = { apply, inject }`——顶层 `return` 会让整个组合 bundle 语法错误，拖垮**所有** client 插件的加载；
3. `webServer.register` 只支持 `kind: "exact"`，用 `prefix` 会静默 404；
4. 插件激活失败会让 DSH 进入 desktop-safe-mode，之后 `plugin_manager` 的安装会落到 safe-mode 侧而不是 web profile；
5. 版本升级必须 bump 版本号（ESM 按 generation 路径缓存）。

## 卸载

设置 → 插件 → 停用/移除 `dsh-real-model`，重启 DSH。

## License

MIT
