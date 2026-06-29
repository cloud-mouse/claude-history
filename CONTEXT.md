# Claude History

A desktop app (Electron + Vue 3) for browsing and replaying Claude Code conversation history, with an optional Feishu (Lark) bridge that lets a remote chat drive one local session.

## Language

### Feishu integration (multi-bot)

**机器人 (Bot)**:
An independent Feishu self-built application (its own App ID/Secret + WebSocket long connection), bound to one service working directory (`project_dir`). A bot holds at most one active session binding. Bots coexist and run in parallel; App ID is globally unique and immutable (sharing an App ID makes WS connections kick each other off).
_Avoid_: app, connector, bridge (as a noun for a single bot)

**连接 (Connection)**:
Per-bot. Two dimensions: `enabled` (the user's intent, persisted to DB) vs `online` (whether the bot's WS connection is actually established, runtime state). The UI reflects `online`; on app start all `enabled` bots auto-reconnect. Stopping a bot is a logical stop + best-effort disconnect — the safety boundary is the active/generation guard, not an immediate socket close (the SDK exposes no public stop).
_Avoid_: logged in, signed in

**绑定 (Binding / binding)**:
**Per-bot single binding (bot-level)**: each bot has at most one active binding (bot ↔ conversation). Messages arriving on a bot's connection route solely to that bot's active binding, regardless of Feishu chat_id/sender — `chat_id` is used only to reply to the originating chat. Multiple bots can each hold one binding concurrently. Rebinding a bot overwrites its single binding row, so the previously bound conversation loses the remote entry on the next message (in-flight spawns finish on the old session). A session can only bind to a bot whose `project_dir` matches and that is `online`.
_Avoid_: linked, mapped, associated, global singleton

**处理中 (Processing / processing)**:
Per-bot runtime state. Each bot processes one message at a time (serialized within the bot) while bots run in parallel. Meaningful for the conversation bound to that specific bot.
_Avoid_: running, in-progress, global busy

**远程会话 (Remote session)**:
The Feishu-driven channel for a bot's bound local conversation.

### Core entities

**项目 (Project)**:
A Claude Code working directory that groups the conversations recorded under it.
_Avoid_: workspace, folder

**会话 / 对话 (Conversation)**:
One recorded Claude Code session, grouped under a Project.
_Avoid_: chat, log, thread
