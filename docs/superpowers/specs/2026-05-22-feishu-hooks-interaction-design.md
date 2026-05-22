# Feishu Hooks Interaction Redesign

Date: 2026-05-22

## Summary

Redesign the Feishu bridge to use Claude Code's PreToolUse hooks system for real-time permission control. When Claude Code attempts a sensitive operation (Bash/Write/Edit), a hook intercepts it before execution, sends a confirmation card to Feishu, and waits for the user to approve or deny. Non-sensitive operations (Read/Glob/Grep) execute without interruption.

## Background

The current implementation uses `bypassPermissions` mode with reactive stream-json monitoring. Sensitive tool use is detected after execution starts and the user can only terminate retroactively. This redesign moves to a proactive model where sensitive operations are confirmed before execution.

Technical investigation revealed that `--permission-prompt-tool stdio` does not work in `--print` mode (permissions are auto-denied, not deferred), and `--input-format stream-json` has protocol issues. The PreToolUse hooks system is the correct mechanism for this use case.

## Architecture

### File Structure

Split the monolithic `feishu-bridge.js` (1916 lines) into focused modules:

```
electron/
  feishu/
    index.js              # Entry point, exports FeishuBridge class
    bridge.js             # Core: WebSocket connection, message dispatch, session management
    claude-spawn.js       # Claude CLI spawning, stream-json parsing
    hooks-handler.js      # Local HTTP server, receives hook requests
    cards.js              # All Feishu card template builders
    commands.js           # Slash command handlers
    binding.js            # Session binding, project path decoding, JSONL watching
    permissions.js        # Permission mode management, confirmation state storage
  feishu-ipc.js           # IPC handlers (unchanged)
  feishu-hook-script.js   # Standalone hook script invoked by Claude Code hooks
```

### Data Flow

```
Feishu message -> bridge.js -> claude-spawn.js -> Claude CLI
                                                    |
                                          Claude calls sensitive tool
                                                    |
                                     PreToolUse Hook fires
                                                    |
                            feishu-hook-script.js -> HTTP -> hooks-handler.js
                                                              |
                                                   permissions.js stores pending request
                                                              |
                                                   cards.js builds confirmation card
                                                              |
                                              bridge.js sends card to Feishu
                                                              |
                                            User clicks Allow/Deny/Always Allow
                                                              |
                                          hooks-handler.js releases waiting hook
                                                              |
                              feishu-hook-script.js returns result to Claude
                                                              |
                                     Claude continues or receives denial
                                                              |
                                        Result card sent to Feishu
```

### Key Components

1. **hooks-handler.js** - Local HTTP server on port 19876. Started when the bridge initializes. Receives POST requests from `feishu-hook-script.js` with tool information. Holds a Promise for each pending confirmation, resolved when the user responds via Feishu card action.

2. **feishu-hook-script.js** - Standalone Node.js script invoked by Claude Code's hook mechanism. Reads tool info from stdin, sends HTTP POST to the bridge, waits for response, outputs JSON with permission decision. Runs as a separate process with a 60-second timeout.

3. **permissions.js** - Manages:
   - Current permission mode (default/plan/acceptEdits/bypass)
   - Always-allowed tools set
   - Session-allowed tools set
   - Pending confirmations Map: `request_id -> { resolve, reject, timeout }`

4. **claude-spawn.js** - Spawns Claude CLI with `--permission-mode bypassPermissions` and `--settings` pointing to a dynamically generated settings JSON containing the hook configuration. Parses stream-json output for real-time response delivery.

## Hook Configuration

Passed via `--settings` CLI flag (does not modify global user settings):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node <app-path>/feishu-hook-script.js",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

- Matcher targets all sensitive tools: Bash, Write, Edit, MultiEdit
- Read/Glob/Grep and other read-only tools are not hooked, execute immediately
- Timeout: 60 seconds (maximum allowed by Claude Code)
- When permission mode is `bypass`, the hook still fires but `feishu-hook-script.js` auto-approves
- When permission mode is `acceptEdits`, the hook-script checks the tool name: Write/Edit are auto-approved, Bash still requires confirmation
- The current permission mode is communicated to hook-script via a query parameter: `POST http://localhost:19876/hook?mode=acceptEdits`

## Hook Script Interaction

### Sequence

