<template>
  <Teleport to="body">
    <transition name="modal">
      <div v-if="show" class="settings-overlay" @click.self="$emit('close')">
        <div class="settings-modal">
          <div class="modal-header">
            <h2>飞书桥接设置</h2>
            <button class="close-btn" @click="$emit('close')">&times;</button>
          </div>

          <div class="modal-body">
            <!-- Connection status -->
            <div class="setting-card status-card">
              <span class="status-dot" :class="feishuStore.connected ? 'connected' : 'disconnected'"></span>
              <span class="status-text">
                {{ feishuStore.connected ? '已连接' : '未连接' }}
                <span v-if="feishuStore.processing" class="processing-tag">处理中...</span>
              </span>
            </div>

            <!-- Feishu credentials -->
            <div class="setting-card">
              <h3 class="card-title">应用凭证</h3>
              <div class="form-row">
                <label class="form-label">App ID</label>
                <input v-model="appId" class="form-input" placeholder="cli_xxxxxxxxxxxxx" />
              </div>
              <div class="form-row">
                <label class="form-label">App Secret</label>
                <input v-model="appSecret" class="form-input" type="password" placeholder="飞书应用密钥" />
              </div>
              <button class="btn btn-primary" @click="saveConfig" :disabled="feishuStore.loading">
                {{ feishuStore.config.hasSecret ? '更新凭证' : '保存凭证' }}
              </button>
            </div>

            <!-- C2: Sender allowlist -->
            <div class="setting-card">
              <h3 class="card-title">用户白名单</h3>
              <p class="form-hint">
                填写允许使用机器人的飞书用户 open_id（每行一个，以 <code>ou_</code> 开头）。
                <strong>留空 = 允许所有人</strong>。为防止群里任意成员远程触发命令，强烈建议填写。
              </p>
              <textarea v-model="allowedUsersText" class="form-input form-textarea" rows="3"
                placeholder="ou_xxxxxxxxxxxx&#10;ou_yyyyyyyyyyyy"></textarea>
              <button class="btn btn-primary" @click="saveAllowedUsers" :disabled="feishuStore.loading">
                保存白名单
              </button>
            </div>

            <!-- Connection toggle -->
            <div class="setting-card toggle-card" v-if="feishuStore.config.hasSecret">
              <span class="toggle-label">飞书桥接</span>
              <button class="btn" :class="feishuStore.connected ? 'btn-danger' : 'btn-success'" @click="toggleConnection">
                {{ feishuStore.connected ? '断开' : '连接' }}
              </button>
            </div>

            <!-- Active binding -->
            <div class="setting-card" v-if="feishuStore.binding">
              <h3 class="card-title">当前绑定</h3>
              <div class="binding-info">
                <p>会话: <code>{{ feishuStore.binding.sessionId?.slice(0, 8) }}...</code></p>
                <p v-if="feishuStore.binding.chatId?.startsWith('_pending')">
                  <span class="pending-tag">等待飞书消息关联</span>
                </p>
                <p v-else>
                  飞书聊天: <code>{{ feishuStore.binding.chatId?.slice(0, 12) }}...</code>
                </p>
              </div>
              <button class="btn btn-danger btn-sm" @click="unbind">解除绑定</button>
            </div>

            <!-- Instructions -->
            <div class="setting-card">
              <h3 class="card-title">使用说明</h3>
              <ol class="help-list">
                <li>在飞书开发者后台创建企业自建应用，获取 App ID 和 Secret</li>
                <li>启用应用的"机器人"功能</li>
                <li>订阅事件: <code>im.message.receive_v1</code>，使用长连接模式</li>
                <li>在此页面保存凭证并连接</li>
                <li>在对话列表中点击"绑定到飞书"按钮</li>
                <li>从飞书给机器人发送消息即可关联</li>
              </ol>
            </div>

            <!-- Error -->
            <div v-if="feishuStore.error" class="error-section">
              {{ feishuStore.error }}
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useFeishuStore } from '../../stores/feishu';

const props = defineProps({ show: Boolean });
defineEmits(['close']);

const feishuStore = useFeishuStore();
const appId = ref('');
const appSecret = ref('');
const allowedUsersText = ref('');

