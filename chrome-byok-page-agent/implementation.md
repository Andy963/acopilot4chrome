# Chrome BYOK Page Agent Implementation Plan

## 实施目标

在独立仓库中实现一个 Chrome 116+ Manifest V3 扩展。扩展使用 Side Panel，支持显式采集网页选区或整页可读文本，并通过用户配置的 OpenAI-compatible endpoint 进行流式问答。

本文是后续新建项目时的执行计划，不要求在 Acopilot 仓库中实现扩展代码。

## 技术栈

- Node.js 22 LTS
- pnpm
- WXT
- Vue 3
- TypeScript strict mode
- Vitest
- `@mozilla/readability`
- `markdown-it`
- ESLint
- Prettier

首版不引入完整 UI component framework。Side Panel 界面较小，使用 CSS variables 和少量基础组件即可降低包体与主题定制成本。

## 初始化命令

新仓库创建后建议使用：

```bash
pnpm dlx wxt@latest init
pnpm install
pnpm add @mozilla/readability markdown-it
pnpm add -D vitest eslint prettier vue-tsc
```

实际初始化时应锁定经过验证的具体依赖版本，并提交 lockfile。

## 推荐目录

```text
entrypoints/
  background.ts
  sidepanel/
    index.html
    main.ts
    App.vue

src/
  agent/
    adapter.ts
    errors.ts
    openai-compatible.ts
    sse-parser.ts
    url.ts
  context/
    deduplicate.ts
    extract-page.ts
    extract-selection.ts
    normalize.ts
    prompt-builder.ts
    truncate.ts
    types.ts
  messaging/
    messages.ts
    router.ts
  permissions/
    endpoint-permission.ts
    page-permission.ts
  storage/
    profile-repository.ts
    secret-repository.ts
    session-repository.ts
  stores/
    chat.ts
    context.ts
    profiles.ts
  components/
    AgentSettings.vue
    ChatComposer.vue
    ChatMessage.vue
    ContextCard.vue
    ContextList.vue
    EmptyState.vue
  shared/
    ids.ts
    result.ts
    redact.ts

tests/
  agent/
  context/
  messaging/
  permissions/
  storage/
```

## 开发约束

- 所有扩展代码、标识符、注释和提交信息使用 English。
- TypeScript 必须启用 strict mode。
- Chrome API 访问不得散落在展示组件中。
- 页面提取和 prompt 组装必须可脱离浏览器运行单元测试。
- API Key 不得进入 Pinia devtools snapshot 或通用 profile store。
- 用户输入和 Agent Markdown 不允许 raw HTML。
- 不加入未被需求覆盖的账号、遥测、浏览器工具或云端功能。

## Milestone 0：协议与工程基线

### 目标

建立可编译、可测试、可加载的 MV3 项目，并冻结首版接口。

### 工作项

1. 初始化 WXT Vue TypeScript 项目。
2. 配置 ESLint、Prettier、Vitest 和 `vue-tsc`。
3. 配置 Chrome 116+ 和 Side Panel entrypoint。
4. 定义 `AgentProfile`、`ContextItem`、`ChatSession` 和消息协议。
5. 定义 `AgentAdapter` 和错误类型。
6. 编写最小 README，说明 BYOK、无登录和数据流。
7. 建立隐私与安全文档。

### 验收

- 扩展可以通过 unpacked 模式加载。
- 点击扩展图标能打开空 Side Panel。
- 类型检查、测试和构建命令存在并成功执行。
- manifest 不包含永久 `<all_urls>`。

## Milestone 1：Agent profile 与权限

### 目标

用户能够配置并测试 OpenAI-compatible endpoint。

### 工作项

1. 实现 profile repository。
2. 实现 session/local 两种 secret repository。
3. 实现 endpoint URL 规范化和 loopback HTTP 例外。
4. 实现 endpoint origin 动态权限请求。
5. 实现 Agent 设置 UI。
6. 实现 API Key 掩码、显示切换和持久化风险确认。
7. 实现最小 completion 连接测试。
8. 实现错误分类与凭据脱敏。

### 验收

- 用户可以保存合法 HTTPS endpoint。
- 非 loopback HTTP endpoint 被拒绝。
- 未授权 origin 会触发权限请求。
- 权限拒绝不会保存半完成配置。
- session-only API Key 不会出现在 `chrome.storage.local`。
- 连接测试能区分认证失败和协议错误。

## Milestone 2：选区采集

### 目标

通过右键菜单可靠捕获网页选区，并显示在 Side Panel。

### 工作项

