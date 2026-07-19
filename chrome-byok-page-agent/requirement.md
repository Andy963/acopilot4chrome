# Chrome BYOK Page Agent Requirements

## 文档状态

- 状态：Draft
- 方案：A，OpenAI-compatible 直连
- 目标平台：Chrome 116+
- 项目形态：独立 Chrome 扩展，不依赖 Acopilot 运行时或账号体系

## 背景

现有 Chrome AI 助手通常绑定厂商账号、固定模型服务或云端会话系统。目标用户已经拥有可访问的 OpenAI-compatible Agent 或模型网关，希望在浏览网页时，把明确选择的页面文本作为上下文直接提问，同时自行配置 API 地址和密钥。

本项目不提供托管后端，不要求注册登录，也不自动读取浏览历史或页面内容。扩展只在用户明确触发后采集当前页面文本，并直接请求用户配置的 endpoint。

本文中的“选中内容”指网页中用户选中的文本，不包含本地文件系统中的文件。文件上传、PDF 解析和 OCR 不属于首个版本。

## 产品目标

提供一个轻量、透明、无需登录的 Chrome Side Panel 助手，使用户能够：

1. 将当前网页选中的文本添加为上下文。
2. 将当前页面的可读正文添加为上下文。
3. 在发送前查看、删除或清空上下文。
4. 基于上下文向自定义 OpenAI-compatible endpoint 提问。
5. 自定义 `base_url`、`api_key`、认证方式和可选模型。
6. 获得流式响应并可以主动取消请求。
7. 明确知道哪些页面数据会被发送到哪个 endpoint。

## 成功标准

首个可发布版本必须满足：

- 用户无需创建账号即可完成全部核心流程。
- 扩展不依赖自有云端服务。
- 用户可以在五分钟内完成 endpoint 配置并发起第一次提问。
- 用户选中的文本能够被准确加入上下文，不因打开 Side Panel 而丢失。
- 普通文章页面能够提取主要可读文本，并在超限时给出可见的截断提示。
- 页面文本、用户问题和 Agent 响应之间具有明确边界。
- API Key 不出现在日志、会话内容、错误详情或导出数据中。
- 扩展不默认申请永久 `<all_urls>` 权限。

## 目标用户

### 自托管模型用户

用户运行 OpenAI-compatible 网关、反向代理或本地模型服务，希望浏览器直接连接自己的服务。

### 多供应商 API 用户

用户通过兼容 OpenAI Chat Completions 的第三方服务调用模型，但不希望使用绑定账号的浏览器 AI 产品。

### 隐私敏感用户

用户希望对页面采集、endpoint 和密钥拥有明确控制，不接受未披露的云端转发或自动页面上传。

## 核心用户流程

### 首次配置

1. 用户安装扩展并打开 Side Panel。
2. 扩展提示尚未配置 Agent profile。
3. 用户填写 endpoint、API Key、认证方式和可选模型。
4. 扩展根据 endpoint origin 请求网络权限。
5. 用户执行连接测试。
6. 测试成功后进入聊天界面。

### 基于选中文本提问

1. 用户在网页中选中文本。
2. 用户通过右键菜单选择 `Ask with selected text`。
3. Side Panel 打开，并显示新的 selection context card。
4. 用户检查上下文、输入问题并发送。
5. 扩展直接请求配置的 endpoint，并流式显示响应。

### 基于整个页面提问

1. 用户打开 Side Panel。
2. 用户点击 `Add current page`。
3. 扩展请求当前页面的临时访问权限或使用已有授权。
4. 扩展提取页面可读文本，并显示 page context card。
5. 用户检查截断状态后输入问题并发送。

### 多轮追问

1. 当前会话保留用户消息和 Agent 响应。
2. 已添加的 context cards 默认继续作用于当前会话，直到用户删除或清空。
3. 用户切换 Tab 后，扩展不得静默替换或混入新页面内容。
4. 来自其他 Tab 的上下文必须保留原始标题和 URL，避免来源不明确。

## 功能需求

### FR-1 Side Panel

- 扩展必须使用 Chrome 原生 Side Panel 作为主界面。
- 点击扩展图标必须能够打开 Side Panel。
- Side Panel 至少包含聊天视图、上下文区域和 Agent 设置视图。
- Side Panel 的核心操作必须支持键盘访问。

### FR-2 选中文本采集

- 扩展必须提供页面右键菜单入口。
- 右键菜单事件必须优先使用 Chrome 提供的 `selectionText`，避免焦点切换导致选区丢失。
- Side Panel 可以额外提供 `Add selection` 按钮，通过按需注入脚本读取当前选区。
- 空选区、纯空白选区和超出限制的选区必须有确定行为。
- 选区上下文必须包含标题、URL、文本、原始字符数和截断状态。

### FR-3 整页文本采集

- 扩展必须提供 `Add current page` 操作。
- 采集必须由用户显式触发，不得在页面加载或切换 Tab 时自动执行。
- 提取结果必须优先使用可读正文算法，并在失败时回退到可见文本。
- 不得采集密码字段、表单输入值、脚本内容和隐藏节点文本。
- 提取结果必须经过空白规范化和长度限制。
- 不支持注入的页面必须返回可理解的错误，而不是静默失败。

### FR-4 上下文管理

- 每个 context card 必须显示来源类型、标题、URL、字符数和截断状态。
- 用户必须能够预览完整的已保存文本。
- 用户必须能够删除单个 context card 或清空全部上下文。
- 上下文必须是捕获时快照，不得在发送请求时隐式重新采集。
- 相同页面的多个选区可以共存，但完全相同的重复项应去重。

