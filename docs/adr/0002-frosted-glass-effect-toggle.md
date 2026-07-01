---
status: accepted
---

# Frosted-glass effect as a window-level toggle

## Context

`electron/index.js` already set macOS `vibrancy = 'under-window'` and *intended* to make `html/body` transparent on darwin (variables.css), but the effect **never actually rendered** for two reasons: `windowOptions` had no transparent `backgroundColor`, and the darwin transparency selector (`[data-platform="darwin"] html`) was a descendant selector that never matched because `data-platform` is set on `<html>` itself. The opaque `--bg-primary` thus covered the whole window, so the vibrancy layer was invisible to the user. The user wants the *whole app* to show frosted glass and asked for a Settings → Appearance on/off switch.

## Decision

Add a single **"毛玻璃效果"** toggle in Settings → Appearance that drives a window-level native effect:

- **macOS**: `vibrancy = 'under-window'` — fixed by adding a transparent window base, a root-container transparency chain, and per-theme semi-transparent `--bg-panel`.
- **Windows**: `backgroundMaterial = 'acrylic'`.
- **Linux**: not supported — the toggle is hidden.
- Default **on**. Off = each theme switches its panels to an opaque solid color (high contrast, no desktop bleed).
- Persisted in the main-process store (same better-sqlite3 channel as Feishu config); the renderer toggles it via IPC and the main process applies it live (`setVibrancy` on macOS / `setBackgroundMaterial` on Windows) — no app restart.

## Why

Three approaches were considered:

- **A. Window-level native toggle** (chosen) — the only option that makes the switch meaningful on *every* supported platform (can be turned both on and off), and "off = opaque" solves the real pain of low text contrast over busy desktop wallpapers.
- **B. Backfill the effect only on non-mac** — leaves the switch meaningless on macOS, where the effect is already wired in; a user who dislikes transparency has no escape.
- **C. App-wide CSS `backdrop-filter` overlay** — stacks a second blur on top of native vibrancy ("blur on blur"), worse performance and appearance, and it cannot reveal the desktop.

"Whole-app frosted glass" is only physically achievable on macOS + Windows. Linux has no cross-distro native API; a CSS fallback would not reveal the desktop and would look inconsistent, so it is explicitly out of scope.

## Consequences

- "Full cross-platform" in practice means macOS + Windows; Linux users see no toggle.
- Semi-transparent panels over complex wallpapers can hurt readability — the off state exists precisely for this.
- Windows acrylic costs more GPU than macOS vibrancy or Win11 mica; battery-sensitive users can turn it off.
- The fix that makes vibrancy actually render (transparent window base + transparency chain) changes window/layer setup, so it must be validated theme-by-theme (light / dark / warm / monokai).
