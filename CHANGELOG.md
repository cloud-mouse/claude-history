# 更新日志 (Changelog)

本文件记录 [Claude History](https://github.com/cloud-mouse/claude-history) 的全部发布历史。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

- 🆕 **新增**　新增加的功能
- 🎨 **改进**　对已有功能的变更、优化与打磨
- 🐛 **修复**　问题修复
- 📦 **打包**　构建、CI、发布流程相关变更

---

## [Unreleased]

尚未发布的内容将在此处汇总。

---

## [1.6.0] — 2026-06-30

### 🆕 新增

- **飞书多机器人**：从单机器人升级为多机器人架构——每个机器人是一个独立的飞书自建应用（独立 App ID/Secret + WebSocket 长连接），绑定到各自的服务工作目录，多机器人并发运行、互不干扰。可为不同项目各配一个机器人。
- **per-bot 会话绑定**：每个机器人独立持有一个活跃绑定，支持从机器人侧 / 会话侧双向发起与换绑；消息按机器人路由，不再依赖 chat_id。
- **服务目录切换**：在设置中切换机器人的服务工作目录（处理中不允许切换，切换会丢弃该机器人当前的绑定）。
- **用户白名单**：每个机器人可配置 `open_id` 白名单。

### 🎨 改进

- **设置中心飞书 tab**：飞书配置整合进设置中心，以卡片形式管理多个机器人，并提供总数 / 在线 / 绑定中 / 空闲的概览统计。
- **凭证安全**：App Secret 改用 `decryptString` 解密，密文以 `ENC:` 前缀加密存储；移除 cc-connect 凭证迁移兜底与 smol-toml 依赖。

### 🐛 修复

- **授权卡片 "no reachable bot"**：`getRuntime` 归一化 `botId` 类型，修复权限确认卡片找不到可达机器人的问题。
- **项目列表工作目录**：项目列表显示真实工作目录而非 jsonl slug。

> 架构决策见 [ADR-0003](./docs/adr/0003-feishu-multi-bot.md)，术语定义见 [CONTEXT.md](./CONTEXT.md)。

---

## [1.5.2] — 2026-06-28

### 🐛 修复

- **会话恢复定位准确**：恢复会话时改用 JSONL 中记录的真实 `cwd` 解析项目目录，弃用存在歧义的目录名解码方式，解决了在终端中恢复会话时定位到错误项目的问题。

### 🎨 改进

- **应用图标微调**：在 v1.5.1 全新图标基础上进一步优化视觉表现。

## [1.5.1] — 2026-06-28

### 🎨 改进

- **原生菜单栏标准化**：原先挤在单个「视图」菜单里的编辑操作、缩放、开发者工具，重构为各平台标准的菜单结构（Claude History / 编辑 / 视图 / 窗口 / 帮助）。「设置…」(⌘,) 与「关于」可直接打开对应设置页；开发者工具改用平台默认快捷键，释放了 ⌘K。
- **全新应用图标**：以深色高质感的「暗夜 C 标」替换原有绿色对话气泡图标——深炭底 + 金属橙 C + 发光节点，品牌辨识度更强，在 Dock 与各小尺寸下均清晰可辨。

## [1.5.0] — 2026-06-27

### 🆕 新增

- **毛玻璃效果开关**：设置 → 外观新增「毛玻璃效果」开关，让整个应用窗口呈现原生毛玻璃（macOS vibrancy / Windows acrylic）。默认开启、即时切换、跨重启持久化；Linux 自动隐藏。
- **用外部工具打开项目**：项目列表支持以外部工具（Cursor / VS Code / 终端等）打开项目目录，采用两级下拉选择。
- **项目相对时间**：项目列表的时间显示改为相对时间（如「3 小时前」），与 Codex 对齐。

### 🎨 改进

- **统一设置中心**：原分散的统计 / 更新 / 主题入口合并为一个设置弹窗（飞书桥接 / 外观 / 使用统计 / 关于与更新）。工具栏精简为齿轮 + 全文搜索；齿轮徽章同时提示「飞书已连接」与「有新版本」。
- **会话右键菜单**：新的下拉菜单替换悬浮删除按钮，支持绑定 / 解绑飞书、恢复会话、复制命令、删除（带确认）。
- **消息块统一**：全部可折叠块（思考、11 种工具块、工具调用 / 结果）统一为 `CollapsibleBlock`——一致的圆角、SVG 箭头、默认折叠与摘要行；修复全部展开 / 折叠对工具块无效的问题。
- **UI 打磨**：文件快照改用统一折叠块（修复 ▼ 图标 bug、中文标签）；Cursor / VS Code / IntelliJ 改用官方 logo；齿轮图标适配明暗主题；设置弹窗固定尺寸，切换标签页不再跳动。

### 🐛 修复

- **修复毛玻璃从未生效**：vibrancy 自首次配置以来一直未真正渲染——本次修复两个根因（窗口缺少透明背景 + CSS 透明选择器写成后代选择器导致永不匹配），macOS 上首次真正透出毛玻璃。

### 📦 打包

- 为 electron-builder 与 package.json 配置 GitHub 发布的 `releaseType`。

## [1.4.0] — 2026-06-17

### 🆕 新增

- **深色主题重设计**：采用 CodePilot 风格 + macOS 侧边栏原生毛玻璃（vibrancy），整体视觉升级。
- **免签名启动更新检查**：因应用未做代码签名，新增独立于 electron-updater 的启动更新检查——检测到新版本后通过浏览器跳转下载页。

### 🐛 修复

- **搜索跳转选中失败**：全文搜索跳转时，`project.id` 误用文件夹名而非数据库 id，导致无法正确选中目标项目，已修复。
- **项目列表类型**：`ProjectList` 的 `selectedId` 属性现在接受 Number 类型（数据库 project id），不再因类型不匹配而失效。

## [1.3.0] — 2026-06-17

### 🆕 新增

- **全文搜索**：跨对话内容的全文检索，支持关键词快速定位。
- **使用统计**：新增使用情况统计功能，量化 Claude Code 使用数据。
- **飞书流式进度卡片**：飞书端实时展示 Claude 处理进度卡片，支持附件展示。
- **历史重建索引**：支持对已有对话历史重新建立索引。

### 🐛 修复

- **加固飞书权限通道**：强化 Feishu 权限通道与渲染进程 IPC 的安全性。

## [1.2.2] — 2026-06

> 注：本版本对应的 git tag 已损坏，但其发布内容真实存在。

### 🐛 修复

- **修复 better-sqlite3 缺失**：将 `node_modules` 正确打入 Electron 构建产物，解决打包后 `better-sqlite3` 原生模块找不到的运行时错误。

## [1.2.1] — 2026-06-09

### 📦 打包

- 针对 v1.2.0 构建产物的发布修复版本。

## [1.2.0] — 2026-06-09

### 🆕 新增

- **应用内自动更新**：集成 `electron-updater`，支持 Windows / Linux 上应用内检查并安装更新（macOS 因未签名暂不支持，需手动下载覆盖）。

### 📦 打包

- 修复 Linux CI 失败：移除 snap 构建目标。
- 为各平台指定正确的图标，避免 Linux CI 上 ICNS→PNG 转换报错。

## [1.1.2] — 2026-06-08

### 🐛 修复

- **飞书卡片分块展示**：用分块（chunked）展示替换原先的响应截断，避免长回复被生硬截断。

## [1.1.1] — 2026-05-22

> 本次发布首次引入飞书桥连能力，整合了 v1.1.0 的飞书桥接与 v1.1.1 的模块化重构与多项修复。

### 🆕 新增

- **飞书桥连**：通过飞书机器人远程与 Claude Code 对话，支持 20+ 条斜杠命令、会话绑定、模型切换、权限管控、工作目录切换等。
- **模块化飞书桥**：将单体 `feishu-bridge.js` 拆分为 `feishu/` 目录下的独立模块（`cards`、`binding`、`PermissionManager`、`HooksHandler`、`claude-spawn`、`commands`、`FeishuBridge`）。
- **Claude Code Hook 接入**：新增 `feishu-hook-script.js`，作为 Claude Code `PreToolUse` 的独立 hook；配套本地 HTTP 服务接收回调。
- **斜杠命令扩展**：新增 `/permission`、`/allow`、`/disallow` 等权限管理命令，并提供权限确认卡片。
- **运维文档**：补充飞书桥接与 hooks 集成的完整运维指南。

### 🐛 修复

- 解决 Electron 打包后 claude 二进制路径定位错误。
- 修正飞书卡片 schema（采用正确的 card 2.0 格式），替换不支持的 note 标签。
- 自动处理 Claude 权限提示，避免卡住；敏感工具（Bash/Write/Edit）调用时通知飞书。
- 对 Feishu JSONL 变更事件做防抖，避免对话列表频繁清空。
- Hook 脚本 HTTP 超时处理；消息到达时刷新 Claude History UI。

### 🎨 改进

- 用 Typing 状态替换处理中卡片，体验更自然；结果返回后提前 resolve 并异步清理 reaction。

## [1.0.0] — 2026-05-18

### 🆕 新增

首次发布。Claude History —— 一款浏览与管理本地 Claude Code 对话历史的桌面应用。

- **三栏可折叠布局**：项目列表 → 对话列表 → 消息详情，左右面板可一键收起 / 展开，支持拖拽调整宽度。
- **JSONL 流式解析**：实现 Claude Code `.jsonl` 历史文件的流式解析与消息归一化。
- **本地存储**：基于 SQLite + 项目文件扫描，自动发现并索引本地项目与会话。
- **优雅的对话展示**：支持 Markdown 渲染、代码高亮、表格样式、图片点击放大预览。
- **专用工具展示**：Agent 子代理、AskUserQuestion 交互问题、TodoWrite 任务清单、Edit/Write 文件 diff、Read 文件路径、Bash 命令、Thinking 思维过程、Glob/Grep 搜索等。
- **主题切换**：简约白 / 深邃黑 / 暖色调 / Monokai 四种主题。
- **智能标题**：自动从对话内容提取并生成标题。
- **对话搜索**：在对话列表中按关键词快速过滤。
- **项目排序**：支持按时间或对话数量排序。
- **安全删除**：支持删除对话和项目（同时移除磁盘文件与数据库记录）。
- **中文界面**：完整的本地化支持。
- **跨平台构建**：支持 macOS（DMG）、Windows（NSIS + 便携版）、Linux（AppImage）。
- **自定义应用图标**与 editorial-terminal 风格 UI。

---

[Unreleased]: https://github.com/cloud-mouse/claude-history/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.6.0
[1.5.2]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.5.2
[1.5.1]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.5.1
[1.5.0]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.5.0
[1.4.0]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.4.0
[1.3.0]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.3.0
[1.2.2]: https://github.com/cloud-mouse/claude-history/commits/2c75969
[1.2.1]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.2.1
[1.2.0]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.2.0
[1.1.2]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.1.2
[1.1.1]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.1.1
[1.0.0]: https://github.com/cloud-mouse/claude-history/releases/tag/v1.0.0