1. Claude Code invokes hook, writes JSON to stdin:
   ```json
   {
     "session_id": "abc123",
     "tool_name": "Bash",
     "tool_input": {"command": "rm -rf node_modules"},
     "tool_use_id": "toolu_01ABC",
     "cwd": "/Users/xxx/project"
   }
   ```

2. `feishu-hook-script.js` parses stdin, sends POST to `http://localhost:19876/hook`:
   ```json
   {
     "session_id": "abc123",
     "tool_name": "Bash",
     "tool_input": {"command": "rm -rf node_modules"},
     "tool_use_id": "toolu_01ABC",
     "cwd": "/Users/xxx/project"
   }
   ```

3. `hooks-handler.js` receives request:
   - Checks if tool is in `_alwaysAllowed` or `_sessionAllowed` sets
   - If pre-approved: responds immediately with allow
   - If not: stores pending confirmation, notifies bridge to send Feishu card
   - Holds HTTP response open (long-poll), waiting for user action

4. User clicks button on Feishu card:
   - Allow: resolve with `permissionDecision: "allow"`
   - Deny: resolve with `permissionDecision: "deny"`
   - Always Allow: add tool to `_sessionAllowed`, resolve with allow

5. `feishu-hook-script.js` receives HTTP response, outputs to stdout:
   ```json
   {
     "hookSpecificOutput": {
       "hookEventName": "PreToolUse",
       "permissionDecision": "allow"
     }
   }
   ```

6. Timeout (60s): Hook process killed by Claude Code. `hooks-handler.js` cleans up pending entry, updates Feishu card to show timeout status.

### Fail-Open Policy

If the HTTP server is unreachable (bridge crashed, port conflict), `feishu-hook-script.js`:
- Logs error to stderr
- Exits with code 0 (allow) to avoid blocking Claude
- Sends a warning to Feishu via alternative channel if possible

## Feishu Card Designs

### Confirmation Card (Orange/Yellow Warning)

```
Header: [Orange] "Operation Confirmation Request"

Body:
  - Tool: Bash / Write / Edit
  - Project: /path/to/project
  - Detail section showing:
    - Bash: full command
    - Write: file path + content preview (first 500 chars)
    - Edit: file path + old_string -> new_string diff
  - Timer: "Waiting for confirmation... (60s timeout)"

Actions:
  [Allow]      -> callback with allow
  [Deny]       -> callback with deny
  [Always Allow] -> callback with always-allow (adds to session set)
```

### Status Update Cards

- **Allowed**: Card updated to green header, "Allowed"
- **Denied**: Card updated to red header, "Denied" + reason
- **Timeout**: Card updated to gray header, "Timed Out (60s)"

## Permission Modes

Managed via `/permission` slash command:

| Mode | Behavior |
|------|----------|
| `default` | Sensitive tools (Bash/Write/Edit) trigger confirmation cards |
| `plan` | Same as default for hooks; Claude's read operations auto-approve |
| `acceptEdits` | Edit/Write auto-approve, Bash triggers confirmation |
| `bypass` | All tools auto-approve, hooks fire but auto-allow |

Mode changes take effect on the next Claude invocation (not mid-execution).

## Slash Commands

All 17+ existing commands retained. New additions:

| Command | Aliases | Description |
|---------|---------|-------------|
| `/permission [mode]` | `/权限` | View or switch permission mode |
| `/allow <tool>` | - | Add tool to always-allowed list |
| `/disallow <tool>` | - | Remove tool from always-allowed list |

## Error Handling

1. **Hook server unavailable**: Fail-open (auto-allow), send Feishu warning
2. **60s timeout**: Tool denied, Feishu card updated to timeout state
3. **Bridge restart**: Clear all pending confirmations, close old HTTP server, start fresh
4. **Claude process crash**: Existing behavior (error card to Feishu)
5. **Multiple concurrent tools**: Each tool triggers independent hook, independent confirmation card
6. **Port conflict**: Try alternative ports (19876-19885), fail with clear error if all occupied

## Migration Path

1. Create new `electron/feishu/` directory with split modules
2. Create `electron/feishu-hook-script.js`
3. Update `electron/index.js` imports
4. Keep `electron/feishu-bridge.js` temporarily for reference, remove after migration
5. All existing functionality preserved: bindings, slash commands, JSONL watching, renderer IPC
