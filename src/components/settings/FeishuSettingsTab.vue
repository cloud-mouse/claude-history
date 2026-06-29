<template>
  <div class="feishu-tab">
    <!-- Page head -->
    <div class="page-head">
      <div class="page-head-text">
        <h1>飞书机器人</h1>
        <div class="subtitle">每个机器人是一个独立飞书应用，创建时绑定服务的工作目录</div>
      </div>
      <button class="btn btn-primary btn-lg" @click="openCreate">+ 添加机器人</button>
    </div>

    <!-- Overview chips -->
    <div class="overview">
      <div class="overview-chip">
        <div class="num">{{ feishuStore.totalBots }}</div>
        <div class="lbl">机器人总数</div>
      </div>
      <div class="overview-chip">
        <div class="num green">{{ feishuStore.onlineBots }}</div>
        <div class="lbl">在线</div>
      </div>
      <div class="overview-chip">
        <div class="num blue">{{ feishuStore.boundBots }}</div>
        <div class="lbl">绑定中</div>
      </div>
      <div class="overview-chip">
        <div class="num">{{ feishuStore.idleBots }}</div>
        <div class="lbl">空闲</div>
      </div>
    </div>

    <!-- Bot list -->
    <div class="section-head"><h2>我的机器人</h2></div>

    <div v-if="feishuStore.bots.length === 0" class="empty-state">
      <p>暂无机器人。点击右上角「添加机器人」开始。</p>
    </div>

    <div v-else class="bot-list">
      <div v-for="b in feishuStore.bots" :key="b.id" class="bot-card">
        <div class="bot-card-top">
          <div class="bot-avatar" :style="{ background: avatarGradient(b.id) }">
            {{ avatarChar(b.name) }}
          </div>
          <div class="bot-meta">
            <div class="bot-name">
              {{ b.name }}
              <span class="status-pill" :class="b.online ? 'online' : 'offline'">
                <span class="dot" :class="b.online ? 'on' : 'off'"></span>
                {{ b.online ? '在线' : '离线' }}
              </span>
            </div>
            <div class="bot-id">{{ b.appId }}</div>
          </div>
          <div class="card-actions">
            <button class="btn btn-ghost" @click="openEdit(b)" title="编辑">编辑</button>
            <button class="btn btn-danger-ghost" @click="confirmDelete(b)" title="删除">删除</button>
          </div>
        </div>

        <!-- Service directory -->
        <div class="bot-card-mid">
          <span class="folder-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </span>
          <span>服务目录</span>
          <code v-if="b.projectDir">{{ b.projectDir }}</code>
          <code v-else class="missing-dir">未设置</code>
        </div>

        <!-- needsProjectDir prominent warning -->
        <div v-if="b.needsProjectDir" class="needs-dir-warn">
          <span class="warn-icon">!</span>
          <span>此机器人缺少服务目录，请编辑后一次性补填才能启用。</span>
        </div>

        <!-- Binding row -->
        <div class="binding-row">
          <div class="binding-info">
            <template v-if="b.binding">
              <span class="bound">● 绑定中</span>
              <span class="binding-sep">·</span>
              <span>会话 <code>{{ shortId(b.binding.sessionId) }}</code></span>
              <button
                class="btn btn-ghost btn-xs unbind-btn"
                title="解除该机器人的会话绑定"
                @click="onUnbind(b)"
              >解除绑定</button>
            </template>
            <template v-else>
              <span class="idle">○ 空闲 · 未绑定会话</span>
            </template>
          </div>
          <div class="card-actions binding-actions">
            <button
              class="btn"
              :disabled="!b.projectDir"
              :title="bindBtnTitle(b)"
              @click="openBindForBot(b)"
            >{{ b.binding ? '更换会话' : '绑定会话' }}</button>
            <button
              class="btn"
              :class="b.enabled ? 'btn-danger-ghost' : 'btn-primary'"
              :disabled="b.needsProjectDir"
              :title="b.needsProjectDir ? '请先补全服务目录再启用' : ''"
              @click="onToggleEnabled(b)"
            >{{ b.enabled ? '停用' : '启用' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Instructions -->
    <div class="setting-card help-card">
      <h3 class="card-title">使用说明</h3>
      <ol class="help-list">
        <li>在飞书开发者后台创建企业自建应用，获取 App ID 和 Secret</li>
        <li>启用应用的「机器人」功能，订阅 <code>im.message.receive_v1</code>（长连接模式）</li>
        <li>点击「添加机器人」填写凭证与服务目录</li>
        <li>启用机器人后会自动连接飞书</li>
        <li>在会话列表右键菜单选择「绑定到飞书」，或在此处点击「绑定会话」</li>
        <li>从飞书给机器人发消息即可触发对应会话</li>
      </ol>
    </div>

    <!-- Inline toast for feedback -->
    <transition name="toast">
      <div v-if="toast" class="tab-toast" :class="toast.success ? 'success' : 'error'">
        {{ toast.message }}
      </div>
    </transition>

    <!-- Create / Edit modal -->
    <BotEditModal
      :show="editModal.show"
      :bot="editModal.bot"
      :existing-app-ids="existingAppIds"
      @close="closeEdit"
      @submit="onEditSubmit"
    />

    <!-- Bot-side session picker (open from a bot card) -->
    <BotSessionPicker
      :show="sessionPicker.show"
      :bot="sessionPicker.bot"
      @close="closeSessionPicker"
      @bind="onSessionPickerBind"
      @rebind-needed="onSessionPickerRebindNeeded"
    />

    <!-- Rebind confirmation -->
    <RebindConfirmModal
      :show="rebindModal.show"
      :info="rebindModal.info"
      @close="closeRebind"
      @confirm="onRebindConfirm"
    />

    <!-- Delete confirmation -->
    <ConfirmDialog
      :show="deleteConfirm.show"
      title="删除机器人"
      :message="deleteConfirm.message"
      type="danger"
      @confirm="doDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue';
import { useFeishuStore } from '../../stores/feishu';
import { useProjectsStore } from '../../stores/projects';
import BotEditModal from '../feishu/BotEditModal.vue';
import BotSessionPicker from '../feishu/BotSessionPicker.vue';
import RebindConfirmModal from '../feishu/RebindConfirmModal.vue';
import ConfirmDialog from '../common/ConfirmDialog.vue';
import { avatarGradient, avatarChar } from '../../utils/bot-avatar';

const feishuStore = useFeishuStore();
const projectsStore = useProjectsStore();

// --- Toast ---
const toast = ref(null);
let toastTimer = null;
function showToast(message, success = true) {
  toast.value = { message, success };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = null; }, 4000);
}

