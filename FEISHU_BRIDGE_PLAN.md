# 飞书桥连集成方案

## Context

用户希望通过飞书远程控制本地 Claude Code：远程下发任务、结果推送、脱离电脑操作。本方案已从早期的「单机器人 + 单绑定」演进为**多机器人（multi-bot）架构**——每个机器人是一个独立的飞书自建应用，绑定到各自的服务工作目录，多机器人并发运行。

> 术语以 [`CONTEXT.md`](./CONTEXT.md) 为准：机器人 (Bot) / 连接 (online) / 绑定 (binding, per-bot) / 处理中 (processing)。

## 架构决策

**最终方案**：直接使用 Lark SDK（`@larksuiteoapi/node-sdk`）建立 WebSocket 长连接，不依赖 cc-connect 中间件；支持多个机器人并存。

原因：

- 减少外部依赖，用户体验更简洁（无需额外安装 cc-connect）
- Lark SDK 原生支持飞书卡片消息，交互体验更好
- 配置和状态全部存储在 claude-history 自身的 SQLite 数据库中，管理统一
- 多机器人模型让不同项目/飞书聊天各自独立驱动，互不干扰

## 工作原理

```
飞书消息 ──→ WebSocket (Lark SDK) ──→ 机器人 (BotRuntime) ──→ Claude Code CLI ──→ 飞书卡片回复
  (每个机器人一条独立 WS)                    │
                                             ↓
                                      JSONL 文件写入
                                             ↓
                                      claude-history 刷新可见
```

每个机器人（`BotRuntime`）维护自己的 WebSocket 长连接与消息处理循环，由 `BotManager` 统一管理生命周期与状态广播。

- **消息处理流程**：收到消息 → Typing 表情回应 → 生成 Claude 响应 → 移除表情 → 结果卡片 → 通知 UI 刷新
- **权限管控流程**：Claude 调用敏感工具 → Hook 拦截 → 飞书确认卡片 → 用户允许/拒绝 → 继续执行

## 多机器人模型

### 三维状态

| 状态 | 维度 | 说明 |
|------|------|------|
| `enabled` | 持久化 | 用户配置的开关意图，存 DB |
| `online` | 运行时 | WebSocket 是否实际建立连接，UI 反映此状态 |
| `processing` | 运行时 | 该机器人是否正在处理一条消息 |

应用启动时，所有 `enabled` 的机器人自动重连。停止机器人是逻辑停止 + 尽力断开，安全边界是 `processing` 守护（SDK 未暴露公开的强制停止接口），而非立即关闭 socket。

### 并发模型

- **机器人之间并行**：每个机器人是独立的 `BotRuntime` 实例，消息处理互不阻塞。
- **机器人内部串行**：`_withProcessing(chatId, fn)` 互斥——机器人正在处理时若再来消息，直接回「⏳ 请稍候，正在处理上一条消息」卡片，不排队。

### 绑定规则（bot-level）

- 每个机器人**至多一个活跃绑定**（`feishu_bindings.bot_id` UNIQUE）。
- 到达某机器人的消息**只路由到它自己的活跃绑定，与飞书 chat_id / 发送者无关**；`chat_id` 仅用于回复到来源聊天。
- 重新绑定某机器人会**覆盖**它的单条绑定行，原绑定的对话在下一条消息时失去远程入口（in-flight 的 spawn 仍在原会话跑完）。
- 切换机器人的 `project_dir` 会**丢弃其当前绑定**（不保留快照），且要求机器人非 `processing`。
- 一个会话只能绑定到 `project_dir` 匹配且 `online` 的机器人。

### App ID 全局唯一

数据库层 `feishu_bots.app_id UNIQUE` + 应用层 guard（重复时抛「该 app_id 已被其他机器人使用」）。共用 App ID 会导致 WebSocket 连接互相踢线，因此必须每个机器人一个独立飞书应用。

## 文件清单

### 飞书模块（`electron/feishu/`）

```
index.js            # 模块入口
bot-manager.js      # 多机器人管理器：生命周期、状态广播、切换守护
bot-runtime.js      # 单机器人运行时：WS 连接、消息处理、generation 守护、_withProcessing 串行
commands.js         # 15 条斜杠命令（中英文别名）
cards.js            # 飞书卡片构建（card schema 2.0）
permissions.js      # 权限管理（4 种模式 + 敏感工具判定）
hooks-handler.js    # 共享 Hooks HTTP 服务器（端口 19876-19886），按 botId 路由
claude-spawn.js     # Claude CLI 调用（含 hook settings 注入）
binding.js          # bot-level 绑定、文件监听、路径解析
```

### Electron 主进程

```
feishu-ipc.js       # 飞书 IPC 处理器（bot 增删改查、绑定、状态）
feishu-hook-script.js  # Claude Code PreToolUse hook 脚本
store.js            # SQLite：feishu_bots / feishu_bindings 表、凭证加密、旧表迁移
```

### 渲染进程（Vue）

```
src/components/settings/FeishuSettingsTab.vue  # 设置中心「飞书」tab：机器人列表、统计、增删改、绑定
src/components/feishu/BotEditModal.vue          # 机器人创建/编辑弹窗
src/components/feishu/BotSessionPicker.vue      # 从机器人侧选择会话
src/components/feishu/BindBotPicker.vue         # 从会话侧选择可绑定机器人（同目录且在线）
src/components/feishu/RebindConfirmModal.vue    # 换绑确认弹窗
src/components/common/ConfirmDialog.vue         # 通用确认弹窗（删除/切换目录，支持嵌套 zIndex）
src/stores/feishu.js                            # Pinia store：bots 列表 + 统计（total/online/bound/idle）
```

