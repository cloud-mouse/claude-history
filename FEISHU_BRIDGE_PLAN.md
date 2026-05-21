# 飞书桥连集成方案

## Context

用户希望通过飞书远程控制本地 Claude Code，实现：远程下发任务、结果推送、脱离电脑操作。

## 架构决策

**最终方案**：直接使用 Lark SDK（`@larksuiteoapi/node-sdk`）建立 WebSocket 长连接，不依赖 cc-connect 中间件。

原因：
- 减少外部依赖，用户体验更简洁（无需额外安装 cc-connect）
- Lark SDK 原生支持飞书卡片消息，交互体验更好
- 配置和状态全部存储在 claude-history 自身的 SQLite 数据库中，管理更统一

## 工作原理

```
飞书消息 → WebSocket (Lark SDK) → FeishuBridge → Claude Code CLI → 飞书卡片回复
                                     ↓
                              JSONL 文件写入
                                     ↓
                           claude-history 刷新可见
```

消息处理流程：`收到消息 → 确认卡片 → 生成 Claude 响应 → 结果卡片 → 通知 UI 刷新`

## 功能范围

### 已实现

1. **设置弹窗**（`SettingsModal.vue`）：飞书桥连开关 + App ID / App Secret 配置 + 连接状态 + 绑定信息
2. **WebSocket 连接**（`FeishuBridge`）：通过 Lark SDK 的 `createLarkChannel` 建立长连接，自动重连
3. **消息处理**：飞书消息 → Claude Code CLI spawn → 飞书卡片回复（三阶段：确认 → 处理 → 回复）
4. **会话绑定**：通过 UI 绑定按钮或飞书命令绑定 Claude Code 会话
5. **对话列表标记**：有远程会话的对话显示绿色脉动圆点
6. **消息来源标签**：气泡中标注 "🐦 来自飞书"
7. **17+ 条斜杠命令**：含中英文别名
8. **模型切换**：远程切换 Claude 模型（sonnet / opus / haiku）
9. **工作目录切换**：远程切换工作目录
10. **历史消息查看**：远程查看最近 N 条消息
11. **会话管理**：创建新会话、列出会话、切换会话
12. **JSONL 文件监听**：自动检测新消息并通知 UI 刷新
13. **自动启动**：应用启动时如果之前已启用，自动重连

### 未实现（明确排除）

- 在 app 中直接发送消息（所有交互在飞书端完成）
- 多个飞书聊天同时绑定
- 文件/图片上传
- 实时推送通知（用户点刷新或切换对话即可看到新内容）

## 文件清单

**新增文件** (5 个)：

```
electron/feishu-bridge.js              # 飞书桥连核心类（WebSocket、消息处理、命令系统、CLI spawn）
electron/feishu-ipc.js                 # 飞书 IPC 处理器（8 个通道）
src/stores/feishu.js                   # Pinia Store（连接状态、配置、绑定）
src/components/feishu/SettingsModal.vue # 设置弹窗 UI
FEISHU_BRIDGE_PLAN.md                  # 本文档
```

**修改文件** (10 个)：

```
electron/index.js          # 注册飞书 IPC、自动启动/停止桥连
electron/preload.js        # 添加 8 个 feishu* API 方法 + 2 个事件监听
electron/store.js          # 新增 feishu_config 和 feishu_bindings 表
electron/ipc-handlers.js   # 无修改（飞书 IPC 独立模块）
src/App.vue                # 设置按钮 + SettingsModal + Store 初始化 + 事件监听
src/components/layout/ConversationList.vue   # 飞书状态圆点
src/components/layout/MessageThread.vue      # 远程状态标签 + 绑定按钮
src/components/chat/ChatBubble.vue           # "来自飞书" 消息标签
package.json               # 添加 @larksuiteoapi/node-sdk 依赖
docs/.vitepress/config.js  # 导航栏添加飞书桥连入口
```

**文档文件** (2 个)：

```
docs/feishu-bridge.md      # VitePress 飞书桥连使用文档
README.md                  # 更新功能特性、项目结构等
```

## 斜杠命令一览

| 命令 | 中文别名 | 说明 |
|------|----------|------|
| `/help` | `/帮助` | 显示所有命令 |
| `/status` | `/状态` | 连接状态和绑定信息 |
| `/bind` | — | 查看绑定详情 |
| `/cancel` | `/取消` | 取消当前任务 |
| `/new` `/clear` | — | 开启新会话 |
| `/sessions` | `/会话` | 列出项目会话 |
| `/switch <id>` | — | 切换会话 |
| `/history [n]` | `/历史 [n]` | 查看最近消息 |
| `/repeat` | — | 重复上一条消息 |
| `/cd <路径>` | — | 切换工作目录 |
| `/model [名称]` | — | 查看/设置模型 |
| `/system <提示>` | — | 发送系统提示 |

## 数据库设计

SQLite 数据库（`~/.claude/history-viewer.db`）新增两个表：

### feishu_config

| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT PRIMARY KEY | 配置键名 |
| value | TEXT | 配置值 |

存储项：`app_id`、`app_secret`、`enabled`

### feishu_bindings

| 字段 | 类型 | 说明 |
|------|------|------|
| chat_id | TEXT PRIMARY KEY | 飞书聊天 ID（或 `_pending_` 前缀） |
| chat_type | TEXT | 聊天类型（p2p / group） |
| jsonl_path | TEXT | JSONL 文件路径 |
| session_id | TEXT | Claude Code 会话 ID |
| project_dir | TEXT | 工作目录 |
| active | INTEGER | 是否活跃绑定 |
| created_at | TEXT | 创建时间 |

## IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `feishu:getStatus` | 渲染→主 | 获取连接状态 |
| `feishu:getConfig` | 渲染→主 | 获取飞书配置 |
| `feishu:saveConfig` | 渲染→主 | 保存 App ID / Secret |
| `feishu:start` | 渲染→主 | 启动 WebSocket 连接 |
| `feishu:stop` | 渲染→主 | 断开连接 |
| `feishu:bindSession` | 渲染→主 | 绑定会话到飞书 |
| `feishu:unbindSession` | 渲染→主 | 解除绑定 |
| `feishu:getBinding` | 渲染→主 | 获取当前绑定 |
| `feishu:statusChanged` | 主→渲染 | 状态变化通知 |
| `feishu:jsonlChanged` | 主→渲染 | JSONL 文件变更通知 |

## 关键技术决策

1. **Lark SDK 直连**：使用 `createLarkChannel` 建立 WebSocket，不依赖 cc-connect
2. **飞书卡片消息**：使用 schema 2.0 交互卡片，提供丰富的消息展示
3. **Pending binding 模式**：绑定使用 `_pending_` 前缀的 chatId，首条飞书消息到达时自动关联
4. **SQLite 存储**：配置和绑定信息存储在本地 SQLite 数据库中，不依赖外部配置文件
5. **安全**：App Secret 仅在主进程中使用，不暴露给渲染进程
6. **优雅降级**：未配置时设置弹窗显示"未配置"状态，不影响核心功能使用
7. **CLI spawn**：使用 `child_process.spawn` 调用 Claude Code CLI，支持 `--resume` 和 `--model` 参数