// --- Create / Edit modal state ---
const editModal = ref({ show: false, bot: null });
function openCreate() {
  editModal.value = { show: true, bot: null };
}
function openEdit(bot) {
  editModal.value = { show: true, bot };
}
function closeEdit() {
  editModal.value = { show: false, bot: null };
}

// App IDs already in use, excluding the bot being edited (for client dup check).
const existingAppIds = computed(() => {
  const editingId = editModal.value.bot?.id;
  return feishuStore.bots
    .filter((b) => b.id !== editingId)
    .map((b) => b.appId)
    .filter(Boolean);
});

async function onEditSubmit({ payload, done }) {
  const isEdit = !!payload.botId;
  const result = isEdit
    ? await feishuStore.updateBot(payload)
    : await feishuStore.createBot(payload);
  done && done();
  if (result.success) {
    showToast(isEdit ? '已保存机器人' : '已创建机器人', true);
    closeEdit();
    // For create, auto-enable so the bot connects (matches prototype 「创建并连接」).
    if (!isEdit && result.bot && !result.bot.enabled) {
      const toggle = await feishuStore.toggleBot({ botId: result.bot.id, enabled: true });
      if (!toggle.success) {
        showToast(toggle.error || '启用失败，请稍后手动启用', false);
      }
    }
  } else {
    showToast(result.error || '保存失败', false);
  }
}

// --- Bot-side bind (session picker): opens from a bot card. Lists the sessions
// under the bot's projectDir and lets the user pick one to bind. If the bot is
// already bound to a different session, picking a new one triggers the rebind
// confirmation. See design §10.2 / decision 3.
const sessionPicker = ref({ show: false, bot: null });
function openBindForBot(bot) {
  if (!bot.projectDir) {
    showToast('请先编辑机器人补全服务目录', false);
    return;
  }
  sessionPicker.value = { show: true, bot };
}
function closeSessionPicker() {
  sessionPicker.value = { show: false, bot: null };
}
function onSessionPickerBind() {
  showToast('已绑定会话', true);
  closeSessionPicker();
}
function onSessionPickerRebindNeeded(info) {
  closeSessionPicker();
  rebindModal.value = { show: true, info };
}

