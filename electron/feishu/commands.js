'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { buildInfoCard, buildSuccessCard, buildWarningCard, buildErrorCard, buildAckCard } = require('./cards');
const { resolveCwd } = require('./binding');

function parseCommand(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx < 0) return { cmd: trimmed.slice(1).toLowerCase(), args: '' };
  return { cmd: trimmed.slice(1, spaceIdx).toLowerCase(), args: trimmed.slice(spaceIdx + 1).trim() };
}

/**
 * Dispatch a slash command. ctx provides all bridge dependencies.
 */
async function handleCommand(ctx) {
  const { chatId, text, binding } = ctx;
  const parsed = parseCommand(text);
  if (!parsed) return;
  const { cmd, args } = parsed;

  const commands = {
    help:       () => cmdHelp(ctx),
    帮助:       () => cmdHelp(ctx),
    status:     () => cmdStatus(ctx),
    状态:       () => cmdStatus(ctx),
    bind:       () => cmdBind(ctx),
    cancel:     () => cmdCancel(ctx),
    取消:       () => cmdCancel(ctx),
    new:        () => cmdNew(ctx),
    clear:      () => cmdNew(ctx),
    cd:         () => cmdCd(ctx),
    model:      () => cmdModel(ctx),
    history:    () => cmdHistory(ctx),
    历史:       () => cmdHistory(ctx),
    sessions:   () => cmdSessions(ctx),
    会话:       () => cmdSessions(ctx),
    switch:     () => cmdSwitch(ctx),
    repeat:     () => cmdRepeat(ctx),
    system:     () => cmdSystem(ctx),
    confirm:    () => cmdConfirm(ctx),
    permission: () => cmdPermission(ctx),
    权限:       () => cmdPermission(ctx),
    allow:      () => cmdAllow(ctx),
    disallow:   () => cmdDisallow(ctx),
  };

  const handler = commands[cmd];
  if (handler) {
    try { await handler(); } catch (err) {
      console.error(`[feishu] Command /${cmd} error:`, err.message);
      await ctx.sendCard(chatId, buildErrorCard(`命令执行失败: ${err.message}`));
    }
  } else {
    await ctx.sendCard(chatId, buildWarningCard(`❓ 未知命令 /${cmd}`, '输入 `/help` 查看所有可用命令'));
  }
}

async function requireBinding(ctx) {
  if (ctx.binding) return true;
  await ctx.sendCard(ctx.chatId, buildWarningCard('😔 未绑定', '当前没有绑定'));
  return false;
}

async function cmdHelp(ctx) {
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
    '`/confirm [on|off]` — 开启/关闭执行确认',
    '`/permission [mode]` — 查看/设置权限模式',
    '`/allow <tool>` — 始终允许指定工具',
    '`/disallow <tool>` — 取消始终允许',
    '',
    '💡 直接发送非 `/` 开头的消息即可与 Claude 对话'
  ].join('\n');
  await ctx.sendCard(ctx.chatId, buildInfoCard('📖 命令手册', content, 'purple'));
}

async function cmdStatus(ctx) {
  const { chatId, binding, store, permissions } = ctx;
  const config = store.getFeishuConfig();
  const lines = [
    `**连接状态**`,
    `处理任务: ${ctx.getProcessing() ? '⏳ 处理中' : '✅ 空闲'}`,
    `模型: \`${ctx.getModel() || '默认'}\``,
    `确认模式: ${ctx.getConfirmMode() ? '🔐 开启' : '🔓 关闭'}`,
    `权限模式: \`${permissions.mode}\``,
    `凭证: ${config.app_id ? '✅ 已配置' : '❌ 未配置'}`,
  ];
  if (binding) {
    const cwd = resolveCwd(binding.jsonl_path) || binding.project_dir || '(未知)';
    lines.push('', '**当前绑定**');
    lines.push(`会话: \`${binding.session_id.slice(0, 8)}...\``);
    lines.push(`项目: \`${cwd}\``);
    const alwaysAllowed = permissions.getAlwaysAllowed();
    if (alwaysAllowed.length > 0) lines.push(`始终允许: \`${alwaysAllowed.join(', ')}\``);
  } else {
    lines.push('', '📎 绑定: 无（请在桌面端绑定）');
  }
  await ctx.sendCard(chatId, buildInfoCard('📊 系统状态', lines.join('\n'), 'blue'));
}