1. 注册 `Ask with selected text` context menu。
2. 使用 `selectionText` 构造 selection draft。
3. 在打开 Side Panel 前，将 draft 写入 session pending capture queue。
4. Side Panel 启动后消费并确认 pending capture。
5. 使用 typed message 作为已加载 Side Panel 的唤醒机制，而不是唯一交付机制。
6. 实现选区规范化、截断和去重。
7. 实现 context store 和 ContextCard。
8. 实现 `Add selection` 按钮的按需注入路径。
9. 处理空选区、过长选区和不支持页面。

### 验收

- 右键操作后选区文本不丢失。
- Side Panel 尚未加载时，pending capture 仍能在面板打开后被消费。
- ContextCard 显示标题、URL、字符数和截断状态。
- 相同选区重复添加时去重。
- 不同选区可以同时存在。
- 用户可以预览和删除上下文。

## Milestone 3：整页采集

### 目标

用户可以显式提取当前页面的可读文本。

### 工作项

1. 实现 page scheme 和可注入性检查。
2. 实现 DOM clone 与敏感节点清理。
3. 集成 Readability。
4. 实现 `body.innerText` fallback。
5. 实现文本规范化、单项截断和总量限制。
6. 实现 `Add current page` UI 和状态反馈。
7. 处理 `chrome://`、Web Store、PDF Viewer 和未授权页面。

### 验收

- 普通文章正文可以被提取。
- 页面原始 DOM 不被修改。
- 表单输入值不会出现在提取结果中。
- Readability 失败时仍可以返回合理的可见文本。
- 超限内容显示原始长度和截断状态。

## Milestone 4：聊天与流式响应

### 目标

基于 context items 和多轮历史完成流式问答。

### 工作项

1. 实现默认 system instruction。
2. 实现 context prompt builder。
3. 实现 OpenAI-compatible request builder。
4. 实现跨 chunk SSE parser。
5. 实现 Side Panel 中的流状态机。
6. 实现 Markdown 安全渲染和代码复制。
7. 实现取消、超时、认证错误、限流和上游错误 UI。
8. 实现当前 session 的 `chrome.storage.session` 恢复。

### 验收

- 请求 body 符合 Chat Completions 格式。
- 页面上下文位于最新问题之前，并被标记为不可信数据。
- 流式文本可以增量显示。
- `[DONE]` 能正常结束响应。
- 用户取消后请求终止，消息状态为 cancelled。
- Side Panel reload 后可以恢复已完成消息和 context items。

## Milestone 5：安全、体验与发布

### 目标

达到 Chrome 商店发布候选质量。

### 工作项

1. 完成键盘导航和基础无障碍标签。
2. 完成空状态、权限状态和错误恢复入口。
3. 完成敏感信息扫描和日志审查。
4. 完成 manifest 权限最小化审查。
5. 完成 Chrome 商店隐私政策和数据披露。
6. 准备图标、截图、描述和发布包。
7. 在静态文章、SPA、长页面和不支持页面上执行 smoke。
8. 验证扩展升级后 profile schema 兼容。

### 验收

- 所有自动化验证通过。
- 无远程脚本和不必要权限。
- API Key 不出现在构建产物中的 fixture 或日志。
- Chrome unpacked smoke 覆盖两条核心流程。
- 商店说明与真实数据流一致。

## 单元测试计划

### Context

至少覆盖：

- 空白规范化。
- 换行规范化。
- 单项截断。
- 总上下文截断。
- 截断标记稳定性。
- 相同选区去重。
- 同 URL 不同选区不去重。
- prompt 中 context 与最新问题的顺序。
- prompt injection 文本保持在 context boundary 内。

### Agent

至少覆盖：

- Base URL 与 chat path 拼接。
- 末尾 `/` 的各种组合。
- 以 `/` 开头的 chat path 规范化。
- Absolute chat URL 和 `..` path traversal 拒绝。
- HTTPS 和 loopback HTTP 规则。
- 默认 Bearer Header。
- 无 Schema Header。
- 有 model 和无 model 请求。
- SSE 多事件单 chunk。
- SSE 单事件多 chunk。
- `[DONE]`。
- 未知事件字段。
- JSON error body。
- 非 JSON error body。
- abort 和 timeout。

### Storage

至少覆盖：

- Profile 不含 API Key。
- Session mode 只写 session storage。
- Local mode 明确写 local storage。
- 删除 profile 同时删除对应密钥。
- 日志和错误脱敏。
- Session 恢复忽略不完整 streaming message 或将其标记为 error。

### Permissions

至少覆盖：