### FR-5 聊天

- 用户必须能够输入、发送和取消请求。
- 扩展必须支持 OpenAI-compatible Chat Completions 流式响应。
- 扩展必须支持非流式错误响应解析。
- 请求进行期间必须防止同一会话重复发送。
- Agent 响应必须支持基础 Markdown 渲染和代码块复制。
- 当前会话必须支持多轮消息。

### FR-6 Agent profile

- 用户必须能够配置 profile name、base URL、chat path、API Key、认证 Header、认证 Schema 和可选模型。
- 首个版本只实现 `openai-compatible` adapter。
- 系统必须为后续 adapter 保留稳定接口，但不得在首版暴露未实现选项。
- 用户必须能够更新、测试和删除 profile。
- 首个版本可以只支持一个 active profile，但数据模型不得阻碍未来多 profile。

### FR-7 连接测试

- 保存 profile 前必须校验 URL 格式和协议。
- 连接测试必须真实验证网络权限、认证和响应格式。
- 连接测试可以发送一个最小非流式 Chat Completions 请求，并明确提示可能产生少量 token 消耗。
- 错误提示必须区分权限、网络、认证、协议和上游服务错误。

### FR-8 密钥存储

- 默认必须将 API Key 保存在 `chrome.storage.session`。
- 用户明确启用 `Remember API key` 后，才允许保存到 `chrome.storage.local`。
- UI 必须说明浏览器本地持久化不等同于系统 Keychain。
- API Key 不得写入聊天消息、context card、错误详情、遥测或调试日志。
- Profile 导出功能若未来加入，默认不得包含 API Key。

### FR-9 会话状态

- 首个版本只要求在当前浏览器会话内恢复聊天和上下文。
- 浏览器重启后可以清除聊天记录和非持久化密钥。
- Side Panel 重载后应尽可能从 `chrome.storage.session` 恢复当前会话。
- 永久聊天历史、跨设备同步和搜索不属于首版。

### FR-10 权限

- manifest 不得声明永久 `<all_urls>` host permission。
- 页面采集优先使用 `activeTab` 和按需脚本注入。
- endpoint origin 必须作为 optional host permission，在用户保存或测试 profile 时请求。
- 权限拒绝必须可恢复，并提供重新授权入口。
- 扩展不得请求 cookies、history、webRequest 或不必要的 tabs 权限。

## 非功能需求

### 隐私

- 页面文本只在用户显式发送问题时传输到 active profile endpoint。
- 扩展不得将页面内容发送到其他服务。
- 默认不得启用分析、崩溃上报或第三方遥测。
- Chrome 商店说明和隐私政策必须准确披露页面数据与 endpoint 之间的数据流。

### 安全

- 默认只允许 HTTPS endpoint。
- `localhost`、`127.0.0.1` 和 `[::1]` 可以使用 HTTP。
- 页面文本必须被标记为不可信背景，不能被当作系统指令。
- Markdown 渲染必须禁止任意 HTML 和脚本执行。
- 错误日志必须经过凭据脱敏。
- 扩展 Content Security Policy 不得依赖远程脚本。

### 性能

- 普通选区采集应在用户感知上即时完成。
- 对典型文章页面的本地文本提取目标为两秒内完成。
- 首版默认单个 context item 最大 50,000 字符。
- 首版默认单次请求全部 context items 合计最大 100,000 字符。
- 超出限制时必须确定性截断并显示原始字符数。

### 可维护性

- 页面提取、prompt 组装、SSE 解析和存储必须是可单元测试的纯逻辑模块。
- Chrome API 调用必须集中在明确的 adapter 或 entrypoint 中。
- Agent adapter 不得直接依赖 Vue 组件或浏览器 UI 状态。
- 所有消息协议必须使用 TypeScript 类型定义。

## 非目标

首个版本明确不实现：

- 账号、登录、订阅或付费。
- 自有后端、云端代理或密钥托管。
- 任意 Agent API 协议。
- OpenAI Responses API。
- 网页点击、输入、滚动、提交表单等工具调用。
- 自动浏览、任务规划或多 Agent 协作。
- 页面截图、视觉理解和 OCR。
- PDF、Office 文档和本地文件解析。
- 网站级永久自动采集。
- 对话云同步和跨设备恢复。
- Firefox、Safari 或 Edge 专项支持。

## 兼容性边界

以下页面可能无法采集，必须明确提示：

- `chrome://` 页面。
- Chrome Web Store 页面。
- 其他扩展页面。
- 浏览器内置 PDF Viewer。
- 未允许扩展访问的 `file://` 页面。
- 页面安全策略或浏览器限制禁止脚本注入的场景。

## 发布验收标准

发布候选版本必须通过：

1. 选区右键流程端到端测试。
2. 整页采集流程端到端测试。
3. 动态 endpoint 权限授权、拒绝和重新授权测试。
4. OpenAI-compatible 流式响应、非流式错误和取消测试。
5. Tab 切换和上下文来源隔离测试。
6. API Key 日志、存储和错误脱敏检查。
7. `typecheck`、单元测试、构建和 Chrome unpacked smoke。
8. Chrome 商店隐私披露人工复核。

## 术语

- BYOK：Bring Your Own Key，用户自行提供 API Key。
- Agent profile：一个 endpoint、认证配置和可选模型的集合。
- Context item：用户显式捕获的一段选区或整页文本快照。
- Active profile：当前聊天请求使用的 Agent profile。
- Readable page text：经过正文提取、清洗和截断的页面文本。