async function cmdBind(ctx) {
  const { chatId, binding } = ctx;
  if (!binding) {
    await ctx.sendCard(chatId, buildWarningCard('😔 未绑定', '请在 **claude-history** 桌面应用中点击「绑定到飞书」'));
    return;
  }
  const displayCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  const content = [
    `Chat ID: \`${binding.chat_id}\``,
    `会话 ID: \`${binding.session_id.slice(0, 16)}...\``,
    `项目目录: \`${displayCwd}\``,
    `JSONL: \`${path.basename(binding.jsonl_path)}\``,
    `模型: \`${ctx.getModel() || '默认'}\``,
    `权限模式: \`${ctx.permissions.mode}\``,
  ].join('\n');
  await ctx.sendCard(chatId, buildInfoCard('📎 绑定信息', content, 'indigo'));
}

async function cmdCancel(ctx) {
  if (!ctx.getProcessing()) {
    await ctx.sendCard(ctx.chatId, buildInfoCard('ℹ️ 无任务', '当前没有正在处理的任务', 'grey'));
    return;
  }
  // Kill the real child (C3). _processing is released by _withProcessing's
  // finally once the spawn promise rejects — do not reset it manually here.
  ctx.killClaude();
  await ctx.sendCard(ctx.chatId, buildSuccessCard('✅ 已取消', '当前任务已被终止'));
}