onMounted(async () => {
  await feishuStore.detect();
  appId.value = feishuStore.config.appId || '';
  allowedUsersText.value = (feishuStore.allowedUsers || []).join('\n');
});

async function saveConfig() {
  if (!appId.value.trim()) return;
  const secret = appSecret.value.trim() || undefined; // Keep existing if empty
  const result = await feishuStore.saveConfig(appId.value.trim(), secret);
  if (result.success) {
    appSecret.value = '';
  }
}

async function saveAllowedUsers() {
  const list = allowedUsersText.value.split('\n').map((s) => s.trim()).filter(Boolean);
  await feishuStore.saveAllowedUsers(list);
}

async function toggleConnection() {
  if (feishuStore.connected) {
    await feishuStore.stop();
  } else {
    await feishuStore.start();
  }
}

async function unbind() {
  await feishuStore.unbind();
}
</script>

<style scoped>
.settings-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(8px); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.settings-modal {
  background: var(--bg-primary); color: var(--text-primary);
  border-radius: var(--radius-card); width: 560px; max-width: 92vw; max-height: 85vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: var(--shadow-lg);
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; flex-shrink: 0;
}
.modal-header h2 { font-size: 16px; font-weight: 600; margin: 0; }
.close-btn {
  background: none; border: none; font-size: 22px; cursor: pointer;
  color: var(--text-muted); padding: 2px 6px; line-height: 1;
  border-radius: var(--radius-control); transition: background var(--transition-fast), color var(--transition-fast);
}
.close-btn:hover { color: var(--text-primary); background: var(--surface-hover); }
.modal-body { padding: 4px 20px 20px; overflow-y: auto; }

.setting-card {
  background: var(--bg-secondary); border-radius: var(--radius-card);
  padding: 16px; margin-bottom: 12px;
}
.card-title {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.6px;
}

.status-card {
  display: flex; align-items: center; gap: 10px; padding: 12px 16px;
}
.status-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.status-dot.connected { background: var(--success); box-shadow: 0 0 6px var(--success-bg); }
.status-dot.disconnected { background: var(--text-muted); }
.status-text { font-size: 14px; }
.processing-tag { color: var(--warning); font-size: 12px; margin-left: 8px; }

.form-row { margin-bottom: 12px; }
.form-label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.form-input {
  width: 100%; padding: 8px 12px; border-radius: var(--radius-control);
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary); color: var(--text-primary);
  font-size: 14px; box-sizing: border-box;
  transition: border-color var(--transition-fast);
}
.form-input:focus { outline: none; border-color: var(--accent); }
.form-input::placeholder { color: var(--text-muted); }
.form-textarea { resize: vertical; font-family: inherit; min-height: 64px; }
.form-hint {
  font-size: 12px; color: var(--text-muted); line-height: 1.5;
  margin: 0 0 10px;
}
.form-hint code { background: var(--bg-tertiary); padding: 1px 5px; border-radius: var(--radius-control); font-size: 11px; }
.form-hint strong { color: var(--text-secondary); }

.toggle-card {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px;
}
.toggle-label { font-size: 14px; color: var(--text-primary); }
.toggle-card .btn { margin-top: 0; }

.binding-info p { margin: 4px 0; font-size: 13px; }
.binding-info code {
  background: var(--bg-tertiary); padding: 2px 6px; border-radius: var(--radius-control);
  font-size: 12px;
}
.pending-tag { color: var(--warning); font-size: 12px; }

.help-list { padding-left: 20px; font-size: 13px; color: var(--text-secondary); margin: 0; line-height: 1.6; }
.help-list li { margin-bottom: 6px; }
.help-list code { font-size: 12px; background: var(--bg-tertiary); padding: 1px 5px; border-radius: var(--radius-control); }

.error-section {
  padding: 10px 14px; border-radius: var(--radius-control); background: var(--danger-bg);
  color: var(--danger); font-size: 13px; margin-bottom: 12px;
}

.btn {
  padding: 8px 16px; border-radius: var(--radius-control); border: none; cursor: pointer;
  font-size: 13px; transition: background var(--transition-fast), opacity var(--transition-fast);
  margin-top: 12px;
}
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-hover); }
.btn-success { background: var(--success); color: white; }
.btn-danger { background: var(--danger); color: white; }
.btn-sm { padding: 4px 12px; font-size: 12px; margin-top: 10px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
