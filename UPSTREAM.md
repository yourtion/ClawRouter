# Upstream Sync Status

本文档记录从上游 [BlockRunAI/ClawRouter](https://github.com/BlockRunAI/ClawRouter) 移植更新的状态。

## 当前同步状态

**最后更新**: 2026-02-11

**上游仓库**: https://github.com/BlockRunAI/ClawRouter

**上游分支**: `main`

**上游 HEAD**: `ec50981` (test: handle known OpenClaw Windows bug gracefully)

**本地分支**: `main`

**本地仓库**: https://github.com/yourtion/ClawRouter

**本地分支**: `main`

**本地 HEAD**: `34f2847` (chore: add prepublishOnly script to run tests and build)

### 同步点

本地 `main` 分支目前移植了上游以下 commits 之前的所有改进：

- 上游 `3cf17cf` (2026-02-10)
- 本地包含从 `3cf17cf` 之前的所有有价值的改进

**未同步的上游 commits**: `3cf17cf` ~ `ec50981` (约 21 个 commits)

### 已同步的上游 Commit

| 上游 Commit | 日期 | 说明 | 本地 Commit | 状态 |
|-----------|------|------|------------|------|
| `3586803` | 2026-02-10 | fix: sanitize tool IDs to match Anthropic's pattern (#18) | `b262a10` | ✅ 已移植 |
| `3cf17cf` | 2026-02-10 | feat: Phase 1 & 2 resilience fixes - prevent silent proxy death | `7ebf6ac` | ✅ 已移植 |
| `8fa336e` | 2026-02-11 | fix: prevent install command from hanging by skipping proxy startup | `7ebf6ac` | ✅ 已移植 |
| `e3059e9` | 2026-02-09 | feat: sync models with BlockRun API, add o4-mini and nvidia/gpt-oss-20b | - | ⚠️ 需审查 |
| `ac3fe24` | 2026-02-11 | test: fix Test 5 to avoid config corruption on reinstall | - | ⚠️ 未移植 |

### 已移植的提交详情

#### 1. Commit `3586803` - 工具 ID 清理修复

**问题**: Anthropic API 要求 tool_use.id 匹配模式 `^[a-zA-Z0-9_-]+$`，但某些客户端发送包含非法字符的 ID

**解决方案**:
- 添加 `sanitizeToolIds()` 函数
- 支持 OpenAI 格式 (tool_calls[].id, tool_call_id)
- 支持 Anthropic 格式 (tool_use.id, tool_result.tool_use_id)

**影响文件**:
- `src/proxy.ts` (+128 行)

#### 2. Commit `3cf17cf` - 弹性修复

**问题**: HTTP 代理在运行 4+ 小时后可能静默死亡

**解决方案**:
- Phase 1: `safeWrite()`, `canWrite()`, `finished()` 包装器
- Phase 2: Socket 超时（5分钟），server.close() 超时（4秒）

**影响文件**:
- `src/proxy.ts` (+148 行)
- `test/resilience-errors.ts` (新测试)
- `test/resilience-lifecycle.ts` (新测试)
- `test/resilience-stability.ts` (新测试)

#### 3. Commit `8fa336e` - 安装模式检测

**问题**: 安装命令期间代理启动导致挂起

**解决方案**:
- 添加 `isInstallMode()` 函数
- 检测 `openclaw plugins install/uninstall`
- 跳过代理启动

**影响文件**:
- `src/index.ts`

### 未移植的上游内容

以下内容因与 multi-provider 架构不兼容而**未移植**:

#### 不兼容的架构

- ❌ **x402 支付系统** - 与 API key 认证不兼容
- ❌ **balance 和 payment-cache 系统** - 与 multi-provider 架构不兼容
- ❌ **删除 multi-provider 相关文件的提交** - 本地架构需要这些文件

#### 需要手动审查

- ⚠️ **Commit `e3059e9`** - 模型同步更新
  - 包含 o4-mini, nvidia/gpt-oss-20b 等新模型
  - 需要手动审查与本地 models.ts 的差异
  - 可能包含 x402 特定代码需要过滤

#### 可选改进

- ⚠️ **Commit `cdbcd55`** - 路由准确性改进
  - 提高 REASONING 阈值从 0.25 到 0.40
  - 优化 agenticTask 权重
  - 需要检查是否与 multi-provider 路由兼容

- ⚠️ **Commit `ac3fe24`** - Test 5 reinstall 修复
  - 脚本相关的测试修复
  - 需要检查本地是否需要

## 下次同步步骤

1. **检查上游新提交**:
   ```bash
   git fetch upstream main
   git log origin/main..upstream/main --oneline
   ```

2. **审查有价值的提交**:
   - 优先级 1: Bug 修复（工具 ID、弹性、稳定性）
   - 优先级 2: 脚本和文档改进
   - 优先级 3: 路由和模型更新（需手动审查）

3. **Cherry-pick 或手动移植**:
   - 对于纯代码修复: `git cherry-pick <commit>`
   - 对于需要适配的提交: 手动合并

4. **更新本文档**:
   - 记录新移植的提交
   - 更新未移植列表

5. **运行测试验证**:
   ```bash
   npm run test:all
   npm run build
   ```

6. **提交并推送**:
   ```bash
   git add .
   git commit -m "chore: sync upstream changes"
   git push
   ```

## 架构差异

### 上游 (BlockRunAI/ClawRouter)
- 使用 x402 区块链支付
- 使用 balance 系统追踪余额
- 使用 payment-cache 缓存支付签名
- 单一 BlockRun provider

### 本地 (yourtion/ClawRouter)
- 使用 API key 认证
- Multi-provider 架构（支持 OpenRouter, NVIDIA 等）
- 配置文件: `~/.openclaw/clawrouter/providers.json`
- 无区块链依赖

## 相关链接

- 上游仓库: https://github.com/BlockRunAI/ClawRouter
- 本地仓库: https://github.com/yourtion/ClawRouter
- 上游 Issue #17: Tool ID pattern validation
- 上游 PR #18: Tool ID sanitization
