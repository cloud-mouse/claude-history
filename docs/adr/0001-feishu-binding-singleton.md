---
status: accepted
---

# Feishu binding stays singleton

## Context

The conversation list is getting a per-item "Bind to Feishu" action (a ⋯ menu). That naturally raises the question: can each conversation bind to its own Feishu chat (multi-binding)?

## Decision

Keep **singleton** binding — the Feishu bridge serves at most one conversation at a time. Binding conversation B replaces the current binding on A. We only migrate the UI entry point (from the message-thread header into the conversation's ⋯ menu); we do **not** change the IPC, persistence, or Feishu webhook routing.

## Why

The user's goal is to consolidate entry points and declutter the layout, not to support multiple Feishu chats. Multi-binding would require reworking the persistence layer, IPC protocol, and webhook routing — a separate, sizable effort. Under singleton semantics, "every conversation offers a Bind action but only one is in effect at a time" still works; the UI just needs to reflect the switch in real time.

## Consequences

- At most one conversation in the list shows a "bound" marker at any time.
- Switching the binding happens immediately on click, with a toast — no extra confirmation dialog.
- If multi-chat support is needed later, it becomes a separate project that supersedes this ADR.
