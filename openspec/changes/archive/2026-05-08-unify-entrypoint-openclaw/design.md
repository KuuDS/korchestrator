## Context

`korchestrator` 当前有两套插件入口：

1. `src/index.ts` — 导出 `definePluginEntry({ id, name, version, hooks[] })`，用于单元测试的 mock gateway。hook handler 在此文件中通过 `ctx` 对象直接修改属性（如 `extendedCtx.prependContext = markdown`）。
2. `src/openclaw-entry.ts` — 导出 `register(api)` 函数，用于真实 OpenClaw 加载。hook handler 在此文件中通过 `api.on(hookName, async (event, _ctx) => { ... })` 注册。

两套逻辑业务相同但实现细节不同（session 读取方式、错误处理路径、hook 返回值模式），导致维护成本翻倍，且真实运行时行为无法被单元测试覆盖。

OpenClaw 官方 SDK（`openclaw/plugin-sdk/plugin-entry`）的契约是：
- 插件导出 `definePluginEntry({ id, name, register(api) })`
- `register(api)` 中通过 `api.on(hookName, handler, opts)` 注册 hook
- handler 接收单参数 `event`，返回决策对象（如 `{ prependContext }`）
- `api.registerSessionExtension(name, { serializer, deserializer })` 用于跨 turn 状态持久化

## Goals / Non-Goals

**Goals:**
- 将插件入口统一为 OpenClaw 官方 `definePluginEntry` 契约
- 消除 `openclaw-entry.ts` 与 `index.ts` 之间的逻辑漂移
- 所有 hook handler 改为返回值模式，与 OpenClaw hook runner 兼容
- 通过 `api.registerSessionExtension` 实现 Plan 状态的官方持久化路径
- 确保单元测试能覆盖真实入口路径（通过 mock `api` 对象）

**Non-Goals:**
- 不修改 Plan/Task/Router/Replanner/Blackboard 的核心业务逻辑
- 不新增 hook 种类或修改 hook 优先级
- 不接入真实 LLM backend（generate 仍为 injectable stub）
- 不改写 plugin.json 配置结构

## Decisions

### Decision 1: 以 `index.ts` 为唯一入口，删除 `openclaw-entry.ts`

**Rationale**: `index.ts` 已有更完整的 hook 处理逻辑和测试覆盖。将 `openclaw-entry.ts` 的逻辑合并到 `index.ts` 的 `register(api)` 中，然后删除 `openclaw-entry.ts`，可一次性消除双入口问题。

**Alternative considered**: 保留 `openclaw-entry.ts` 作为薄 wrapper re-export `index.ts` 的内容。Rejected：仍然存在两个文件，未来仍会漂移。

### Decision 2: Handler 返回值模式替代副作用模式

OpenClaw hook runner 的语义：
- 对于决策型 hook（`before_prompt_build`、`before_agent_finalize`、`subagent_spawning`、`before_agent_reply`），runner 读取 handler 的返回值，忽略对 `event` 对象的突变。
- 对于观察型 hook（`after_tool_call`、`agent_end`），返回值被忽略，但副作用（如写 Blackboard）仍有效。

因此：
- 决策型 hook → **必须返回对象**
- 观察型 hook → **继续副作用模式**（无需返回值）

### Decision 3: `registerSessionExtension` 在 `register(api)` 中完成注册

当前 `Planner.registerSessionExtension()` 为空 stub。重构后：
- `register(api)` 中直接调用 `api.registerSessionExtension("plan_state", { serializer, deserializer })`
- `Planner` 不再负责 session extension 注册，只负责读写 plan state 的序列化/反序列化逻辑
- 这样 `Planner` 成为纯业务类，不再依赖 OpenClaw 运行时 API

### Decision 4: `allowConversationAccess` 声明在 `definePluginEntry` 返回对象中

根据 OpenClaw 文档，非内置插件需要声明 `allowConversationAccess: true` 才能注册 `before_agent_reply` 等 raw conversation hook。声明位置在 `definePluginEntry` 返回的对象中（与 `id`、`name` 同级）。

### Decision 5: 单元测试 mock 从 `hooks[]` 数组改为 mock `api` 对象

现有测试通过 `definePluginEntry` 返回的 `hooks` 数组调用 handler。重构后 `definePluginEntry` 返回 `{ id, name, register(api) }`，测试需要：
- 创建 mock `api` 对象（包含 `on`、`logger`、`registerSessionExtension`）
- 调用 `register(api)`
- 验证 `api.on()` 被正确调用
- 提取注册的 handler 进行测试

这增加了测试 setup 复杂度，但确保了测试覆盖真实入口路径。

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| `allowConversationAccess` 声明位置或格式与 OpenClaw 实际要求不符 | 在实现阶段通过 OpenClaw 源码或文档确认确切字段名；若无法确认，先实现并在集成测试中验证 |
| `api.registerSessionExtension` 的 serializer/deserializer 签名与 OpenClaw 实际 API 有差异 | 使用宽松的类型定义（接受 `unknown` 入参），在运行时做防御性检查 |
| Hook 返回值模式在某些 hook 上不生效（runner 仍读取 event 突变） | 同时保留返回值和 event 突变（双重保险），待确认后再移除冗余 |
| `openclaw/plugin-sdk/plugin-entry` 的 `definePluginEntry` 在运行时不可用（OpenClaw 未内置该包） | 如果运行时注入不可用，改用本地定义相同形状的对象（duck typing），不依赖外部 import |
| 测试重构工作量大 | 保留核心测试逻辑不变，只改变 setup 和调用方式；分步迁移 |

## Migration Plan

1. **准备阶段**：在 feature branch 上工作
2. **重构 `index.ts`**：
   - 将 `definePluginEntry` 返回值改为 `{ id, name, register(api) }`
   - 在 `register(api)` 中实现所有 hook 注册
   - 修改 handler 为返回值模式
   - 添加 `allowConversationAccess: true`
   - 调用 `api.registerSessionExtension`
3. **删除 `openclaw-entry.ts`**
4. **更新 `Planner`**：移除 `registerSessionExtension()` stub，改为纯 helper 方法
5. **更新测试**：mock `api` 对象，验证 `register(api)` 行为
6. **更新 `Dockerfile.integration`**：入口路径改为 `./dist/index.js`
7. **本地验证**：`npm run build` + `npm test`
8. **集成测试**：运行 `npm run test:integration`

Rollback：如果集成测试失败，revert feature branch，保留 `openclaw-entry.ts` 作为 fallback。

## Open Questions

1. `definePluginEntry` 是否需要从 `openclaw/plugin-sdk/plugin-entry` import，还是可以本地 duck-typing？
2. `api.registerSessionExtension` 的确切签名（尤其是 `serializer`/`deserializer` 的参数和返回值类型）是什么？
3. `heartbeat_prompt_contribution` 这个 hook 名称是否在 OpenClaw 中存在？如果不存在，是否需要移除？
4. `before_agent_reply` 在 OpenClaw 最新版中是 claiming pattern（返回 `{ handled: true }`）还是观察模式？
