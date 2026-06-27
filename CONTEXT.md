# Claude History

A desktop app (Electron + Vue 3) for browsing and replaying Claude Code conversation history, with an optional Feishu (Lark) bridge that lets a remote chat drive one local session.

## Language

### Feishu integration

**连接 (Connection / connected)**:
Whether the Feishu bridge service is online — credentials saved and the long-connection subscribed to message events. A global state, not tied to any single conversation.
_Avoid_: logged in, signed in, enabled

**绑定 (Binding / binding)**:
Which local conversation currently serves as the Feishu remote entry point. **Singleton by design**: at most one conversation is bound at any moment; binding conversation B replaces the binding on A.
_Avoid_: linked, mapped, associated

**处理中 (Processing / processing)**:
Whether the bound conversation is actively handling an incoming Feishu message right now (active vs idle). Meaningful only for the bound conversation.
_Avoid_: running, in-progress

**远程会话 (Remote session)**:
The Feishu-driven channel that corresponds to the bound local conversation.

### Core entities

**项目 (Project)**:
A Claude Code working directory that groups the conversations recorded under it.
_Avoid_: workspace, folder

**会话 / 对话 (Conversation)**:
One recorded Claude Code session, grouped under a Project.
_Avoid_: chat, log, thread
