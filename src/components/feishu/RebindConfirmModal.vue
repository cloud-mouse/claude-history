<template>
  <Teleport to="body">
    <transition name="dialog">
      <div v-if="show" class="rebind-overlay" @click.self="$emit('close')">
        <div class="rebind-modal" role="dialog" aria-modal="true" aria-label="换绑确认">
          <div class="modal-head">
            <h3>换绑确认</h3>
            <div class="sub">机器人同时只能服务一个会话</div>
          </div>

          <div class="modal-body">
            <div class="rebind-warn">
              <div class="rebind-icon">!</div>
              <div class="rebind-txt">
                <strong>{{ info.botName }}</strong> 当前正在服务另一个会话。
                换绑后，原会话将立即失去飞书远程入口（新消息将路由到新会话）。
                确定要把 <strong>{{ info.botName }}</strong> 切换到当前会话吗？
              </div>
            </div>

            <div class="rebind-flow">
              <div class="step off">
                <span class="step-dot"></span>
                <span class="step-text">
                  原会话 <code>{{ shortId(info.currentBinding?.sessionId) }}</code>
                </span>
                <span class="arr">—</span>
                <span>{{ info.botName }}</span>
                <span class="arr">→</span>
                <span class="step-label">解除</span>
              </div>
              <div class="step on">
                <span class="step-dot"></span>
                <span class="step-text">
                  新会话 <code>{{ newSessionShort }}</code>
                </span>
                <span class="arr">—</span>
                <span>{{ info.botName }}</span>
                <span class="arr">→</span>
                <span class="step-label">绑定</span>
              </div>
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn btn-ghost" :disabled="submitting" @click="$emit('close')">取消</button>
            <button class="btn btn-primary" :disabled="submitting" @click="confirm">
              {{ submitting ? '换绑中…' : '确认换绑' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  /**
   * Rebind context:
   * { botId, botName, jsonlPath, newSessionId?,
   *   currentBinding: { sessionId, jsonlPath } | null }
   *
   * `newSessionId` is optional — when absent (session-side picker doesn't have
   * it handy), we derive a short id from the jsonlPath file name.
   */
  info: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['close', 'confirm']);

const submitting = ref(false);

function shortId(id) {
  if (!id) return '?';
  return id.length > 8 ? id.slice(0, 8) + '…' : id;
}

const newSessionShort = computed(() => {
  if (props.info.newSessionId) return shortId(props.info.newSessionId);
  // Derive from jsonlPath file name: <sessionId>.jsonl → first 8 chars.
  const name = (props.info.jsonlPath || '').split('/').pop() || '';
  const id = name.replace(/\.jsonl$/, '');
  return shortId(id);
});

function confirm() {
  if (submitting.value) return;
  submitting.value = true;
  emit('confirm', {
    botId: props.info.botId,
    jsonlPath: props.info.jsonlPath,
    done: () => { submitting.value = false; }
  });
}
</script>

<style scoped>
.rebind-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 10012;
}
.rebind-modal {
  width: 100%; max-width: 460px;
  background: var(--bg-secondary); color: var(--text-primary);
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.modal-head { padding: 18px 20px 4px; }
.modal-head h3 { font-size: 15px; font-weight: 700; margin: 0; }
.modal-head .sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.modal-body { padding: 16px 20px; }
.modal-foot {
  padding: 12px 20px 18px;
  display: flex; justify-content: flex-end; gap: 8px;
}

.rebind-warn {
  display: flex; gap: 12px; align-items: flex-start;
  padding: 14px;
  background: var(--warning-bg);
  border-radius: var(--radius-control);
  border: 1px solid var(--warning-bg);
}
.rebind-icon {
  width: 28px; height: 28px; flex-shrink: 0;
  border-radius: 50%;
  background: var(--warning); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 700;
}
.rebind-txt {
  font-size: 13px; color: var(--text-primary);
  line-height: 1.55;
}
.rebind-txt strong { color: var(--warning); font-weight: 600; }

.rebind-flow {
  margin-top: 14px; padding: 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-control);
  display: flex; flex-direction: column; gap: 6px;
}
.step {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--text-secondary); flex-wrap: wrap;
}
.step.off { text-decoration: line-through; color: var(--text-muted); }
.step.on { color: var(--success); }
.step-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  background: currentColor;
}
.step-text { font-family: var(--font-mono); }
.step code {
  background: var(--bg-secondary);
  padding: 1px 5px; border-radius: 4px;
  font-family: var(--font-mono); font-size: 11px;
}
.arr { color: var(--text-muted); }
.step-label { font-weight: 600; }

.btn {
  padding: 8px 16px; border-radius: var(--radius-control);
  border: 1px solid var(--border-color); cursor: pointer;
  font-size: 13px; font-weight: 500;
  transition: background var(--transition-fast), opacity var(--transition-fast);
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost { background: transparent; color: var(--text-secondary); }
.btn-ghost:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
.btn-primary {
  background: var(--primary); color: #fff; border-color: var(--primary);
}
.btn-primary:hover:not(:disabled) { background: var(--primary-hover); border-color: var(--primary-hover); }

.dialog-enter-active, .dialog-leave-active { transition: opacity 0.2s ease; }
.dialog-enter-from, .dialog-leave-to { opacity: 0; }
</style>
