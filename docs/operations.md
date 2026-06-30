# Claude History 操作指南

> 一款用于浏览和管理本地 Claude Code 对话历史的桌面应用，同时支持通过飞书机器人远程交互。

---

## 目录

1. [应用概览](#应用概览)
2. [安装与构建](#安装与构建)
3. [基础操作](#基础操作)
4. [飞书桥连配置](#飞书桥连配置)
5. [飞书端操作](#飞书端操作)
6. [架构与数据流](#架构与数据流)
7. [FAQ / 故障排查](#faq--故障排查)

---

## 应用概览

### 核心功能

| 功能 | 说明 |
|------|------|
| **对话浏览** | 三栏布局浏览所有 Claude Code 对话：项目 → 会话 → 消息详情 |
| **全文搜索** | 跨对话内容的关键词检索，快速定位 |
| **Markdown 渲染** | 支持 Markdown 渲染、代码高亮、表格、图片点击放大 |
| **工具调用展示** | 20+ 种专用组件：Agent 子代理、Edit/Write diff、Bash 命令、Thinking 折叠等 |
| **主题切换** | 简约白 / 深邃黑 / 暖色调 / Monokai 四种主题 |
| **毛玻璃效果** | 原生毛玻璃（macOS vibrancy / Windows acrylic），可在设置中开关 |
| **会话恢复** | 一键在终端中恢复历史会话，继续对话 |
| **飞书桥连** | 通过多个飞书机器人分别远程驱动不同项目的 Claude Code |
| **安全删除** | 删除对话和项目（同时移除磁盘文件和数据库记录） |
| **跨平台** | macOS (DMG)、Windows (NSIS + 便携版)、Linux (AppImage) |

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Pinia |
| 桌面 | Electron 33 |
| 数据库 | SQLite (better-sqlite3) |
| Markdown | marked + DOMPurify + highlight.js |
| 飞书 SDK | @larksuiteoapi/node-sdk |
| 文档 | VitePress |

### 截图

三栏布局：左侧项目列表 → 中间对话列表 → 右侧消息详情。支持面板折叠、拖拽调整宽度。

---

## 安装与构建

### 方式一：下载安装包

从 [GitHub Releases](https://github.com/cloud-mouse/claude-history/releases) 下载最新版本：

| 平台 | 格式 |
|------|------|
| macOS | DMG、ZIP |
| Windows | NSIS 安装包、便携版 EXE |
| Linux | AppImage |

### 方式二：从源码构建

#### 前置条件

- Node.js >= 18
- pnpm（推荐）或 npm
- Xcode Command Line Tools（macOS）

```bash
# 安装 Xcode CLI Tools（macOS）
xcode-select --install
```

#### 安装依赖

```bash
git clone https://github.com/cloud-mouse/claude-history.git
cd claude-history

# 推荐 pnpm
pnpm install

# 如果 Electron 下载慢，使用镜像
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
pnpm install
```

#### 开发模式

```bash
pnpm electron:dev
```

同时启动 Vite 开发服务器 (localhost:5173) 和 Electron 窗口，支持热重载。

#### 构建打包

```bash
pnpm electron:build
```

构建产物在 `out/` 目录下。

#### 发布新版本

```bash
pnpm electron:release
```

自动构建并上传到 GitHub Releases（需要配置 GitHub Token）。

#### 运行测试

```bash
npx jest
```

测试覆盖：JSONL 解析、消息解析、文件扫描、标题提取、SQLite 存储。

---

## 基础操作

### 界面布局

```
┌──────────────┬──────────────────┬─────────────────────────────┐
│  项目列表    │   对话列表       │   消息详情                   │
│  (左栏)      │   (中栏)         │   (右栏)                     │
│              │                  │                              │
│  · 项目 A    │  · 对话 1        │  👤 用户消息                 │
│  · 项目 B    │  · 对话 2        │  🤖 Claude 回复              │
│  · 项目 C    │  · 对话 3        │  ⚙️ 工具调用                 │
│              │                  │                              │
└──────────────┴──────────────────┴─────────────────────────────┘
```

### 操作速查表

| 功能 | 操作 |
|------|------|
| **折叠/展开面板** | 点击面板分隔线旁的箭头按钮 |
| **调整面板宽度** | 拖拽面板之间的分隔线 |
| **全文搜索** | 工具栏搜索框，跨对话内容检索 |
| **项目排序** | 点击项目列表标题栏排序按钮（按时间 / 对话数量） |
| **恢复会话** | 点击「恢复会话」按钮，自动打开终端执行 `claude --resume` |
| **复制恢复命令** | 点击命令区域一键复制 |
| **展开/折叠全部** | 消息详情标题栏的「展开全部」/「收起全部」按钮 |
| **图片预览** | 点击图片全屏放大，点击遮罩或按 Escape 关闭 |
| **切换主题** | 设置 → 外观，支持 4 种主题 |
| **删除对话/项目** | 右键或点击删除按钮，弹窗确认后删除（含磁盘文件） |
| **开发者工具** | 「视图」菜单或平台默认快捷键（macOS `Cmd+Option+I`） |
| **刷新数据** | 点击项目列表顶部的刷新按钮 |

### 数据来源

应用自动扫描 `~/.claude/projects/` 目录下的 `.jsonl` 对话记录文件。

数据流：
```
磁盘 .jsonl 文件 → file-scanner 扫描 → SQLite 缓存 → Pinia Store → Vue 组件渲染
```

---

## 飞书桥连配置

通过飞书机器人远程与 Claude Code 交互，无需在电脑前也能继续对话。claude-history 支持**多个机器人并存**：每个机器人是一个独立的飞书自建应用（拥有各自的 App ID / App Secret 与 WebSocket 长连接），绑定到各自的服务工作目录，多机器人并行运行、互不干扰。你可以为不同项目各配一个机器人。

> 术语以 [CONTEXT.md](https://github.com/cloud-mouse/claude-history/blob/main/CONTEXT.md) 为准：机器人 (Bot) / 连接 (online) / 启用 (enabled) / 绑定 (binding) / 处理中 (processing)。

### 工作原理

```
飞书消息 → WebSocket (Lark SDK) → 机器人 (BotRuntime) → Claude Code CLI → 飞书卡片回复
                                        ↓
                                 JSONL 文件写入
                                        ↓
                              claude-history 刷新可见
```

每个机器人各自维护一条独立的 WebSocket 长连接，由 `BotManager` 统一管理生命周期与状态广播。

### 前提条件

1. 已安装 Claude Code CLI（终端中 `claude` 命令可用）
2. 已创建飞书自建应用（**每个机器人一个独立应用**）

### 第一步：创建飞书应用

为每个机器人重复以下步骤：

1. 访问 [飞书开放平台](https://open.feishu.cn/app) → **创建企业自建应用**
2. 记录 **App ID** 和 **App Secret**（在「凭证与基础信息」页面）
3. 在「权限管理」中开通：
   - `im:message` — 获取与发送单聊、群组消息
   - `im:message.reactions:write_only` — 发送、删除消息表情回复
   - `im:resource` — 读取消息中的资源
4. 在「事件订阅」中注册回调事件：
   - `im.message.receive_v1` — 接收消息
   - `card.action.trigger` — 卡片交互回调（权限确认按钮）
5. **发布应用**

> 每个机器人必须使用**独立的 App ID**。共用 App ID 会导致 WebSocket 连接互相踢线，无法稳定在线。

### 第二步：在 claude-history 中添加机器人

1. 点击顶部工具栏 **⚙ 齿轮按钮** 打开设置中心，切换到 **「飞书」** 标签页
2. 点击 **「添加机器人」**，填写机器人名称、App ID、App Secret、服务目录、用户白名单（可选）
3. 提交后机器人会**自动启用并连接**，在线指示器变绿即表示成功

在机器人卡片上可以：启用 / 停用、编辑、删除（需先停用并解除绑定）、切换服务目录（机器人处理消息时不允许切换，且切换会丢弃该机器人的当前绑定）。应用下次启动时，所有启用的机器人会自动重连。

### 第三步：绑定会话

每个机器人**至多一个活跃绑定**，绑定可双向发起：

- **从机器人侧**：在机器人卡片点击「绑定会话」，选择该机器人服务目录下的对话
- **从会话侧**：在对话详情页点击「绑定到飞书」，选择可绑定的机器人（须同目录且在线）

当机器人已有绑定时再绑新会话，或目标会话已被其他机器人占用，都会弹出**换绑确认**——原绑定的对话将在下一条消息时失去远程入口。

> 绑定后，飞书发送的消息会使用 `claude --resume <session-id>` 继续该会话。

### 消息处理流程

1. 用户在飞书给某个机器人发送消息
2. 该机器人回复 **敲键盘表情**（Typing reaction），表示正在处理
3. Claude Code CLI 处理请求（期间该机器人内部串行，再来消息会回「请稍候」卡片）
4. 处理完成后，移除敲键盘表情，发送结果卡片

### 权限管控

当 Claude 执行敏感操作（Bash、Write、Edit、MultiEdit）时，会暂停并发送确认卡片到飞书：

| 按钮 | 说明 |
|------|------|
| ✅ 允许 | 执行本次操作 |
| ❌ 拒绝 | 阻止本次操作 |
| 🔓 始终允许 | 本次及后续该工具调用自动通过 |

确认卡片有 **60 秒超时**，超时自动拒绝（fail-closed：无法到达任何在线机器人时直接拒绝，不静默放行）。

#### 权限模式

通过 `/permission` 命令切换（作用于当前机器人）：

| 模式 | 说明 |
|------|------|
| `default` | 敏感工具（Bash、Write、Edit）需要确认 |
| `plan` | 读取类工具自动通过，写入类工具需要确认 |
| `acceptEdits` | 文件编辑自动通过，仅 Bash 需要确认 |
| `bypass` | 所有操作自动通过，不发送确认卡片 |

也可用 `/allow <工具名>` 单独放行某个工具。

### 飞书桥连技术细节

```
feishu/
├── index.js            # 模块入口
├── bot-manager.js      # 多机器人管理器：生命周期、状态广播、切换守护
├── bot-runtime.js      # 单机器人运行时：WS 连接、消息处理、串行控制
├── commands.js         # 斜杠命令处理
├── cards.js             # 飞书卡片构建
├── permissions.js       # 权限管理（4 种模式）
├── hooks-handler.js     # 共享 Hooks HTTP 服务器（端口 19876-19886），按 botId 路由
├── claude-spawn.js      # Claude CLI 调用（含 hook settings 注入）
└── binding.js           # bot-level 绑定、文件监听、路径解析
```

**Hook 系统**：飞书模块在本地 `127.0.0.1:19876-19886` 开启一个共享 HTTP 服务器（Bearer token 认证）。每次调用 Claude CLI 时，通过 `--settings` 参数注入 `PreToolUse` hook；hook 脚本在 Claude 执行工具前向本地服务器请求权限检查，服务器按 `botId` 路由到对应机器人，从而实现飞书端确认。

**凭证安全**：App Secret 使用 Electron safeStorage 加密存储在 SQLite 数据库中（`ENC:` 前缀），不会上传到任何服务器，也不暴露给渲染进程。

### claude-history 中的飞书状态

机器人启用并绑定后，应用中会显示：

- **对话列表圆点**：被某个机器人绑定的对话前显示状态圆点
  - 🟢 绿色脉动 = 该机器人正在处理消息
  - 🟡 黄色 = 绑定但空闲
- **消息来源标签**：通过飞书发送的消息气泡上标注「🐦 来自飞书」
- **远程状态标签**：消息详情顶部显示「飞书 活跃」或「飞书 空闲」

---

## 飞书端操作

### 发送消息

在飞书中直接给**对应机器人**发消息即可与 Claude Code 对话。私聊直接发送，群聊需先 **@机器人**。消息会路由到该机器人当前的活跃绑定。

### 斜杠命令

支持中英文双语命令，**命令自动作用于收到消息的那个机器人**：

#### 基础命令

| 命令 | 中文别名 | 说明 |
|------|----------|------|
| `/help` | `/帮助` | 显示所有可用命令 |
| `/status` | `/状态` | 查看当前机器人的连接状态和绑定信息 |
| `/bind` | — | 查看当前机器人的绑定详情 |
| `/cancel` | `/取消` | 取消该机器人正在处理的任务 |

#### 会话管理

| 命令 | 中文别名 | 说明 |
|------|----------|------|
| `/new` 或 `/clear` | — | 开启全新会话 |
| `/sessions` | `/会话` | 列出当前机器人服务目录下的所有会话 |
| `/switch <序号或ID>` | — | 切换到指定会话 |
| `/history [n]` | `/历史 [n]` | 查看最近 n 条消息（默认 5，最大 20） |
| `/repeat` | — | 重新发送上一条消息 |

#### 环境配置

| 命令 | 说明 |
|------|------|
| `/model [名称]` | 查看或设置 Claude 模型（`sonnet` / `opus` / `haiku`） |
| `/system <提示>` | 发送系统提示给 Claude |
| `/confirm [on\|off]` | 开启/关闭执行确认模式（开启后每条消息需飞书端确认） |
| `/permission [mode]` | 查看或设置权限模式（`default` / `plan` / `acceptEdits` / `bypass`） |
| `/allow <工具>` | 始终允许指定工具（如 `/allow Bash`） |
| `/disallow <工具>` | 取消工具的始终允许 |

> 非 `/` 开头的消息会直接发送给 Claude 进行对话。
> 切换工作目录请到桌面端编辑机器人的「服务目录」（处理中不允许切换，切换会丢弃该机器人的绑定）。

---

## 架构与数据流

### 项目结构

```
claude-history/
├── electron/                  # Electron 主进程
│   ├── index.js               # 入口：创建窗口、初始化飞书多机器人
│   ├── preload.js             # 预加载：暴露 IPC 接口给渲染进程
│   ├── ipc-handlers.js        # IPC 通信：项目/对话/文件操作
│   ├── feishu-ipc.js          # IPC 通信：飞书机器人增删改查与绑定
│   ├── store.js               # SQLite 数据库（项目、对话、feishu_bots、feishu_bindings）
│   ├── file-scanner.js        # 扫描 ~/.claude/projects 目录
│   ├── jsonl-parser.js        # 流式 JSONL 解析
│   ├── message-parser.js      # 消息结构化解析
│   ├── markdown.js            # Markdown 渲染（主进程端）
│   ├── title-extractor.js     # 标题自动提取
│   ├── feishu-hook-script.js  # Claude Code PreToolUse hook 脚本
│   └── feishu/                # 飞书桥连模块（bot-manager / bot-runtime 等 9 个文件）
├── src/                       # Vue 渲染进程
│   ├── App.vue                # 根组件
│   ├── components/
│   │   ├── layout/            # 三栏布局组件
│   │   ├── chat/              # 消息内容渲染
│   │   ├── tools/             # 工具调用展示（20+ 组件）
│   │   ├── feishu/            # 飞书机器人管理组件（编辑/选择/换绑）
│   │   ├── settings/          # 设置中心各 tab（飞书/外观/统计/关于）
│   │   └── common/            # 通用 UI 组件
│   ├── stores/                # Pinia 状态管理
│   ├── styles/                # 全局样式（4 主题 CSS 变量）
│   └── utils/                 # 工具函数
├── tests/                     # 单元测试
├── docs/                      # VitePress 文档站点
├── build/                     # 应用图标
└── preview/                   # 截图
```

### 数据库表结构

SQLite 数据库位于 `~/.claude/history-viewer.db`：

| 表名 | 用途 |
|------|------|
| `projects` | 项目信息（名称、路径、更新时间） |
| `conversations` | 对话记录（关联项目、文件路径、标题） |
| `feishu_bots` | 飞书机器人（名称、App ID 全局唯一、加密 App Secret、服务目录、白名单、启用状态） |
| `feishu_bindings` | 会话绑定（按 `bot_id` 唯一，关联 jsonl_path / session_id / project_dir） |

> 从单机器人版本升级时，旧的 `feishu_config` 单行配置会自动迁移为 `feishu_bots` 的第 1 条记录。

### 飞书桥连数据流

```
飞书用户向某机器人发送 "帮我写个函数"
  ↓
该机器人的 Lark SDK WebSocket 接收消息
  ↓
BotRuntime 消息处理（机器人内部串行：处理中再来消息回「请稍候」）
  ↓
添加 Typing reaction（敲键盘）
  ↓
spawnClaude() → 启动 Claude CLI 进程
  ├── 生成 hook settings（注入 PreToolUse hook）
  ├── 如该机器人有绑定 → --resume <session-id>
  ├── 如指定模型 → --model <model>
  └── 解析服务目录 → cwd 参数
  ↓
Claude CLI 执行中...
  ├── 遇到敏感工具 → hook 脚本 → HTTP POST → hooks-handler
  │   ↓
  │   按 botId 路由到对应机器人 → 权限检查 → 不自动通过 → 发送确认卡片到飞书
  │   ↓
  │   用户点击 允许/拒绝 → 飞书卡片回调 → 机器人处理卡片动作
  │   ↓
  │   hooks-handler 返回 allow/deny → Claude 继续/中止
  ↓
Claude CLI 完成 → 解析 stream-json 输出 → 提取 result
  ↓
移除 Typing reaction
  ↓
发送结果卡片到飞书
  ↓
通知渲染进程刷新 JSONL 数据
  ↓
claude-history 显示最新消息
```

### 开发相关命令

| 命令 | 用途 |
|------|------|
| `pnpm dev` | 仅启动 Vite 开发服务器 |
| `pnpm electron:dev` | 同时启动 Vite + Electron（开发模式） |
| `pnpm build` | 仅构建前端 |
| `pnpm electron:build` | 构建前端 + Electron 打包 |
| `pnpm electron:release` | 构建并发布到 GitHub Releases |
| `pnpm docs:dev` | 启动文档站点开发服务器 |
| `pnpm docs:build` | 构建文档站点 |

---

## FAQ / 故障排查

### 安装相关

#### Electron 下载失败

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
pnpm install
```

#### macOS 提示"已损坏，无法打开"

应用未做 Apple 代码签名，从浏览器下载的安装包会被 Gatekeeper 隔离。**应用本身没有损坏**，在「终端」执行下面命令解除隔离：

```bash
xattr -cr "/Applications/Claude History.app"
```

> 也可以在「系统设置 → 隐私与安全性」里点击「仍要打开」。

#### 构建失败

确保已安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

### 飞书桥连相关

#### 机器人一直不在线（状态不变绿）

检查以下几点：

1. **凭证填错**：在编辑弹窗里核对 App ID / App Secret
2. **飞书应用未发布**：需要在飞书开放平台发布应用
3. **App ID 被复用**：同一个 App ID 不能配给多个机器人，也不能同时被其他程序使用，否则会互相踢线
4. **权限不足**：确认已开通 `im:message`、`im:message.reactions:write_only`、`im:resource` 权限
5. **事件未注册**：确认注册了 `im.message.receive_v1` 和 `card.action.trigger` 事件
6. **缺少服务目录**：机器人必须配置服务目录才能正常启用
7. **连接失败**：查看终端输出的错误日志

#### 飞书消息没有出现在 claude-history 中

1. 确认机器人已启用且在线
2. 确认该机器人已绑定会话（未绑定时飞书会提示「未绑定会话」）
3. 点击顶部的刷新按钮更新对话列表

#### 对话列表中没有状态圆点

圆点需要机器人在线且绑定了该会话时才会显示。如果刚刚开始对话，点击刷新按钮更新状态。

#### 飞书中提示「未绑定会话」

说明收到消息的机器人还没有绑定到 Claude Code 会话。请在 claude-history 桌面端为该机器人绑定一个对话（从机器人卡片或对话详情页均可）。

#### 权限确认卡片没有出现

1. 确认权限模式不是 `bypass`（用 `/status` 查看）
2. 确认飞书应用已开通 `card.action.trigger` 事件回调
3. 检查 hooks-handler 是否正常启动（查看终端日志中飞书相关输出）

#### 如何停用某个机器人

在该机器人卡片上点击「停用」即可，会断开它的 WebSocket 连接。下次启动应用时该机器人不会自动重连（除非再次启用）。

#### 切换服务目录后机器人绑定消失了

这是预期行为。切换服务目录会丢弃该机器人当前的绑定（旧会话属于旧目录）。请切换后重新绑定该目录下的会话。机器人正在处理消息时不允许切换。

#### 支持同时绑定多个飞书聊天吗

可以——通过**多个机器人**实现。每个机器人独立持有自己的绑定并发运行；但**单个机器人**同时只能绑定一个会话。如需让多个飞书聊天分别驱动不同会话，为每个聊天创建一个独立的机器人（独立 App ID）即可。

#### Claude Code 超时

默认超时 5 分钟（300 秒）。可以通过 `/cancel` 手动取消正在处理的任务。

### 数据相关

#### 数据存储位置

- **Claude 对话文件**：`~/.claude/projects/` 目录下的 `.jsonl` 文件
- **应用数据库**：`~/.claude/history-viewer.db`（SQLite）
- **构建产物**：项目根目录 `out/`

#### 如何完全清除数据

删除数据库文件即可：

```bash
rm ~/.claude/history-viewer.db
```

应用会在下次启动时自动重建。原始 `.jsonl` 对话文件不受影响。

#### 标题显示不准确

应用会自动从对话内容提取标题。如果标题不准确，可能是旧版提取逻辑的结果，可以删除数据库重新提取：

```bash
rm ~/.claude/history-viewer.db
```

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + Q` | 退出应用 |
| `Cmd/Ctrl + C` | 复制 |
| `Cmd/Ctrl + V` | 粘贴 |
| `Cmd+Option+I` (macOS) / `Ctrl+Shift+I` (Win/Linux) | 开发者工具（v1.5.1 起改用平台默认快捷键，`⌘K` 已释放） |
| `Escape` | 关闭图片预览 |