## 数据库设计

SQLite（`~/.claude/history-viewer.db`）两张表：

### feishu_bots

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 机器人主键 |
| name | TEXT NOT NULL | 机器人名称 |
| app_id | TEXT NOT NULL **UNIQUE** | 飞书应用 App ID（全局唯一） |
| app_secret | TEXT | App Secret（`ENC:` 前缀 + base64，safeStorage 加密） |
| project_dir | TEXT | 服务工作目录 |
| allowed_users | TEXT | 用户白名单（CSV 格式 `open_id` 列表） |
| enabled | INTEGER | 是否启用（0/1） |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

### feishu_bindings

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | 绑定主键 |
| bot_id | INTEGER NOT NULL **UNIQUE** REFERENCES feishu_bots(id) ON DELETE CASCADE | 所属机器人（每 bot 至多一条） |
| jsonl_path | TEXT NOT NULL | 会话 JSONL 文件路径 |
| session_id | TEXT NOT NULL | Claude Code 会话 ID |
| project_dir | TEXT NOT NULL | 工作目录 |
| active | INTEGER | 是否活跃（0/1） |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

### 迁移

从单机器人版本升级时：检测旧的 `feishu_config`（单行）与旧 `feishu_bindings`（以 `chat_id` 为键）→ 重命名旧表为 `_legacy` → 建新表 → 将旧配置迁移为 bot #1、迁移至多一条旧绑定到 bot #1 → 标记 `app_settings.feishu_multi_bot_migrated = '1'`，保证幂等。

## IPC 通道

### 渲染 → 主（`ipcRenderer.invoke`）

| 通道 | 说明 |
|------|------|
| `feishu:getStatus` | 获取所有机器人状态 |
| `feishu:createBot` | 创建机器人（name/appId/appSecret/projectDir/allowedUsers） |
| `feishu:updateBot` | 更新机器人配置（App ID 不可改，切换目录需非 processing） |
| `feishu:deleteBot` | 删除机器人（需先停用且解绑） |
| `feishu:toggleBot` | 启用/停用 |
| `feishu:listBindableBots` | 列出可绑定到某目录会话的机器人 |
| `feishu:bindSessionToBot` | 绑定会话（若已占用返回 `needsRebind`） |
| `feishu:rebindSessionToBot` | 确认换绑 |
| `feishu:unbindBot` | 解除机器人绑定 |
| `feishu:getBinding` | 获取某会话的绑定 |

### 主 → 渲染（`webContents.send`）

| 通道 | 说明 |
|------|------|
| `feishu:statusChanged` | 机器人状态变化广播（含全部 bots） |
| `feishu:jsonlChanged` | JSONL 文件变更通知（`{jsonlPath, sessionId, botId}`） |

### 错误码

`BOT_PROCESSING`（处理中拒绝切换）、`BOT_ONLINE`（在线拒绝删除）、`BOT_BOUND`（绑定中拒绝删除）、`NEEDS_PROJECT_DIR`（启用需先配置目录）。

## 斜杠命令一览

命令**自动作用于收到消息的那个机器人**。

| 命令 | 中文别名 | 说明 |
|------|----------|------|
| `/help` | `/帮助` | 显示所有命令 |
| `/status` | `/状态` | 当前机器人状态与绑定 |
| `/bind` | — | 查看当前绑定 |
| `/cancel` | `/取消` | 取消正在处理的任务 |
| `/new` `/clear` | — | 开启新会话 |
| `/sessions` | `/会话` | 列出服务目录下的会话 |
| `/switch <id>` | — | 切换会话 |
| `/history [n]` | `/历史 [n]` | 查看最近消息 |
| `/repeat` | — | 重复上一条消息 |
| `/model [名称]` | — | 查看/设置模型 |
| `/system <提示>` | — | 发送系统提示 |
| `/confirm [on\|off]` | — | 执行确认开关 |
| `/permission [mode]` | `/权限` | 查看/设置权限模式 |
| `/allow <工具>` | — | 始终允许工具 |
| `/disallow <工具>` | — | 取消始终允许 |

## 关键技术决策

1. **Lark SDK 直连**：`WSClient` + `EventDispatcher` 建立 WebSocket，不依赖 cc-connect。
2. **多机器人并发**：每个机器人独立 `BotRuntime` + WS 连接，`BotManager` 统一管理生命周期与状态广播。
3. **App ID 全局唯一**：DB `UNIQUE` 约束 + 应用层 guard，杜绝踢线。
4. **bot-level 单绑定**：`feishu_bindings.bot_id UNIQUE`；消息路由只看 bot 活跃绑定，不看 chat_id。
5. **generation 守护**：每次启停/重连递增 generation，事件处理时校验，防止 stale 事件污染。
6. **bot 内串行**：`_withProcessing` 互斥，处理中再来消息回「请稍候」卡片。
7. **切换目录守护**：`processing` 时拒绝切换；切换会丢弃该 bot 当前绑定（C3），in-flight spawn 在旧会话跑完。
8. **共享 Hooks HTTP Server**：单服务器（端口 19876-19886，Bearer token 认证）按 `botId` 路由到对应 `BotRuntime`，敏感工具判定（Bash/Write/Edit/MultiEdit）。
9. **fail-closed 权限**：敏感工具无法到达任何在线机器人时直接 deny，不静默放行。
10. **凭证安全**：App Secret 用 Electron safeStorage 加密（`ENC:` 前缀 + base64），仅主进程解密，不暴露给渲染进程，不上传任何服务器。
11. **优雅降级**：未配置机器人时飞书 tab 显示空状态，不影响核心功能。