// --- Rebind confirm (shared by bot-side session picker) ---
const rebindModal = ref({ show: false, info: {} });
function closeRebind() {
  rebindModal.value = { show: false, info: {} };
}

async function onRebindConfirm({ botId, jsonlPath, done }) {
  const result = await feishuStore.rebindSessionToBot({ botId, jsonlPath });
  done && done();
  if (result.success) {
    showToast('已换绑', true);
    closeRebind();
  } else {
    showToast(result.error || '换绑失败', false);
  }
}

// --- Unbind ---
async function onUnbind(bot) {
  const result = await feishuStore.unbindBot(bot.id);
  if (result.success) {
    showToast('已解除绑定', true);
  } else {
    showToast(result.error || '解绑失败', false);
  }
}

// --- Toggle enabled (toggles the persisted `enabled` preference; the runtime
// will start/stop the WS connection accordingly and reflect via statusChanged). ---
async function onToggleEnabled(bot) {
  const enabled = !bot.enabled;
  const result = await feishuStore.toggleBot({ botId: bot.id, enabled });
  if (!result.success) {
    if (result.code === 'NEEDS_PROJECT_DIR') {
      showToast('请先编辑机器人补全服务目录，再启用', false);
    } else {
      showToast(result.error || '操作失败', false);
    }
  }
}

function bindBtnTitle(b) {
  if (!b.projectDir) return '请先补全服务目录';
  return b.binding ? '更换绑定的会话' : '从该目录下选择会话绑定';
}

// --- Delete ---
const deleteConfirm = ref({ show: false, botId: null, message: '' });

function confirmDelete(b) {
  deleteConfirm.value = {
    show: true,
    botId: b.id,
    message: `确定要删除机器人「${b.name}」吗？此操作不可撤销。`
  };
}
function cancelDelete() {
  deleteConfirm.value = { show: false, botId: null, message: '' };
}
async function doDelete() {
  const botId = deleteConfirm.value.botId;
  if (botId == null) return;
  const result = await feishuStore.deleteBot(botId);
  if (result.success) {
    showToast('已删除机器人', true);
  } else {
    if (result.code === 'BOT_ONLINE') {
      showToast('请先停用机器人再删除', false);
    } else if (result.code === 'BOT_BOUND') {
      showToast('请先解除绑定再删除', false);
    } else {
      showToast(result.error || '删除失败', false);
    }
  }
  cancelDelete();
}

// --- Helpers ---
function shortId(id) {
  if (!id) return '?';
  return id.length > 8 ? id.slice(0, 8) + '…' : id;
}

onMounted(async () => {
  await feishuStore.detect();
  if (!projectsStore.projects.length) {
    projectsStore.loadProjects();
  }
});
// KeepAlive: refresh status when revisiting the tab.
onActivated(() => { feishuStore.detect(); });
</script>

<style scoped>
.feishu-tab { display: flex; flex-direction: column; }

.page-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  margin-bottom: 18px; gap: 12px;
}
.page-head h1 { font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.2px; }
.page-head .subtitle { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

.overview { display: flex; gap: 10px; margin-bottom: 22px; }
.overview-chip {
  flex: 1;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-card);
  padding: 12px 14px;
}
.overview-chip .num { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.overview-chip .num.green { color: var(--success); }
.overview-chip .num.blue { color: var(--primary); }
.overview-chip .lbl {
  font-size: 11px; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px;
}

.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-head h2 {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.6px; margin: 0;
}

.empty-state {
  padding: 32px 16px; text-align: center;
  color: var(--text-muted); font-size: 13px;
  background: var(--bg-secondary); border-radius: var(--radius-card);
}

.bot-list { display: flex; flex-direction: column; gap: 10px; }
.bot-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-card);
  padding: 14px 16px;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.bot-card:hover { border-color: var(--border-color); background: var(--bg-tertiary); }

