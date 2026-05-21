'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { createLarkChannel, Client } = require('@larksuiteoapi/node-sdk');

const CC_DIR = () => path.join(os.homedir(), '.cc-connect');

/**
 * Resolve the full PATH from the user's login shell.
 * Packaged Electron apps get a minimal PATH that lacks node/nvm/brew paths.
 * We cache the result so we only shell out once.
 */
let _cachedShellPath = null;
function resolveShellPath() {
  if (_cachedShellPath) return _cachedShellPath;

  try {
    _cachedShellPath = execSync(
      `${process.env.SHELL || '/bin/zsh'} -l -c 'echo $PATH'`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    return _cachedShellPath;
  } catch (_) { /* fall through */ }

  // Fallback: assemble common paths manually
  const home = os.homedir();
  const paths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${home}/.nvm/versions/node/default/bin`,
  ];
  // Add all nvm version bin dirs
  try {
    const nvmDir = path.join(home, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      for (const ver of fs.readdirSync(nvmDir)) {
        paths.push(path.join(nvmDir, ver, 'bin'));
      }
    }
  } catch (_) { /* ignore */ }
  paths.push(process.env.PATH || '');

  _cachedShellPath = paths.filter(Boolean).join(':');
  return _cachedShellPath;
}

/**
 * Resolve the full path to the `claude` CLI binary.
 * Electron apps don't inherit the user's shell PATH (nvm, brew, etc.),
 * so we resolve it explicitly before spawning.
 */
function resolveClaudeBinary() {
  // 1. Try the user's login shell PATH
  try {
    const shellPath = execSync(
      `${process.env.SHELL || '/bin/zsh'} -l -c 'which claude'`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();
    if (shellPath && fs.existsSync(shellPath)) return shellPath;
  } catch (_) { /* not found via shell */ }

  // 2. Common locations
  const home = os.homedir();
  const candidates = [
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(home, '.nvm/versions/node/default/bin/claude'),
  ];
  // Also glob nvm versions
  try {
    const nvmDir = path.join(home, '.nvm/versions/node');
    if (fs.existsSync(nvmDir)) {
      for (const ver of fs.readdirSync(nvmDir)) {
        candidates.push(path.join(nvmDir, ver, 'bin', 'claude'));
      }
    }
  } catch (_) { /* ignore */ }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // 3. Fallback — rely on system PATH
  return 'claude';
}

class FeishuBridge {
  constructor(store, mainWindow) {
    this.store = store;
    this.mainWindow = mainWindow;
    this.channel = null;
    this.client = null;
    this._connected = false;
    this._processing = false;
    this._watcher = null;
    this._claudeProcess = null;
    this._model = null;          // Model override: null = default
    this._lastMessage = null;    // Last non-command message text (for /repeat)
  }

  get isConnected() {
    return this._connected;
  }

  getStatus() {
    const config = this.store.getFeishuConfig();
    const binding = this.store.getActiveBinding();
    return {
      connected: this._connected,
      enabled: !!(config && config.app_id && config.enabled),
      hasConfig: !!(config && config.app_id),
      binding: binding ? {
        chatId: binding.chat_id,
        jsonlPath: binding.jsonl_path,
        sessionId: binding.session_id
      } : null,
      processing: this._processing
    };
  }

  /**
   * Start the Feishu WebSocket connection.
   */
  async start() {
    const config = this.store.getFeishuConfig();
    if (!config || !config.app_id || !config.app_secret) {
      throw new Error('飞书凭证未配置');
    }

    if (this._connected && this.channel) {
      return { success: true, message: 'already connected' };
    }

    // Create Feishu client and channel
    this.client = new Client({
      appId: config.app_id,
      appSecret: config.app_secret
    });

    this.channel = createLarkChannel({
      appId: config.app_id,
      appSecret: config.app_secret
    });

    // Register message handler
    this.channel.on('message', async (msg) => {
      try {
        await this._handleMessage(msg);
      } catch (err) {
        console.error('[feishu] Error handling message:', err.message);
        // Try to notify the user instead of silently failing
        try {
          const chatId = msg.chatId;
          if (chatId) {
            await this._sendCard(chatId, this._buildErrorCard(`内部错误: ${err.message}`));
          }
        } catch (_) { /* give up */ }
      }
    });

    // Register connection events
    this.channel.on('reconnecting', () => {
      console.log('[feishu] Reconnecting...');
      this._connected = false;
      this._notifyRenderer('feishu:statusChanged', { connected: false });
    });

    this.channel.on('reconnected', () => {
      console.log('[feishu] Reconnected');
      this._connected = true;
      this._notifyRenderer('feishu:statusChanged', { connected: true });
    });

    // Connect
    try {
      await this.channel.connect();
      this._connected = true;
      console.log('[feishu] WebSocket connected');

      // Ensure enabled flag is persisted for auto-start on next launch
      this.store.setFeishuEnabled(true);

      // Start watching the bound JSONL file if any
      const binding = this.store.getActiveBinding();
      if (binding) {
        this._watchBinding(binding);
      }

      return { success: true };
    } catch (err) {
      this._connected = false;
      throw new Error(`飞书连接失败: ${err.message}`);
    }
  }

  /**
   * Stop the Feishu connection.
   */
  async stop() {
    this._unwatch();
    if (this._claudeProcess) {
      this._claudeProcess.kill('SIGTERM');
      this._claudeProcess = null;
    }
    this._processing = false;
    if (this.channel) {
      try {
        await this.channel.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.channel = null;
    }
    this.client = null;
    this._connected = false;
    // Persist disabled state so we don't auto-start next launch
    this.store.setFeishuEnabled(false);
    console.log('[feishu] Disconnected');
    return { success: true };
  }

  /**
   * Bind a Feishu chat to a Claude Code session.
   * Called from UI when user clicks "bind to Feishu".
   * We store the binding without a specific chatId — the first incoming
   * Feishu message will associate the chat automatically.
   */
  async bindSession(jsonlPath, projectDir) {
    if (!jsonlPath) {
      return { success: false, error: '缺少会话路径' };
    }

    // Derive the REAL project directory from the JSONL path.
    // projectDir from the DB is the slug directory under ~/.claude/projects/,
    // NOT the actual working directory. _resolveCwd decodes the slug correctly.
    const realProjectDir = this._resolveCwd(jsonlPath) || projectDir || process.cwd();

    const sessionId = path.basename(jsonlPath, '.jsonl');

    // Deactivate any existing binding
    this.store.deactivateAllBindings();

    // Create binding with placeholder chatId (will be filled on first message)
    // Use a special prefix to indicate "waiting for first message"
    const chatId = `_pending_${sessionId.slice(0, 8)}`;
    this.store.createBinding(chatId, 'p2p', jsonlPath, sessionId, realProjectDir);

    // Watch the JSONL file
    this._watchBinding({ jsonl_path: jsonlPath, session_id: sessionId });

    console.log(`[feishu] Bound session ${sessionId} (waiting for first Feishu message)`);

    return {
      success: true,
      sessionId,
      jsonlPath,
      message: '已绑定。发送任意飞书消息给机器人即可关联。'
    };
  }

  /**
   * Unbind the active session.
   */
  unbind() {
    this._unwatch();
    this.store.deactivateAllBindings();
    console.log('[feishu] Unbound session');
    return { success: true };
  }

  /**
   * Handle an incoming Feishu message.
   * Flow: ⌨️ 收到 → (处理中) → ✅ 完成 + 回复 / 😔 失败
   */
  async _handleMessage(msg) {
    const chatId = msg.chatId;
    const chatType = msg.chatType || 'p2p';
    const messageText = this._extractText(msg);

    console.log(`[feishu] Message from ${chatId}: ${messageText.slice(0, 80)}`);

    // ── Slash commands (intercept before binding/processing checks) ──
    if (messageText.startsWith('/')) {
      const binding = this.store.getBindingByChatId(chatId) ||
                      this._tryPendingBinding(chatId, chatType);
      await this._handleCommand(chatId, messageText, binding);
      return;
    }

    // ── Normal message processing ───────────────────────────────────

    // Look up binding
    let binding = this.store.getBindingByChatId(chatId);
    if (!binding) {
      binding = this._tryPendingBinding(chatId, chatType);
    }

    if (!binding) {
      await this._sendCard(chatId, this._buildWarningCard(
        '😔 未绑定会话',
        '此飞书会话未绑定到 Claude Code\n\n请在 **claude-history** 桌面应用中点击「绑定到飞书」按钮，先绑定一个对话'
      ));
      return;
    }

    // If already processing, reject
    if (this._processing) {
      await this._sendCard(chatId, this._buildWarningCard(
        '⏳ 请稍候',
        '正在处理上一条消息，请等待完成后再发送新消息'
      ));
      return;
    }

    this._processing = true;
    this._notifyRenderer('feishu:statusChanged', { processing: true });

    // Phase 1: Immediate acknowledgment
    const preview = messageText.length > 30 ? messageText.slice(0, 30) + '...' : messageText;
    await this._sendCard(chatId, this._buildAckCard(preview));

    try {
      // Phase 2: Spawn Claude Code
      const response = await this._spawnClaude(
        binding.session_id,
        binding.jsonl_path,
        messageText
      );

      // Phase 3a: Send formatted card response
      await this._sendCard(chatId, this._buildResponseCard(response));

      this._lastMessage = messageText;

      // Notify renderer to reload conversation
      this._notifyRenderer('feishu:jsonlChanged', {
        jsonlPath: binding.jsonl_path,
        sessionId: binding.session_id
      });

    } catch (err) {
      console.error('[feishu] Error processing message:', err.message);
      // Phase 3b: Error card response
      await this._sendCard(chatId, this._buildErrorCard(err.message)).catch(() => {});
    } finally {
      this._processing = false;
      this._notifyRenderer('feishu:statusChanged', { processing: false });
    }
  }

  /**
   * Try to associate a pending binding with a real chatId.
   */
  _tryPendingBinding(chatId, chatType) {
    const activeBinding = this.store.getActiveBinding();
    if (activeBinding && activeBinding.chat_id.startsWith('_pending_')) {
      this.store.createBinding(chatId, chatType, activeBinding.jsonl_path, activeBinding.session_id, activeBinding.project_dir);
      console.log(`[feishu] Associated pending binding with chat ${chatId}`);
      return this.store.getBindingByChatId(chatId);
    }
    return null;
  }

  /**
   * Extract plain text from a normalized message.
   */
  _extractText(msg) {
    // msg.content is already normalized by createLarkChannel
    // It could be a string (markdown) or have a text property
    let text;
    if (typeof msg.content === 'string') {
      text = msg.content;
    } else if (msg.text) {
      text = msg.text;
    } else {
      text = String(msg.content || '');
    }

    // Strip @mention prefix (e.g. "@皓月当空 /new" → "/new")
    // Feishu groups prepend @BotName when users mention the bot
    text = text.replace(/^@\S+\s*/, '');

    return text.trim();
  }

  // ── Slash Command System ────────────────────────────────────────

  /**
   * Parse a slash command from message text.
   * Returns { cmd, args } or null if not a command.
   */
  _parseCommand(text) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) return null;

    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx < 0) {
      return { cmd: trimmed.slice(1).toLowerCase(), args: '' };
    }
    return {
      cmd: trimmed.slice(1, spaceIdx).toLowerCase(),
      args: trimmed.slice(spaceIdx + 1).trim()
    };
  }

  /**
   * Dispatch a slash command to the appropriate handler.
   */
  async _handleCommand(chatId, text, binding) {
    const parsed = this._parseCommand(text);
    if (!parsed) return;

    const { cmd, args } = parsed;

    const commands = {
      help:     () => this._cmdHelp(chatId),
      帮助:     () => this._cmdHelp(chatId),
      status:   () => this._cmdStatus(chatId, binding),
      状态:     () => this._cmdStatus(chatId, binding),
      bind:     () => this._cmdBind(chatId, binding),
      cancel:   () => this._cmdCancel(chatId),
      取消:     () => this._cmdCancel(chatId),
      new:      () => this._cmdNew(chatId, binding),
      clear:    () => this._cmdNew(chatId, binding),   // alias
      cd:       () => this._cmdCd(chatId, args, binding),
      model:    () => this._cmdModel(chatId, args),
      history:  () => this._cmdHistory(chatId, args, binding),
      历史:     () => this._cmdHistory(chatId, args, binding),
      sessions: () => this._cmdSessions(chatId, binding),
      会话:     () => this._cmdSessions(chatId, binding),
      switch:   () => this._cmdSwitch(chatId, args, binding),
      repeat:   () => this._cmdRepeat(chatId, binding),
      system:   () => this._cmdSystem(chatId, args, binding),
    };

    const handler = commands[cmd];
    if (handler) {
      try {
        await handler();
      } catch (err) {
        console.error(`[feishu] Command /${cmd} error:`, err.message);
        await this._sendCard(chatId, this._buildErrorCard(`命令执行失败: ${err.message}`));
      }
    } else {
      await this._sendCard(chatId, this._buildWarningCard(
        `❓ 未知命令 /${cmd}`,
        '输入 `/help` 查看所有可用命令'
      ));
    }
  }

  // ── Command Handlers ────────────────────────────────────────────

  async _cmdHelp(chatId) {
    const content = [
      '**基础命令**',
      '`/help` — 显示本帮助信息',
      '`/status` — 查看连接状态和绑定信息',
      '`/bind` — 查看当前绑定详情',
      '`/cancel` — 取消正在处理的任务',
      '',
      '**会话管理**',
      '`/new` `/clear` — 开启全新会话',
      '`/sessions` — 列出当前项目的所有会话',
      '`/switch <id>` — 切换到指定会话',
      '`/history [n]` — 查看最近 n 条消息（默认 5）',
      '`/repeat` — 重新发送上一条消息',
      '',
      '**环境配置**',
      '`/cd <路径>` — 切换工作目录',
      '`/model [名称]` — 查看/设置 Claude 模型',
      '`/system <提示>` — 发送系统提示给 Claude',
      '',
      '💡 直接发送非 `/` 开头的消息即可与 Claude 对话'
    ].join('\n');

    await this._sendCard(chatId, this._buildInfoCard('📖 命令手册', content, 'purple'));
  }

  async _cmdStatus(chatId, binding) {
    const config = this.store.getFeishuConfig();
    const wsStatus = this._connected ? '✅ 已连接' : '❌ 未连接';
    const lines = [
      `**连接状态**`,
      `WebSocket: ${wsStatus}`,
      `处理任务: ${this._processing ? '⏳ 处理中' : '✅ 空闲'}`,
      `模型: \`${this._model || '默认'}\``,
      `凭证: ${config.app_id ? '✅ 已配置' : '❌ 未配置'}`,
    ];

    if (binding) {
      const cwd = this._resolveCwd(binding.jsonl_path) || binding.project_dir || '(未知)';
      const shortSession = binding.session_id.slice(0, 8);
      lines.push('');
      lines.push('**当前绑定**');
      lines.push(`会话: \`${shortSession}...\``);
      lines.push(`项目: \`${cwd}\``);
    } else {
      lines.push('');
      lines.push('📎 绑定: 无（请在桌面端绑定）');
    }

    const color = this._connected ? 'turquoise' : 'red';
    await this._sendCard(chatId, this._buildInfoCard('📊 系统状态', lines.join('\n'), color));
  }

  async _cmdBind(chatId, binding) {
    if (!binding) {
      await this._sendCard(chatId, this._buildWarningCard(
        '😔 未绑定',
        '请在 **claude-history** 桌面应用中点击「绑定到飞书」'
      ));
      return;
    }

    const displayCwd = this._resolveCwd(binding.jsonl_path) || binding.project_dir;
    const content = [
      `Chat ID: \`${binding.chat_id}\``,
      `会话 ID: \`${binding.session_id.slice(0, 16)}...\``,
      `项目目录: \`${displayCwd}\``,
      `JSONL: \`${path.basename(binding.jsonl_path)}\``,
      `模型: \`${this._model || '默认'}\``,
    ].join('\n');

    await this._sendCard(chatId, this._buildInfoCard('📎 绑定信息', content, 'indigo'));
  }

  async _cmdCancel(chatId) {
    if (!this._processing || !this._claudeProcess) {
      await this._sendCard(chatId, this._buildInfoCard('ℹ️ 无任务', '当前没有正在处理的任务', 'grey'));
      return;
    }

    this._claudeProcess.kill('SIGTERM');
    this._claudeProcess = null;
    this._processing = false;
    this._notifyRenderer('feishu:statusChanged', { processing: false });
    await this._sendCard(chatId, this._buildSuccessCard('✅ 已取消', '当前任务已被终止'));
  }

  async _cmdNew(chatId, binding) {
    if (!binding) {
      await this._sendCard(chatId, this._buildWarningCard(
        '😔 未绑定', '请先在桌面端绑定一个会话'
      ));
      return;
    }

    // Generate a fresh session ID and update the binding.
    // The new JSONL doesn't exist yet, so next _spawnClaude call
    // will skip --resume and start a new conversation.
    const newSessionId = crypto.randomUUID();
    // Resolve real cwd from the existing JSONL path (project_dir may be wrong)
    const realCwd = this._resolveCwd(binding.jsonl_path) || binding.project_dir;
    const slug = realCwd.replace(/\//g, '-').replace(/_/g, '-');
    const newJsonlPath = path.join(
      os.homedir(), '.claude', 'projects', slug, `${newSessionId}.jsonl`
    );

    this.store.updateBinding(binding.chat_id, {
      session_id: newSessionId,
      jsonl_path: newJsonlPath
    });

    // Re-watch the new path (even though it doesn't exist yet)
    this._unwatch();

    await this._sendCard(chatId, this._buildSuccessCard(
      '✅ 已开启新会话',
      [
        `会话 ID: \`${newSessionId.slice(0, 8)}...\``,
        `项目: \`${realCwd}\``,
        '',
        '💡 发送消息即可开始新对话'
      ].join('\n')
    ));
  }

  async _cmdCd(chatId, args, binding) {
    if (!binding) {
      await this._sendCard(chatId, this._buildWarningCard('😔 未绑定', '当前没有绑定'));
      return;
    }

    if (!args) {
      const realCwd = this._resolveCwd(binding.jsonl_path) || binding.project_dir;
      await this._sendCard(chatId, this._buildInfoCard('📂 当前目录', `\`${realCwd}\``, 'indigo'));
      return;
    }

    // Resolve the path (support ~ and relative paths)
    const baseCwd = this._resolveCwd(binding.jsonl_path) || binding.project_dir;
    let targetPath = args.replace(/^~/, os.homedir());
    if (!path.isAbsolute(targetPath)) {
      targetPath = path.resolve(baseCwd, targetPath);
    }

    // Validate
    if (!fs.existsSync(targetPath)) {
      await this._sendCard(chatId, this._buildErrorCard(`路径不存在: ${targetPath}`));
      return;
    }

    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) {
      await this._sendCard(chatId, this._buildErrorCard(`不是目录: ${targetPath}`));
      return;
    }

    // Switch to new project — create fresh session in new directory
    const newSessionId = crypto.randomUUID();
    const slug = targetPath.replace(/\//g, '-').replace(/_/g, '-');
    const newJsonlPath = path.join(
      os.homedir(), '.claude', 'projects', slug, `${newSessionId}.jsonl`
    );

    this.store.updateBinding(binding.chat_id, {
      project_dir: targetPath,
      session_id: newSessionId,
      jsonl_path: newJsonlPath
    });

    this._unwatch();

    await this._sendCard(chatId, this._buildSuccessCard(
      '✅ 已切换工作目录',
      [
        `📂 新目录: \`${targetPath}\``,
        `🔄 新会话: \`${newSessionId.slice(0, 8)}...\``,
        '',
        '💡 目录变更会自动开启新会话'
      ].join('\n')
    ));
  }

  async _cmdModel(chatId, args) {
    if (!args) {
      // Show current model
      const current = this._model ? `\`${this._model}\`` : '默认（Claude 自动选择）';
      await this._sendCard(chatId, this._buildInfoCard('🤖 当前模型', [
        `当前: ${current}`,
        '',
        `可用值: \`sonnet\` \`opus\` \`haiku\``
      ].join('\n'), 'violet'));
      return;
    }

    // Validate model name
    const valid = ['sonnet', 'opus', 'haiku'];
    const model = args.toLowerCase().trim();
    if (!valid.includes(model)) {
      await this._sendCard(chatId, this._buildErrorCard(
        `未知模型: ${model}\n可用: ${valid.join(', ')}`
      ));
      return;
    }

    this._model = model;
    await this._sendCard(chatId, this._buildSuccessCard('✅ 模型已设置', `当前模型: \`${model}\``));
  }

  async _cmdHistory(chatId, args, binding) {
    if (!binding) {
      await this._sendCard(chatId, this._buildWarningCard('😔 未绑定', '当前没有绑定'));
      return;
    }

    if (!fs.existsSync(binding.jsonl_path)) {
      await this._sendCard(chatId, this._buildInfoCard('📭 历史消息', '暂无历史消息（新会话）', 'grey'));
      return;
    }

    const count = Math.min(parseInt(args) || 5, 20);
    const entries = this._readHistory(binding.jsonl_path, count);

    if (entries.length === 0) {
      await this._sendCard(chatId, this._buildInfoCard('📭 历史消息', '暂无历史消息', 'grey'));
      return;
    }

    const lines = [];
    for (const entry of entries) {
      const icon = entry.role === 'human' ? '👤' : entry.role === 'assistant' ? '🤖' : '⚙️';
      const text = entry.text.length > 150 ? entry.text.slice(0, 150) + '...' : entry.text;
      lines.push(`${icon} ${text}`);
      lines.push('');
    }

    await this._sendCard(chatId, this._buildInfoCard(
      `📜 最近 ${entries.length} 条消息`,
      lines.join('\n'),
      'indigo'
    ));
  }

  async _cmdSessions(chatId, binding) {
    if (!binding) {
      await this._sendCard(chatId, this._buildWarningCard('😔 未绑定', '当前没有绑定'));
      return;
    }

    const realCwd = this._resolveCwd(binding.jsonl_path) || binding.project_dir;
    const slug = realCwd.replace(/\//g, '-').replace(/_/g, '-');
    const projectDir = path.join(os.homedir(), '.claude', 'projects', slug);

    if (!fs.existsSync(projectDir)) {
      await this._sendCard(chatId, this._buildInfoCard('📭 会话列表', '当前项目暂无会话记录', 'grey'));
      return;
    }

    const files = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const fullPath = path.join(projectDir, f);
        try {
          const stat = fs.statSync(fullPath);
          return { name: f, mtime: stat.mtime, size: stat.size };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 15);

    if (files.length === 0) {
      await this._sendCard(chatId, this._buildInfoCard('📭 会话列表', '当前项目暂无会话记录', 'grey'));
      return;
    }

    const lines = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const sid = f.name.replace('.jsonl', '');
      const short = sid.slice(0, 8);
      const time = f.mtime.toLocaleDateString('zh-CN');
      const current = sid === binding.session_id ? ' ← 当前' : '';
      lines.push(`\`${i + 1}\`. \`${short}...\` (${time})${current}`);
    }

    lines.push('');
    lines.push('💡 使用 `/switch <序号>` 切换会话');

    await this._sendCard(chatId, this._buildInfoCard(
      `📋 会话列表 (${files.length})`,
      lines.join('\n'),
      'indigo'
    ));
  }

  async _cmdSwitch(chatId, args, binding) {
    if (!binding) {
      await this._sendCard(chatId, this._buildWarningCard('😔 未绑定', '当前没有绑定'));
      return;
    }

    if (!args) {
      await this._sendCard(chatId, this._buildWarningCard(
        '❌ 缺少参数',
        '请指定会话序号或 ID\n例: `/switch 1` 或 `/switch abc12345...`'
      ));
      return;
    }

    const realCwd = this._resolveCwd(binding.jsonl_path) || binding.project_dir;
    const slug = realCwd.replace(/\//g, '-').replace(/_/g, '-');
    const projectDir = path.join(os.homedir(), '.claude', 'projects', slug);

    if (!fs.existsSync(projectDir)) {
      await this._sendCard(chatId, this._buildErrorCard('项目目录不存在'));
      return;
    }

    // List sessions sorted by mtime (same as _cmdSessions)
    const files = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const fullPath = path.join(projectDir, f);
        try {
          const stat = fs.statSync(fullPath);
          return { name: f, mtime: stat.mtime };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    let targetFile = null;

    // Try numeric index first
    const idx = parseInt(args);
    if (!isNaN(idx) && idx >= 1 && idx <= files.length) {
      targetFile = files[idx - 1];
    } else {
      // Try matching by session ID prefix
      targetFile = files.find(f => f.name.startsWith(args) || f.name === `${args}.jsonl`);
    }

    if (!targetFile) {
      await this._sendCard(chatId, this._buildErrorCard(
        `未找到会话: ${args}\n使用 /sessions 查看可用会话`
      ));
      return;
    }

    const newSessionId = targetFile.name.replace('.jsonl', '');
    const newJsonlPath = path.join(projectDir, targetFile.name);

    this.store.updateBinding(binding.chat_id, {
      session_id: newSessionId,
      jsonl_path: newJsonlPath
    });

    // Watch the new file
    this._watchBinding({
      jsonl_path: newJsonlPath,
      session_id: newSessionId
    });

    await this._sendCard(chatId, this._buildSuccessCard(
      '✅ 已切换会话',
      [
        `会话: \`${newSessionId.slice(0, 8)}...\``,
        `修改时间: ${targetFile.mtime.toLocaleString('zh-CN')}`,
        '',
        '💡 发送消息即可继续对话'
      ].join('\n')
    ));
  }

  async _cmdRepeat(chatId, binding) {
    if (!binding) {
      await this._sendCard(chatId, this._buildWarningCard('😔 未绑定', '当前没有绑定'));
      return;
    }

    if (!this._lastMessage) {
      await this._sendCard(chatId, this._buildInfoCard('📭 无消息', '没有上一条消息可重复', 'grey'));
      return;
    }

    if (this._processing) {
      await this._sendCard(chatId, this._buildWarningCard('⏳ 处理中', '正在处理中，请先 /cancel'));
      return;
    }

    // Re-send last message as if user typed it again
    await this._sendCard(chatId, this._buildAckCard(
      this._lastMessage.slice(0, 30) + ' (重复)'
    ));

    // Directly process without going through _handleMessage to avoid command re-parsing
    this._processing = true;
    this._notifyRenderer('feishu:statusChanged', { processing: true });

    try {
      // Re-read binding (may have changed)
      const currentBinding = this.store.getBindingByChatId(chatId);
      if (!currentBinding) {
        throw new Error('绑定已失效');
      }

      const response = await this._spawnClaude(
        currentBinding.session_id,
        currentBinding.jsonl_path,
        this._lastMessage
      );

      await this._sendCard(chatId, this._buildResponseCard(response));

      this._notifyRenderer('feishu:jsonlChanged', {
        jsonlPath: currentBinding.jsonl_path,
        sessionId: currentBinding.session_id
      });
    } catch (err) {
      await this._sendCard(chatId, this._buildErrorCard(err.message)).catch(() => {});
    } finally {
      this._processing = false;
      this._notifyRenderer('feishu:statusChanged', { processing: false });
    }
  }

  async _cmdSystem(chatId, args, binding) {
    if (!binding) {
      await this._sendCard(chatId, this._buildWarningCard('😔 未绑定', '当前没有绑定'));
      return;
    }

    if (!args) {
      await this._sendCard(chatId, this._buildWarningCard(
        '❌ 缺少参数',
        '请输入系统提示内容\n例: `/system 你是一个专业的代码审查助手`'
      ));
      return;
    }

    if (this._processing) {
      await this._sendCard(chatId, this._buildWarningCard('⏳ 处理中', '正在处理中，请先 /cancel'));
      return;
    }

    // Send the system prompt as a Claude message with a system-like prefix
    this._processing = true;
    this._notifyRenderer('feishu:statusChanged', { processing: true });

    await this._sendCard(chatId, this._buildAckCard(args.slice(0, 50)));

    try {
      const currentBinding = this.store.getBindingByChatId(chatId);
      if (!currentBinding) {
        throw new Error('绑定已失效');
      }

      // Use -p with a system-like instruction
      const prompt = `[System Instruction] ${args}`;
      const response = await this._spawnClaude(
        currentBinding.session_id,
        currentBinding.jsonl_path,
        prompt
      );

      await this._sendCard(chatId, this._buildResponseCard(response));

      this._notifyRenderer('feishu:jsonlChanged', {
        jsonlPath: currentBinding.jsonl_path,
        sessionId: currentBinding.session_id
      });
    } catch (err) {
      await this._sendCard(chatId, this._buildErrorCard(err.message)).catch(() => {});
    } finally {
      this._processing = false;
      this._notifyRenderer('feishu:statusChanged', { processing: false });
    }
  }

  /**
   * Read the last N entries from a JSONL conversation file.
   */
  _readHistory(jsonlPath, count) {
    if (!fs.existsSync(jsonlPath)) return [];

    try {
      const stat = fs.statSync(jsonlPath);
      // Only read the tail of large files (> 1MB)
      const MAX_READ = 1024 * 1024;
      let content;
      if (stat.size > MAX_READ) {
        const fd = fs.openSync(jsonlPath, 'r');
        const buf = Buffer.alloc(MAX_READ);
        fs.readSync(fd, buf, 0, MAX_READ, stat.size - MAX_READ);
        fs.closeSync(fd);
        content = buf.toString('utf-8');
        // Discard first partial line
        const nlIdx = content.indexOf('\n');
        if (nlIdx >= 0) content = content.slice(nlIdx + 1);
      } else {
        content = fs.readFileSync(jsonlPath, 'utf-8');
      }

      const lines = content.trim().split('\n').filter(Boolean);
      const recent = lines.slice(-count * 2);  // Get extra to filter meaningful entries

      const entries = [];
      for (const line of recent) {
        try {
          const obj = JSON.parse(line);
          const role = obj.type || (obj.message?.role) || 'unknown';
          let text = '';

          if (typeof obj.message?.content === 'string') {
            text = obj.message.content;
          } else if (Array.isArray(obj.message?.content)) {
            text = obj.message.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n');
          } else if (obj.result) {
            text = typeof obj.result === 'string' ? obj.result : JSON.stringify(obj.result);
          }

          // Skip empty or system-only entries
          if (text.trim()) {
            entries.push({ role, text: text.trim() });
          }
        } catch {
          // Skip malformed lines
        }
      }

      return entries.slice(-count);
    } catch {
      return [];
    }
  }

  /**
   * Spawn Claude Code CLI with --resume to process a message.
   * Derives the correct cwd from the JSONL path so --resume can find the session.
   * Falls back to a new session if the resume target doesn't exist.
   */
  /**
   * Spawn Claude Code CLI with --resume to process a message.
   * Derives the correct cwd from the JSONL path so --resume can find the session.
   * Falls back to a new session if the resume target doesn't exist.
   *
   * ⚠️ SECURITY MODEL: Uses --permission-mode acceptEdits which auto-approves
   * file edits without confirmation. This means anyone who can send messages
   * to the Feishu bot can modify files in the bound project directory.
   * The security boundary is the Feishu bot's message access control:
   * - In P2P chats: only the matched user
   * - In group chats: all group members (add bot to groups with caution)
   * Do NOT expose the bot to untrusted users.
   */
  _spawnClaude(sessionId, jsonlPath, message) {
    return new Promise((resolve, reject) => {
      const args = [
        '-p', message,
        '--output-format', 'json',
        '--permission-mode', 'acceptEdits'
      ];

      // Model override
      if (this._model) {
        args.push('--model', this._model);
      }

      // Derive the correct cwd from the JSONL path's project slug.
      // Claude's --resume looks for <sessionId>.jsonl under
      // ~/.claude/projects/<slug>/ where slug = cwd.replace(/\//g, '-').
      const cwd = this._resolveCwd(jsonlPath);
      let useResume = false;

      if (cwd) {
        // Verify the session file actually exists at the resolved location
        const slug = cwd.replace(/\//g, '-');
        const sessionFile = path.join(os.homedir(), '.claude', 'projects', slug, `${sessionId}.jsonl`);
        if (fs.existsSync(sessionFile)) {
          useResume = true;
          args.push('--resume', sessionId);
        } else {
          console.log(`[feishu] Session file not at ${sessionFile}, starting new conversation`);
        }
      } else {
        console.log(`[feishu] Could not resolve cwd from ${jsonlPath}, starting new conversation`);
      }

      const claudeBin = resolveClaudeBinary();
      console.log(`[feishu] Spawning ${claudeBin} ${args.join(' ')} in ${cwd || 'default cwd'}`);

      const child = spawn(claudeBin, args, {
        cwd: cwd || undefined,
        env: {
          ...process.env,
          PATH: resolveShellPath(),
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this._claudeProcess = child;

      // Close stdin immediately — Claude -p reads the prompt from args,
      // and leaving stdin open causes a 3s "no stdin data" warning.
      child.stdin.end();

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      // 5 minute timeout with SIGKILL escalation
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        // If SIGTERM doesn't work after 10s, force kill
        const killTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch {}
        }, 10000);
        killTimer.unref();
        reject(new Error('Claude Code 超时（5分钟）'));
      }, 300000);

      child.on('close', (code) => {
        clearTimeout(timer);
        this._claudeProcess = null;

        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            // --output-format json returns { type: "result", result: "..." }
            resolve(result.result || result.output || stdout.trim());
          } catch {
            // Fallback: return raw text
            resolve(stdout.trim() || '(空响应)');
          }
        } else {
          const errMsg = stderr.trim() || `exit code ${code}`;
          console.error('[feishu] Claude stderr:', errMsg);
          reject(new Error(`Claude Code 错误: ${errMsg.slice(0, 200)}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this._claudeProcess = null;
        reject(new Error(`无法启动 Claude Code: ${err.message}`));
      });
    });
  }

  /**
   * Derive the real working directory from a JSONL path.
   * JSONL path: ~/.claude/projects/<slug>/<sessionId>.jsonl
   * slug = cwd.replace(/\//g, '-') (also replaces _ with -)
   * We reverse this by trying all possible path decodings and checking
   * filesystem existence.
   */
  _resolveCwd(jsonlPath) {
    if (!jsonlPath) return null;

    const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects');
    const rel = path.relative(claudeProjectsDir, jsonlPath);
    const slashIdx = rel.indexOf('/');
    if (slashIdx < 0) return null;

    const slug = rel.slice(0, slashIdx);
    return decodeProjectSlug(slug);
  }

  /**
   * Send a plain text reply to a Feishu chat.
   */
  async _sendReply(chatId, text) {
    if (!this.channel) return;
    try {
      await this.channel.send(chatId, { text: String(text).slice(0, 4000) });
    } catch (err) {
      console.error('[feishu] Failed to send reply:', err.message);
    }
  }

  /**
   * Send a plain text reply to a Feishu chat (fallback).
   */
  async _sendMarkdown(chatId, text) {
    return this._sendReply(chatId, text);
  }

  /**
   * Send an interactive card message to a Feishu chat.
   * @param {string} chatId - Target chat ID
   * @param {object} card - Card JSON object (schema 2.0)
   */
  async _sendCard(chatId, card) {
    if (!this.client) {
      // Fallback: extract text from card elements
      const fallback = this._extractCardText(card);
      return this._sendReply(chatId, fallback);
    }

    try {
      await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'interactive',
          content: JSON.stringify(card)
        }
      });
    } catch (err) {
      console.error('[feishu] Failed to send card:', err.message);
      const fallback = this._extractCardText(card);
      try {
        await this.channel.send(chatId, { text: fallback });
      } catch (e) {
        console.error('[feishu] Fallback send also failed:', e.message);
      }
    }
  }

  /**
   * Extract plain text from a card for fallback purposes.
   */
  _extractCardText(card) {
    const parts = [];
    if (card.header?.title?.content) parts.push(card.header.title.content);
    for (const el of (card.body?.elements || card.elements || [])) {
      if (el.tag === 'markdown' && el.content) parts.push(el.content);
      if (el.tag === 'div' && el.text?.content) parts.push(el.text.content);
    }
    return parts.join('\n').slice(0, 4000);
  }

  // ── Card Builders ─────────────────────────────────────────────

  /**
   * Build a card for Claude response (success).
   */
  _buildResponseCard(response) {
    const text = String(response || '(空响应)').trim();
    const MAX_LEN = 3500;

    let content;
    if (text.length <= MAX_LEN) {
      content = text;
    } else {
      content = this._smartTruncate(text, MAX_LEN) + '\n\n_...（内容过长已截断）_';
    }

    return {
      schema: '2.0',
      config: { width_mode: 'fill' },
      header: {
        title: { tag: 'plain_text', content: '✅ Claude Code' },
        template: 'turquoise'
      },
      body: {
        elements: [
          { tag: 'markdown', content },
          {
            tag: 'hr'
          },
          { tag: 'markdown', content: '_由 Claude Code 飞书桥接驱动_' }
        ]
      }
    };
  }

  /**
   * Build a card for processing acknowledgment.
   */
  _buildAckCard(preview) {
    return {
      schema: '2.0',
      config: { width_mode: 'fill' },
      header: {
        title: { tag: 'plain_text', content: '⏳ 正在处理' },
        template: 'blue'
      },
      body: {
        elements: [
          { tag: 'markdown', content: `> ${preview}` }
        ]
      }
    };
  }

  /**
   * Build a card for error response.
   */
  _buildErrorCard(message) {
    return {
      schema: '2.0',
      config: { width_mode: 'fill' },
      header: {
        title: { tag: 'plain_text', content: '❌ 处理失败' },
        template: 'red'
      },
      body: {
        elements: [
          { tag: 'markdown', content: `\`\`\`\n${message}\n\`\`\`` }
        ]
      }
    };
  }

  /**
   * Build a card for status/info (neutral).
   */
  _buildInfoCard(title, markdownContent, color = 'blue') {
    return {
      schema: '2.0',
      config: { width_mode: 'fill' },
      header: {
        title: { tag: 'plain_text', content: title },
        template: color
      },
      body: {
        elements: [
          { tag: 'markdown', content: markdownContent }
        ]
      }
    };
  }

  /**
   * Build a card for success confirmation.
   */
  _buildSuccessCard(title, markdownContent) {
    return {
      schema: '2.0',
      config: { width_mode: 'fill' },
      header: {
        title: { tag: 'plain_text', content: title },
        template: 'green'
      },
      body: {
        elements: [
          { tag: 'markdown', content: markdownContent }
        ]
      }
    };
  }

  /**
   * Build a card for warning/prompt.
   */
  _buildWarningCard(title, markdownContent) {
    return {
      schema: '2.0',
      config: { width_mode: 'fill' },
      header: {
        title: { tag: 'plain_text', content: title },
        template: 'orange'
      },
      body: {
        elements: [
          { tag: 'markdown', content: markdownContent }
        ]
      }
    };
  }

  /**
   * Smart truncation: tries to break at newline or space boundaries.
   */
  _smartTruncate(text, maxLen) {
    if (text.length <= maxLen) return text;

    // Try to break at the last newline before maxLen
    let cut = text.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.5) {
      // No good newline break, try space
      cut = text.lastIndexOf(' ', maxLen);
    }
    if (cut < maxLen * 0.5) {
      // No good break point, hard cut
      cut = maxLen;
    }

    return text.slice(0, cut).trimEnd();
  }

  /**
   * Watch the JSONL file for changes and notify the renderer.
   */
  _watchBinding(binding) {
    this._unwatch();

    if (!binding || !binding.jsonl_path) return;
    if (!fs.existsSync(binding.jsonl_path)) return;

    try {
      this._watcher = fs.watch(binding.jsonl_path, (eventType) => {
        if (eventType === 'change') {
          // Debounce: wait 500ms before notifying (Claude Code writes multiple times)
          clearTimeout(this._watchDebounce);
          this._watchDebounce = setTimeout(() => {
            this._notifyRenderer('feishu:jsonlChanged', {
              jsonlPath: binding.jsonl_path,
              sessionId: binding.session_id
            });
          }, 500);
        }
      });
      console.log(`[feishu] Watching ${binding.jsonl_path}`);
    } catch (err) {
      console.error('[feishu] Failed to watch file:', err.message);
    }
  }

  _unwatch() {
    clearTimeout(this._watchDebounce);
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
  }

  /**
   * Send a message to the renderer process.
   */
  _notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * One-time migration: copy credentials from cc-connect config.toml.
   */
  migrateFromCcConnect() {
    const config = this.store.getFeishuConfig();
    if (config && config.app_id) return false; // Already configured

    const tomlPath = path.join(CC_DIR(), 'config.toml');
    if (!fs.existsSync(tomlPath)) return false;

    try {
      const smolTOML = require('smol-toml');
      const content = fs.readFileSync(tomlPath, 'utf-8');
      const data = smolTOML.parse(content);

      // Look for Feishu platform config
      const projects = data.projects;
      if (!Array.isArray(projects)) return false;

      for (const project of projects) {
        const platforms = project.platforms;
        if (!Array.isArray(platforms)) continue;

        for (const platform of platforms) {
          if (platform.type === 'feishu' && platform.options) {
            const appId = platform.options.app_id;
            const appSecret = platform.options.app_secret;
            if (appId && appSecret) {
              this.store.saveFeishuConfig(appId, appSecret);
              console.log('[feishu] Migrated credentials from cc-connect config');
              return true;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[feishu] Failed to migrate from cc-connect:', err.message);
    }

    return false;
  }
}

/**
 * Decode a Claude project slug back to a real filesystem path.
 * Claude encodes the cwd as: slug = cwd.replace(/\//g, '-').
 * Directories with _ in their names also become - in the slug
 * (e.g. /Users/edy/workspace/cloud_test → -Users-edy-workspace-cloud-test).
 *
 * We reverse this by trying all possible path decodings and checking
 * which candidate actually exists on disk. Filesystem checks prune
 * the search tree early so this runs in milliseconds.
 */
function decodeProjectSlug(slug) {
  // slug: '-Users-edy-my-space-claude-history'
  const parts = slug.slice(1).split('-');
  const result = tryDecode(parts, []);
  return result;
}

const MAX_SLUG_PARTS = 16;   // Safety limit on path depth
const MAX_VARIANTS = 64;     // Cap nameVariants output

function tryDecode(parts, currentPath) {
  if (currentPath.length > MAX_SLUG_PARTS) return null;
  if (parts.length === 0) {
    const candidate = '/' + currentPath.join('/');
    return fs.existsSync(candidate) ? candidate : null;
  }

  // Try longer component names first — more likely that consecutive
  // parts belong to the same directory name (e.g. 'my-space').
  for (let len = parts.length; len >= 1; len--) {
    const baseName = parts.slice(0, len).join('-');
    for (const name of nameVariants(baseName)) {
      const candidate = '/' + [...currentPath, name].join('/');
      try {
        fs.accessSync(candidate);
        const result = tryDecode(parts.slice(len), [...currentPath, name]);
        if (result) return result;
      } catch {
        // candidate doesn't exist, skip
      }
    }
  }
  return null;
}

/**
 * Generate name variants by replacing - with _.
 * Tries the original name first, then full replacement,
 * then individual replacements.
 */
function nameVariants(name) {
  if (!name.includes('-')) return [name];

  const results = [name];
  // Full replacement: all - → _
  const full = name.replace(/-/g, '_');
  if (full !== name) results.push(full);

  // For multi-hyphen names, also try partial replacements
  const positions = [];
  for (let i = 0; i < name.length; i++) {
    if (name[i] === '-') positions.push(i);
  }

  if (positions.length >= 2) {
    // Generate all 2^n - 1 non-empty subsets (skip original and full which we already have)
    const n = positions.length;
    for (let mask = 1; mask < (1 << n) && results.length < MAX_VARIANTS; mask++) {
      if (mask === (1 << n) - 1) continue; // Skip full replacement (already added)
      const arr = name.split('');
      for (let bit = 0; bit < n; bit++) {
        if (mask & (1 << bit)) arr[positions[bit]] = '_';
      }
      results.push(arr.join(''));
    }
  }

  return results;
}

module.exports = { FeishuBridge };
