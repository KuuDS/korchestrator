## Why

`korchestrator` 当前存在两套平行的插件入口（`src/index.ts` 与 `src/openclaw-entry.ts`），且 `openclaw-entry.ts` 直接导出 `register(api)` 函数而非 OpenClaw 官方 SDK 的 `definePluginEntry({ register(api) })` 模式。此外，hook handler 使用副作用模式（直接修改 `event`/`ctx` 对象），而 OpenClaw 官方推荐返回值模式；`registerSessionExtension` 仅为空 stub；部分核心 hook 未声明 `allowConversationAccess`。这些因素导致插件在真实 OpenClaw 运行时中可能无法被正确加载，或核心编排逻辑（分类、Plan 注入、Finalize）根本不被触发。

## What Changes

- **重构入口点**：将 `src/index.ts` 的 `definePluginEntry` 改为返回 `{ id, name, register(api) }` 对象，与 OpenClaw 官方 `openclaw/plugin-sdk/plugin-entry` 契约对齐。
- **合并平行逻辑**：将 `src/openclaw-entry.ts` 中的 hook 注册逻辑迁移至 `index.ts` 的 `register(api)` 内，消除双入口维护成本。
- **删除独立入口**：移除 `src/openclaw-entry.ts`（或保留为向 `index.ts` 的薄 re-export）。
- **修复 hook 返回值模式**：所有接受决策的 hook（`before_prompt_build`、`before_agent_finalize`、`subagent_spawning`、`before_agent_reply`）改为返回对象，不再直接修改 `event`/`ctx`。
- **实现 Session Extension**：在 `register(api)` 中调用 `api.registerSessionExtension("plan_state", ...)`，替换当前的空 stub。
- **声明 conversation 权限**：在 `register(api)` 或 manifest 中声明 `allowConversationAccess: true`，确保 `before_agent_reply`、`before_prompt_build`、`before_agent_finalize`、`agent_end` 等 raw-conversation hook 被 OpenClaw 调度器识别并触发。
- **适配 handler 签名**：`api.on(handler)` 仅接收单参数 `event`，上下文通过 `event.context` 访问。
- **更新测试与构建**：单元测试 mock gateway 适配新入口结构；`Dockerfile.integration` 引用正确入口路径。

## Capabilities

### New Capabilities
- *(无新增 capability，本 change 为纯实现重构与运行时兼容性修复)*

### Modified Capabilities
- `planner` (FR-PLAN-003): Session Extension 持久化从空 stub 改为真实 `api.registerSessionExtension` 调用，属于行为级修正。
- `task` (FR-TASK-004): Lifecycle Tracking 中的 Plan 状态持久化路径从直接 `session.data` 修改改为通过官方 Session Extension API。

## Impact

- **代码文件**：`src/index.ts`（大幅重构）、`src/openclaw-entry.ts`（删除）、`src/planner.ts`（`registerSessionExtension` 实现化）、`src/contracts/hooks.ts`（类型同步）。
- **测试**：`tests/unit/hooks.test.ts`、`tests/blackboard-integration.test.ts` 需适配新入口与 mock API。
- **构建产物**：`dist/index.js` 变为 OpenClaw 可识别的 `definePluginEntry` 导出；`dist/openclaw-entry.js` 不再生成。
- **集成部署**：`Dockerfile.integration` 中 `openclaw.extensions` 路径需从 `./dist/openclaw-entry.js` 改为 `./dist/index.js`。
- **依赖**：若使用 `openclaw/plugin-sdk/plugin-entry` 的 typed import，需确认该包在运行时可用（OpenClaw 内置注入，无需额外 npm 依赖）。
