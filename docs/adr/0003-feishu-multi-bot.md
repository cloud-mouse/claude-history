---
status: accepted
supersedes: ADR-0001
---

# Feishu integration upgraded to multi-bot

## Context

ADR-0001 chose **singleton** binding to keep scope small — the Feishu bridge served at most one conversation at a time, and binding a new conversation overwrote the previous one. As usage grew, this became limiting: a single Feishu app could only drive one working directory, and re-binding was destructive and serial. The user wanted different Feishu chats to drive different projects concurrently.

## Decision

Move from a single global bridge to **multiple bots**:

- Each bot is an independent Feishu self-built app (its own App ID/Secret + WebSocket long connection), bound to one service working directory (`project_dir`), switchable.
- Binding is **per-bot**: each bot holds at most one active binding (bot ↔ conversation). Messages arriving on a bot route solely to that bot's active binding, regardless of Feishu chat_id/sender — `chat_id` is only used to reply to the originating chat.
- Multiple bots run in parallel; a single bot processes messages serially (in-bot mutex via `_withProcessing`, replies "please wait" if busy).
- App ID is globally unique and immutable (DB `UNIQUE` + app-layer guard). Sharing an App ID makes WebSocket connections kick each other off.
- Switching a bot's `project_dir` drops its current binding (no snapshot kept); requires the bot to be non-`processing`. A session can only bind to a bot whose `project_dir` matches and that is `online`.

Persistence changes accordingly: the old `feishu_config` (single row) + `feishu_bindings` (keyed by `chat_id`) are replaced by `feishu_bots` (with `app_id UNIQUE`) + `feishu_bindings` (keyed by `bot_id UNIQUE`, `REFERENCES feishu_bots ON DELETE CASCADE`). The old single-row config is migrated into bot #1.

## Why

- Singleton meant one Feishu chat could only ever drive one project, and switching was destructive and serial.
- Per-bot binding lets each Feishu app own a working directory and a session independently, so multiple chats drive multiple projects in parallel without overwriting each other.
- Keeping "one binding per **bot**" (not one binding per chat) preserves the simple, serial, easy-to-reason-about processing model inside each bot, while still enabling concurrency across bots.
- App ID uniqueness is enforced because the Lark SDK WebSocket rejects concurrent connections sharing the same credentials — the constraint is physical, not just organizational.

## Consequences

- Each bot needs its own Feishu app (more setup per bot), but bots are fully independent and parallel.
- A bot's binding is overwritten on rebind — the previously bound conversation loses its remote entry on the next message (in-flight spawns finish on the old session). Switching `project_dir` has the same effect.
- Routing no longer depends on `chat_id`; a bot's active binding is the sole routing key. Reply still targets the originating chat.
- This **supersedes ADR-0001** (singleton binding). ADR-0001 is retained as history.