async function cmdNew(ctx) {
  const { chatId, binding, store } = ctx;
  if (!await requireBinding(ctx)) return;
  const newSessionId = crypto.randomUUID();
  const realCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  const slug = realCwd.replace(/\//g, '-');
  const newJsonlPath = path.join(os.homedir(), '.claude', 'projects', slug, `${newSessionId}.jsonl`);
  store.updateBinding(binding.chat_id, { session_id: newSessionId, jsonl_path: newJsonlPath });
  await ctx.sendCard(chatId, buildSuccessCard('✅ 已开启新会话', [
    `会话 ID: \`${newSessionId.slice(0, 8)}...\``,
    `项目: \`${realCwd}\``, '', '💡 发送消息即可开始新对话'
  ].join('\n')));
}

async function cmdCd(ctx) {
  const { chatId, binding, store } = ctx;
  const args = ctx.args;
  if (!await requireBinding(ctx)) return;
  if (!args) {
    const realCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
    await ctx.sendCard(chatId, buildInfoCard('📂 当前目录', `\`${realCwd}\``, 'indigo'));
    return;
  }
  const baseCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  let targetPath = args.replace(/^~/, os.homedir());
  if (!path.isAbsolute(targetPath)) targetPath = path.resolve(baseCwd, targetPath);
  if (!fs.existsSync(targetPath)) { await ctx.sendCard(chatId, buildErrorCard(`路径不存在: ${targetPath}`)); return; }
  if (!fs.statSync(targetPath).isDirectory()) { await ctx.sendCard(chatId, buildErrorCard(`不是目录: ${targetPath}`)); return; }
  const newSessionId = crypto.randomUUID();
  const slug = targetPath.replace(/\//g, '-');
  const newJsonlPath = path.join(os.homedir(), '.claude', 'projects', slug, `${newSessionId}.jsonl`);
  store.updateBinding(binding.chat_id, { project_dir: targetPath, session_id: newSessionId, jsonl_path: newJsonlPath });
  await ctx.sendCard(chatId, buildSuccessCard('✅ 已切换工作目录', [
    `📂 新目录: \`${targetPath}\``,
    `🔄 新会话: \`${newSessionId.slice(0, 8)}...\``, '', '💡 目录变更会自动开启新会话'
  ].join('\n')));
}

async function cmdModel(ctx) {
  const { chatId } = ctx;
  const args = ctx.args;
  if (!args) {
    const current = ctx.getModel() ? `\`${ctx.getModel()}\`` : '默认（Claude 自动选择）';
    await ctx.sendCard(chatId, buildInfoCard('🤖 当前模型', [`当前: ${current}`, '', '可用值: \`sonnet\` \`opus\` \`haiku\`'].join('\n'), 'violet'));
    return;
  }
  const valid = ['sonnet', 'opus', 'haiku'];
  const model = args.toLowerCase().trim();
  if (!valid.includes(model)) { await ctx.sendCard(chatId, buildErrorCard(`未知模型: ${model}\n可用: ${valid.join(', ')}`)); return; }
  ctx.setModel(model);
  await ctx.sendCard(chatId, buildSuccessCard('✅ 模型已设置', `当前模型: \`${model}\``));
}

async function cmdHistory(ctx) {
  const { chatId, binding } = ctx;
  const args = ctx.args;
  if (!await requireBinding(ctx)) return;
  if (!fs.existsSync(binding.jsonl_path)) { await ctx.sendCard(chatId, buildInfoCard('📭 历史消息', '暂无历史消息（新会话）', 'grey')); return; }
  const count = Math.min(parseInt(args) || 5, 20);
  const entries = readHistory(binding.jsonl_path, count);
  if (entries.length === 0) { await ctx.sendCard(chatId, buildInfoCard('📭 历史消息', '暂无历史消息', 'grey')); return; }
  const lines = [];
  for (const entry of entries) {
    const icon = entry.role === 'human' ? '👤' : entry.role === 'assistant' ? '🤖' : '⚙️';
    const text = entry.text.length > 150 ? entry.text.slice(0, 150) + '...' : entry.text;
    lines.push(`${icon} ${text}`, '');
  }
  await ctx.sendCard(chatId, buildInfoCard(`📜 最近 ${entries.length} 条消息`, lines.join('\n'), 'indigo'));
}

async function cmdSessions(ctx) {
  const { chatId, binding } = ctx;
  if (!await requireBinding(ctx)) return;
  const realCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  const slug = realCwd.replace(/\//g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', slug);
  if (!fs.existsSync(projectDir)) { await ctx.sendCard(chatId, buildInfoCard('📭 会话列表', '当前项目暂无会话记录', 'grey')); return; }
  const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl')).map(f => {
    try { const stat = fs.statSync(path.join(projectDir, f)); return { name: f, mtime: stat.mtime }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime).slice(0, 15);
  if (files.length === 0) { await ctx.sendCard(chatId, buildInfoCard('📭 会话列表', '当前项目暂无会话记录', 'grey')); return; }
  const lines = [];
  for (let i = 0; i < files.length; i++) {
    const sid = files[i].name.replace('.jsonl', '');
    const current = sid === binding.session_id ? ' ← 当前' : '';
    lines.push(`\`${i + 1}\`. \`${sid.slice(0, 8)}...\` (${files[i].mtime.toLocaleDateString('zh-CN')})${current}`);
  }
  lines.push('', '💡 使用 `/switch <序号>` 切换会话');
  await ctx.sendCard(chatId, buildInfoCard(`📋 会话列表 (${files.length})`, lines.join('\n'), 'indigo'));
}

async function cmdSwitch(ctx) {
  const { chatId, binding, store } = ctx;
  const args = ctx.args;
  if (!await requireBinding(ctx)) return;
  if (!args) { await ctx.sendCard(chatId, buildWarningCard('❌ 缺少参数', '请指定会话序号或 ID\n例: `/switch 1`')); return; }
  const realCwd = resolveCwd(binding.jsonl_path) || binding.project_dir;
  const slug = realCwd.replace(/\//g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', slug);
  if (!fs.existsSync(projectDir)) { await ctx.sendCard(chatId, buildErrorCard('项目目录不存在')); return; }
  const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl')).map(f => {
    try { const stat = fs.statSync(path.join(projectDir, f)); return { name: f, mtime: stat.mtime }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
  let targetFile = null;
  const idx = parseInt(args);
  if (!isNaN(idx) && idx >= 1 && idx <= files.length) targetFile = files[idx - 1];
  else targetFile = files.find(f => f.name.startsWith(args) || f.name === `${args}.jsonl`);
  if (!targetFile) { await ctx.sendCard(chatId, buildErrorCard(`未找到会话: ${args}\n使用 /sessions 查看可用会话`)); return; }
  const newSessionId = targetFile.name.replace('.jsonl', '');
  const newJsonlPath = path.join(projectDir, targetFile.name);
  store.updateBinding(binding.chat_id, { session_id: newSessionId, jsonl_path: newJsonlPath });
  await ctx.sendCard(chatId, buildSuccessCard('✅ 已切换会话', [
    `会话: \`${newSessionId.slice(0, 8)}...\``,
    `修改时间: ${targetFile.mtime.toLocaleString('zh-CN')}`, '', '💡 发送消息即可继续对话'
  ].join('\n')));
}

async function cmdRepeat(ctx) {
  const { chatId, store } = ctx;
  if (!await requireBinding(ctx)) return;
  const lastMessage = ctx.getLastMessage();
  if (!lastMessage) { await ctx.sendCard(chatId, buildInfoCard('📭 无消息', '没有上一条消息可重复', 'grey')); return; }
  if (ctx.getProcessing()) { await ctx.sendCard(chatId, buildWarningCard('⏳ 处理中', '正在处理中，请先 /cancel')); return; }
  await ctx.sendCard(chatId, buildAckCard(lastMessage.slice(0, 30) + ' (重复)'));
  await ctx.withProcessing(async () => {
    try {
      const currentBinding = store.getBindingByChatId(chatId);
      if (!currentBinding) throw new Error('绑定已失效');
      await ctx.spawnClaude({ sessionId: currentBinding.session_id, jsonlPath: currentBinding.jsonl_path, message: lastMessage, chatId });
      // The final answer is rendered into the live progress card by spawnClaude.
      ctx.notifyRenderer('feishu:jsonlChanged', { jsonlPath: currentBinding.jsonl_path, sessionId: currentBinding.session_id });
    } catch (err) { if (!err._cardHandled) await ctx.sendCard(chatId, buildErrorCard(err.message)).catch(() => {}); }
  });
}

async function cmdSystem(ctx) {
  const { chatId, store } = ctx;
  const args = ctx.args;
  if (!await requireBinding(ctx)) return;
  if (!args) { await ctx.sendCard(chatId, buildWarningCard('❌ 缺少参数', '请输入系统提示内容\n例: `/system 你是一个专业的代码审查助手`')); return; }
  if (ctx.getProcessing()) { await ctx.sendCard(chatId, buildWarningCard('⏳ 处理中', '正在处理中，请先 /cancel')); return; }
  await ctx.sendCard(chatId, buildAckCard(args.slice(0, 50)));
  await ctx.withProcessing(async () => {
    try {
      const currentBinding = store.getBindingByChatId(chatId);
      if (!currentBinding) throw new Error('绑定已失效');
      await ctx.spawnClaude({ sessionId: currentBinding.session_id, jsonlPath: currentBinding.jsonl_path, message: `[System Instruction] ${args}`, chatId });
      // The final answer is rendered into the live progress card by spawnClaude.
      ctx.notifyRenderer('feishu:jsonlChanged', { jsonlPath: currentBinding.jsonl_path, sessionId: currentBinding.session_id });
    } catch (err) { if (!err._cardHandled) await ctx.sendCard(chatId, buildErrorCard(err.message)).catch(() => {}); }
  });
}

async function cmdConfirm(ctx) {
  const { chatId } = ctx;
  const args = ctx.args;
  if (!args) {
    const mode = ctx.getConfirmMode() ? '开启（每条消息需确认）' : '关闭（自动执行）';
    await ctx.sendCard(chatId, buildInfoCard('🔐 确认模式', [`当前: **${mode}**`, '', '用法:', '`/confirm on` — 开启确认', '`/confirm off` — 关闭确认'].join('\n'), 'violet'));
    return;
  }
  const val = args.toLowerCase().trim();
  if (val === 'on') { ctx.setConfirmMode(true); await ctx.sendCard(chatId, buildSuccessCard('✅ 已开启确认模式', '每条消息执行前需要用户确认')); }
  else if (val === 'off') { ctx.setConfirmMode(false); await ctx.sendCard(chatId, buildSuccessCard('✅ 已关闭确认模式', '消息将自动执行，无需确认')); }
  else await ctx.sendCard(chatId, buildErrorCard('未知参数，请使用 `/confirm on` 或 `/confirm off`'));
}

async function cmdPermission(ctx) {
  const { chatId, permissions } = ctx;
  const args = ctx.args;
  if (!args) {
    const alwaysAllowed = permissions.getAlwaysAllowed();
    const lines = [`当前权限模式: \`${permissions.mode}\``, '', '**可用模式:**', '`default` — 敏感工具需要确认', '`plan` — 读取自动，写入需确认', '`acceptEdits` — 文件编辑自动，Bash 需确认', '`bypass` — 全部自动通过', '', `始终允许的工具: ${alwaysAllowed.length > 0 ? alwaysAllowed.map(t => `\`${t}\``).join(', ') : '无'}`, '', '用法: `/permission <mode>`'].join('\n');
    await ctx.sendCard(chatId, buildInfoCard('🔐 权限模式', lines, 'violet'));
    return;
  }
  try {
    permissions.setMode(args.toLowerCase().trim());
    await ctx.sendCard(chatId, buildSuccessCard('✅ 权限模式已设置', `当前模式: \`${args.toLowerCase().trim()}\`\n\n_下次 Claude 调用时生效_`));
  } catch (err) { await ctx.sendCard(chatId, buildErrorCard(err.message)); }
}

async function cmdAllow(ctx) {
  const { chatId, permissions } = ctx;
  const args = ctx.args;
  if (!args) { await ctx.sendCard(chatId, buildWarningCard('❌ 缺少参数', '请指定工具名\n例: `/allow Bash`')); return; }
  permissions.alwaysAllow(args.trim());
  await ctx.sendCard(chatId, buildSuccessCard('✅ 已添加始终允许', `工具 \`${args.trim()}\` 将不再需要确认`));
}

async function cmdDisallow(ctx) {
  const { chatId, permissions } = ctx;
  const args = ctx.args;
  if (!args) { await ctx.sendCard(chatId, buildWarningCard('❌ 缺少参数', '请指定工具名\n例: `/disallow Bash`')); return; }
  permissions.disallow(args.trim());
  await ctx.sendCard(chatId, buildSuccessCard('✅ 已移除始终允许', `工具 \`${args.trim()}\` 将恢复确认`));
}

function readHistory(jsonlPath, count) {
  if (!fs.existsSync(jsonlPath)) return [];
  try {
    const stat = fs.statSync(jsonlPath);
    const MAX_READ = 1024 * 1024;
    let content;
    if (stat.size > MAX_READ) {
      const fd = fs.openSync(jsonlPath, 'r');
      const buf = Buffer.alloc(MAX_READ);
      fs.readSync(fd, buf, 0, MAX_READ, stat.size - MAX_READ);
      fs.closeSync(fd);
      content = buf.toString('utf-8');
      const nlIdx = content.indexOf('\n');
      if (nlIdx >= 0) content = content.slice(nlIdx + 1);
    } else content = fs.readFileSync(jsonlPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const entries = [];
    for (const line of lines.slice(-count * 2)) {
      try {
        const obj = JSON.parse(line);
        const role = obj.type || (obj.message?.role) || 'unknown';
        let text = '';
        if (typeof obj.message?.content === 'string') text = obj.message.content;
        else if (Array.isArray(obj.message?.content)) text = obj.message.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        else if (obj.result) text = typeof obj.result === 'string' ? obj.result : JSON.stringify(obj.result);
        if (text.trim()) entries.push({ role, text: text.trim() });
      } catch {}
    }
    return entries.slice(-count);
  } catch { return []; }
}

module.exports = { parseCommand, handleCommand };