.bot-card-top { display: flex; align-items: center; gap: 12px; }
.bot-avatar {
  width: 38px; height: 38px; flex-shrink: 0;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700; color: #fff;
}
.bot-meta { flex: 1; min-width: 0; }
.bot-name {
  font-size: 14px; font-weight: 600;
  display: flex; align-items: center; gap: 8px;
  color: var(--text-primary);
}
.bot-id {
  font-size: 11px; color: var(--text-muted);
  font-family: var(--font-mono); margin-top: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.status-pill {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 500;
  padding: 2px 8px; border-radius: 20px;
}
.status-pill.online { background: var(--success-bg); color: var(--success); }
.status-pill.offline { background: var(--surface-hover); color: var(--text-muted); }
.dot { width: 6px; height: 6px; border-radius: 50%; }
.dot.on {
  background: var(--success);
  box-shadow: 0 0 6px var(--success-bg);
  animation: bot-pulse 2s infinite;
}
.dot.off { background: var(--text-muted); }
@keyframes bot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

.bot-card-mid {
  display: flex; align-items: center; gap: 6px;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--border-light);
  font-size: 12px; color: var(--text-secondary);
}
.folder-icon { color: var(--primary); display: inline-flex; }
.bot-card-mid code {
  font-family: var(--font-mono); font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 1px 6px; border-radius: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 100%;
}
.bot-card-mid code.missing-dir { color: var(--warning); }

.needs-dir-warn {
  display: flex; align-items: center; gap: 8px;
  margin-top: 8px; padding: 8px 10px;
  background: var(--warning-bg);
  border-radius: var(--radius-control);
  font-size: 12px; color: var(--warning);
}
.needs-dir-warn .warn-icon {
  width: 18px; height: 18px; flex-shrink: 0;
  border-radius: 50%;
  background: var(--warning); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700;
}

.binding-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 10px; gap: 8px; flex-wrap: wrap;
}
.binding-info {
  font-size: 12px; color: var(--text-secondary);
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
}
.binding-info .bound { color: var(--success); font-weight: 500; }
.binding-info .idle { color: var(--text-muted); }
.binding-info .binding-sep { color: var(--text-muted); }
.binding-info code {
  font-family: var(--font-mono); font-size: 11px;
  background: var(--bg-tertiary); padding: 1px 5px; border-radius: 4px;
  color: var(--text-primary);
}
.unbind-btn { margin-left: 4px; }

.card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.binding-actions { justify-content: flex-end; }

.btn {
  padding: 6px 12px; border-radius: var(--radius-control);
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary); color: var(--text-primary);
  font-size: 12px; font-weight: 500; cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast);
  white-space: nowrap;
}
.btn:hover:not(:disabled) { background: var(--surface-hover); border-color: var(--border-color); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary { background: var(--primary); border-color: var(--primary); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--primary-hover); border-color: var(--primary-hover); }
.btn-danger-ghost {
  background: transparent; color: var(--danger);
  border-color: var(--danger-bg);
}
.btn-danger-ghost:hover:not(:disabled) { background: var(--danger-bg); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--text-secondary); }
.btn-ghost:hover:not(:disabled) { background: var(--bg-tertiary); color: var(--text-primary); }
.btn-lg { padding: 9px 18px; font-size: 13px; }
.btn-xs { padding: 2px 8px; font-size: 11px; }

.help-card { margin-top: 22px; background: var(--bg-secondary); }
.card-title {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.6px;
}
.help-list {
  padding-left: 20px; font-size: 13px;
  color: var(--text-secondary); margin: 0; line-height: 1.7;
}
.help-list li { margin-bottom: 4px; }
.help-list code {
  font-size: 12px; background: var(--bg-tertiary);
  padding: 1px 5px; border-radius: var(--radius-control);
  font-family: var(--font-mono);
}

/* Inline toast (matches ConversationList toast styling) */
.tab-toast {
  position: fixed;
  bottom: 24px; left: 50%; transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: var(--radius-control);
  font-size: 13px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
  z-index: 10020;
  pointer-events: none;
}
.tab-toast.success { color: var(--success); border-color: var(--success); }
.tab-toast.error { color: var(--danger); border-color: var(--danger); }

.toast-enter-active, .toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-enter-from, .toast-leave-to {
  opacity: 0; transform: translate(-50%, 8px);
}
</style>