- Endpoint origin 正确生成。
- 用户拒绝权限。
- 已有权限不重复请求。
- 删除 profile 后的可选撤权路径，以及相同 origin 仍被其他 profile 使用的情况。
- 不支持 URL scheme。

## 集成测试计划

使用 mock OpenAI-compatible server 提供：

- 正常 SSE 响应。
- 慢速 SSE 响应。
- 401、403、429 和 500。
- 非标准 chunk 切分。
- 无效 JSON event。
- 非流式错误响应。

集成测试必须验证：

- UI 提交的问题与 context 内容正确进入 request。
- API Key 只出现在网络 Header，不进入 session message。
- 取消操作触发 abort。
- Side Panel reload 可以恢复 session。
- Profile 切换不会复用错误密钥。

## Chrome UI Smoke

准备一个仅用于测试的本地网页 fixture，包含：

- 标题和多段文章文本。
- 导航、正文和页脚。
- 输入框和密码框。
- 隐藏文本。
- 足够长的可截断内容。

Smoke 流程：

1. 以 unpacked 模式加载扩展。
2. 打开 fixture 页面。
3. 使用 `agent-browser` 完成页面选择和普通网页交互 smoke。
4. 通过扩展右键菜单添加 selection context。
5. 验证 Side Panel context card。
6. 添加整个页面并确认表单值未出现。
7. 配置 mock endpoint 并发送问题。
8. 验证流式响应和取消。
9. 切换 Tab，确认上下文来源没有被静默替换。

如果 `agent-browser` 无法直接操作 Chrome Side Panel，则页面部分继续使用 `agent-browser`，扩展 UI 部分使用 Chromium extension E2E 或人工 smoke，并记录限制和结果。

## 验证命令

新项目应提供并运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

发布前额外运行：

```bash
pnpm test:integration
pnpm test:e2e
pnpm zip
```

## Review 清单

### 产品范围

- 是否仍然无需登录和自有后端？
- 是否只支持用户显式采集？
- 是否误加入网页操作、自动浏览或云同步？
- 是否只暴露已经实现的 adapter？

### 权限

- 是否没有永久 `<all_urls>`？
- 是否所有 host permission 都有明确用户动作？
- 是否申请了 cookies、history 或其他不必要权限？

### 安全

- API Key 是否可能进入日志、错误、Pinia state 或 export？
- Markdown 是否禁用 raw HTML 和危险 URL？
- 页面文本是否被标记为不可信上下文？
- 是否只允许 HTTPS 和 loopback HTTP？

### 正确性

- Context item 是否保持捕获时快照？
- Tab 切换是否可能混入错误页面内容？
- SSE parser 是否正确处理任意 chunk 边界？
- 取消、超时和错误是否进入确定状态？

### 发布

- 隐私政策是否与数据流一致？
- 商店截图是否没有真实 API Key 或私人页面数据？
- 构建产物是否不包含测试凭据？

## 风险与缓解

### OpenAI-compatible 差异

风险：不同网关对 model、SSE 和错误结构的兼容程度不同。

缓解：保持请求最小化，忽略未知字段，使用 mock contract tests，并选取至少两个实际兼容服务验证。

### 页面提取质量

风险：SPA、虚拟列表、Shadow DOM 和复杂布局可能导致正文不完整。

缓解：首版明确定位为当前 DOM 快照；使用 Readability 和 visible text fallback；不承诺抓取未渲染内容。

### API Key 本地持久化

风险：`chrome.storage.local` 不等同于操作系统 Keychain。

缓解：默认 session-only；持久化必须显式确认；文档和 UI 明确风险；不提供伪加密承诺。

### Chrome Store 审核

风险：页面读取和可选 host permission 需要清晰用途说明。

缓解：权限最小化、显式操作、准确隐私政策，并确保商店文案与实际行为一致。

### MV3 生命周期

风险：Service Worker 会被回收，导致依赖其内存状态的流程不稳定。

缓解：聊天流由 Side Panel 持有；关键会话状态写入 session storage；Background 保持无状态或可恢复。

## Definition of Done

首个版本只有在以下条件全部满足时才完成：

1. 需求文档中的发布验收标准全部通过。
2. 核心流程不需要账号或自有后端。
3. 用户可以配置 OpenAI-compatible endpoint 并完成连接测试。
4. 选区和整页文本都可以成为可见、可删除的 context item。
5. 流式聊天、取消和错误恢复工作正常。
6. 权限、API Key 和页面数据通过安全 Review。
7. 所有验证命令通过。
8. Chrome unpacked smoke 通过。
9. 隐私政策和商店披露准备完成。
10. 已知限制被记录且没有阻断性缺陷。
