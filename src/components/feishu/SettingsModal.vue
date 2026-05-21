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
            <div class="status-section">
              <span class="status-dot" :class="feishuStore.connected ? 'connected' : 'disconnected'"></span>
              <span class="status-text">
                {{ feishuStore.connected ? '已连接' : '未连接' }}
                <span v-if="feishuStore.processing" class="processing-tag">处理中...</span>
              </span>
            </div>

            <!-- Feishu credentials -->
            <div class="form-section">
              <label class="form-label">App ID</label>
              <input v-model="appId" class="form-input" placeholder="cli_xxxxxxxxxxxxx" />

              <label class="form-label" style="margin-top: 12px">App Secret</label>
              <input v-model="appSecret" class="form-input" type="password" placeholder="飞书应用密钥" />

              <button class="btn btn-primary" @click="saveConfig" :disabled="feishuStore.loading">
                {{ feishuStore.config.hasSecret ? '更新凭证' : '保存凭证' }}
              </button>
            </div>

            <!-- Connection toggle -->
            <div class="toggle-section" v-if="feishuStore.config.hasSecret">
              <span>飞书桥接</span>
              <button class="btn" :class="feishuStore.connected ? 'btn-danger' : 'btn-success'" @click="toggleConnection">
                {{ feishuStore.connected ? '断开' : '连接' }}
              </button>
            </div>

            <!-- Active binding -->
            <div class="binding-section" v-if="feishuStore.binding">
              <h3>当前绑定</h3>
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
            <div class="help-section">
              <h3>使用说明</h3>
              <ol>
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

onMounted(async () => {
  await feishuStore.detect();
  appId.value = feishuStore.config.appId || '';
});

async function saveConfig() {
  if (!appId.value.trim()) return;
  const secret = appSecret.value.trim() || undefined; // Keep existing if empty
  const result = await feishuStore.saveConfig(appId.value.trim(), secret);
  if (result.success) {
    appSecret.value = '';
  }
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
  background: rgba(0,0,0,0.5); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.settings-modal {
  background: var(--bg-primary, #1e1e1e); color: var(--text-primary, #e0e0e0);
  border-radius: 12px; width: 480px; max-height: 80vh;
  overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--border-color, #333);
}
.modal-header h2 { font-size: 16px; font-weight: 600; margin: 0; }
.close-btn {
  background: none; border: none; font-size: 20px; cursor: pointer;
  color: var(--text-secondary, #888); padding: 0 4px;
}
.close-btn:hover { color: var(--text-primary, #e0e0e0); }
.modal-body { padding: 20px; }

.status-section {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 20px; padding: 12px; border-radius: 8px;
  background: var(--bg-secondary, #252525);
}
.status-dot {
  width: 10px; height: 10px; border-radius: 50%;
}
.status-dot.connected { background: #4caf50; box-shadow: 0 0 6px #4caf5088; }
.status-dot.disconnected { background: #666; }
.status-text { font-size: 14px; }
.processing-tag {
  color: #ff9800; font-size: 12px; margin-left: 8px;
}

.form-section { margin-bottom: 20px; }
.form-label { display: block; font-size: 13px; color: var(--text-secondary, #888); margin-bottom: 4px; }
.form-input {
  width: 100%; padding: 8px 12px; border-radius: 6px;
  border: 1px solid var(--border-color, #333);
  background: var(--bg-secondary, #252525); color: var(--text-primary, #e0e0e0);
  font-size: 14px; box-sizing: border-box;
}
.form-input:focus { outline: none; border-color: #4a9eff; }

.toggle-section {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px; border-radius: 8px; margin-bottom: 20px;
  background: var(--bg-secondary, #252525);
}

.binding-section {
  padding: 12px; border-radius: 8px; margin-bottom: 20px;
  background: var(--bg-secondary, #252525);
}
.binding-section h3 { font-size: 14px; margin: 0 0 8px; }
.binding-info p { margin: 4px 0; font-size: 13px; }
.binding-info code {
  background: var(--bg-primary, #1e1e1e); padding: 2px 6px; border-radius: 4px;
  font-size: 12px;
}
.pending-tag { color: #ff9800; font-size: 12px; }

.help-section { margin-bottom: 20px; }
.help-section h3 { font-size: 14px; margin: 0 0 8px; }
.help-section ol { padding-left: 20px; font-size: 13px; color: var(--text-secondary, #888); }
.help-section li { margin-bottom: 4px; }
.help-section code { font-size: 12px; }

.error-section {
  padding: 8px 12px; border-radius: 6px; background: #ff444422;
  color: #ff6666; font-size: 13px;
}

.btn {
  padding: 8px 16px; border-radius: 6px; border: none; cursor: pointer;
  font-size: 13px; transition: background 0.2s;
  margin-top: 12px;
}
.btn-primary { background: #4a9eff; color: white; }
.btn-primary:hover { background: #3a8eef; }
.btn-success { background: #4caf50; color: white; }
.btn-danger { background: #e53935; color: white; }
.btn-sm { padding: 4px 12px; font-size: 12px; margin-top: 8px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
