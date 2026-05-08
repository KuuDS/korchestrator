## 1. 重构 `src/index.ts` 入口点

- [x] 1.1 修改 `definePluginEntry` 返回值为 `{ id, name, register(api) }` 形状，添加 `allowConversationAccess: true`
- [x] 1.2 在 `register(api)` 内实现 `gateway_start` / `gateway_stop` hook 注册（调用 `api.on`）
- [x] 1.3 在 `register(api)` 内实现 `before_agent_reply` hook 注册，handler 返回 `{ syntheticReply?: string } | undefined`
- [x] 1.4 在 `register(api)` 内实现 `before_prompt_build` hook 注册，handler 返回 `{ prependContext?: string } | undefined`
- [x] 1.5 在 `register(api)` 内实现 `before_agent_finalize` hook 注册，handler 返回 `{ action: "revise" | "finalize", reason?: string }`
- [x] 1.6 在 `register(api)` 内实现 `subagent_spawning` hook 注册，handler 返回 `{ block?: boolean, reason?: string } | undefined`
- [x] 1.7 在 `register(api)` 内实现其余 observation-only hooks（`subagent_delivery_target`, `subagent_spawned`, `subagent_ended`, `before_tool_call`, `after_tool_call`, `agent_end`, `heartbeat_prompt_contribution`）
- [x] 1.8 移除旧版 `hooks[]` 数组返回逻辑（保留 `PluginEntry` 接口作为类型定义）
- [x] 1.9 在 `register(api)` 中调用 `api.registerSessionExtension("plan_state", { serializer, deserializer })`，将序列化/反序列化逻辑从 `Planner` 移入此处

## 2. 简化 `src/planner.ts`

- [x] 2.1 移除 `registerSessionExtension()` 空 stub 方法
- [x] 2.2 保留 `readPlanState(session)` 和 `writePlanState(session, plan)` 作为纯 helper（用于本地测试和不通过 Session Extension 的场景）
- [x] 2.3 确保 `Planner` 不再依赖任何 OpenClaw 运行时 API，仅依赖传入的参数

## 3. 删除或清理 `src/openclaw-entry.ts`

- [x] 3.1 将 `openclaw-entry.ts` 中独有的逻辑（如有）合并到 `index.ts`
- [x] 3.2 删除 `src/openclaw-entry.ts` 文件
- [x] 3.3 无需更新 `tsconfig.json`（文件自动从编译中排除）

## 4. 更新类型定义

- [x] 4.1 更新 `src/contracts/hooks.ts` 中的 `OpenClawApi` stub，补充 `registerSessionExtension`、`on`、`logger` 等方法签名
- [x] 4.2 保留 `HookContext` 作为 legacy 兼容类型，新增 `buildLegacyContext(api, event)` bridge helper
- [x] 4.3 更新 `PluginEntry` 类型定义以匹配 OpenClaw SDK 契约（含 `register(api)` 和 `allowConversationAccess`）

## 5. 更新测试

- [x] 5.1 重构 `tests/hooks.test.ts`：创建 mock `api` 对象（含 `on`、`logger`、`registerSessionExtension`），调用 `register(api)`，验证 hook 注册
- [x] 5.2 重构 `tests/blackboard-integration.test.ts`：使用 mock `api` 替代旧版 `PluginEntry` 测试路径
- [x] 5.3 已有测试间接验证 `registerSessionExtension` 被调用（通过 mock api 断言）
- [x] 5.4 已有测试验证决策型 hook handler 返回值（通过 mock api handler 返回值断言）
- [x] 5.5 所有测试通过（536/536），`npm run test` 无失败

## 6. 更新构建与部署

- [x] 6.1 更新 `Dockerfile.integration`：将 `openclaw.extensions` 路径从 `./dist/openclaw-entry.js` 改为 `./dist/index.js`
- [x] 6.2 验证 `npm run build` 成功且 `dist/index.js` 导出的对象可被 OpenClaw 识别
- [x] 6.3 验证 `npm run typecheck` 无类型错误

## 7. 代码审查与验证

- [x] 7.1 运行 `npm run build` 通过
- [x] 7.2 运行 `npm run test` 通过，536/536（覆盖率未下降）
- [x] 7.3 运行 `npm run typecheck` 通过
- [x] 7.4 检查 `dist/` 输出，确认 `openclaw-entry.js` 不再生成
