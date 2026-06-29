<template>
  <Teleport to="body">
    <transition name="dialog">
      <div v-if="show" class="picker-overlay" @click.self="$emit('close')">
        <div class="picker-modal" role="dialog" aria-modal="true" aria-label="绑定到机器人">
          <div class="modal-head">
            <h3>绑定到机器人</h3>
            <div class="sub">{{ subtitle }}</div>
          </div>

          <div class="modal-body">
            <div v-if="loading" class="picker-empty">加载机器人列表…</div>
            <div v-else-if="bots.length === 0" class="picker-empty">
              没有可绑定的机器人。请先在「设置 → 飞书桥接」中添加机器人。
            </div>

            <div v-else class="picker-list">
              <button
                v-for="b in bots"
                :key="b.id"
                type="button"
                class="picker-item"
                :class="{ disabled: b.disabled }"
                :disabled="b.disabled"
                @click="onPick(b)"
              >
                <span class="picker-avatar" :style="{ background: avatarGradient(b.id) }">
                  {{ avatarChar(b.name) }}
                </span>
                <span class="pi-meta">
                  <span class="pi-name">{{ b.name }}</span>
                  <span class="pi-dir">{{ b.projectDir || '未设置目录' }} · {{ dirLabel(b) }}</span>
                </span>
                <span class="pi-tag" :class="tagClass(b)">{{ tagLabel(b) }}</span>
              </button>
            </div>

            <div class="picker-hint">
              只能绑定与本会话同目录、且在线的机器人。已被占用的机器人点选后会弹出换绑确认。
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn btn-ghost" @click="$emit('close')">取消</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { useFeishuStore } from '../../stores/feishu';
import { avatarGradient, avatarChar } from '../../utils/bot-avatar';

const props = defineProps({
  show: { type: Boolean, default: false },
  /** Conversation jsonl path that will be bound. */
  jsonlPath: { type: String, default: null },
  /** Conversation's real working directory, used to filter bindable bots. */
  projectDir: { type: String, default: null },
  /** Optional display label for the subtitle (e.g. session title). */
  sessionLabel: { type: String, default: '' }
});
const emit = defineEmits(['close', 'bind', 'rebind-needed']);

const feishuStore = useFeishuStore();

const bots = ref([]);
const loading = ref(false);

const subtitle = computed(() => {
  if (props.sessionLabel) {
    return `会话 ${props.sessionLabel}`;
  }
  return props.projectDir || '';
});

watch(() => props.show, async (v) => {
  if (!v) return;
  await loadBots();
});

async function loadBots() {
  loading.value = true;
  bots.value = [];
  if (!props.projectDir) {
    loading.value = false;
    return;
  }
  try {
    const result = await feishuStore.listBindableBots(props.projectDir);
    if (result.success) {
      bots.value = result.bots || [];
    }
  } finally {
    loading.value = false;
  }
}

function dirLabel(b) {
  if (!b.projectDir) return '未设置目录';
  if (b.disabled && !b.online) return '离线';
  return '同目录';
}

function tagClass(b) {
  if (b.disabled) return 'unavailable';
  // Available: check if it's already bound (to a different session → will trigger rebind).
  const bot = feishuStore.getBot(b.id);
  if (bot && bot.binding && bot.binding.jsonlPath !== props.jsonlPath) return 'busy';
  return 'free';
}

function tagLabel(b) {
  if (b.disabled) return '不可选';
  const bot = feishuStore.getBot(b.id);
  if (bot && bot.binding && bot.binding.jsonlPath !== props.jsonlPath) return '使用中';
  return '可用';
}

async function onPick(b) {
  if (b.disabled || !props.jsonlPath) return;
  const result = await feishuStore.bindSessionToBot({ botId: b.id, jsonlPath: props.jsonlPath });
  if (!result.success) return;
  if (result.needsRebind) {
    emit('rebind-needed', {
      botId: b.id,
      botName: b.name,
      jsonlPath: props.jsonlPath,
      currentBinding: result.currentBinding
    });
  } else {
    emit('bind', { botId: b.id, jsonlPath: props.jsonlPath });
  }
}

// avatarGradient / avatarChar are imported from utils/bot-avatar.js — shared with
// the bot management page (FeishuSettingsTab.vue) to avoid divergent visuals.
</script>

<style scoped>
.picker-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 10010;
}
.picker-modal {
  width: 100%; max-width: 460px;
  background: var(--bg-secondary); color: var(--text-primary);
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.modal-head { padding: 18px 20px 4px; }
.modal-head h3 { font-size: 15px; font-weight: 700; margin: 0; }
.modal-head .sub {
  font-size: 12px; color: var(--text-muted); margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.modal-body { padding: 16px 20px; }
.modal-foot {
  padding: 12px 20px 18px;
  display: flex; justify-content: flex-end; gap: 8px;
}

.picker-empty {
  font-size: 13px; color: var(--text-muted); text-align: center; padding: 24px 0;
}
.picker-list { display: flex; flex-direction: column; gap: 8px; }
.picker-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px; width: 100%;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-control);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer; text-align: left;
  font-family: inherit;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.picker-item:hover:not(.disabled) {
  border-color: var(--accent); background: var(--surface-hover);
}
.picker-item.disabled { cursor: not-allowed; opacity: 0.55; }

.picker-avatar {
  width: 34px; height: 34px; flex-shrink: 0;
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #fff;
}
.pi-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pi-name { font-size: 13px; font-weight: 600; }
.pi-dir {
  font-size: 11px; color: var(--text-muted);
  font-family: var(--font-mono);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pi-tag {
  font-size: 10px; padding: 2px 7px; border-radius: 10px;
  font-weight: 500; flex-shrink: 0;
}
.pi-tag.free { background: var(--success-bg); color: var(--success); }
.pi-tag.busy { background: var(--warning-bg); color: var(--warning); }
.pi-tag.unavailable { background: var(--surface-hover); color: var(--text-muted); }

.picker-hint {
  font-size: 11px; color: var(--text-muted);
  margin-top: 12px; line-height: 1.5;
}

.btn {
  padding: 8px 16px; border-radius: var(--radius-control);
  border: 1px solid var(--border-color); cursor: pointer;
  font-size: 13px; font-weight: 500;
  transition: background var(--transition-fast), opacity var(--transition-fast);
}
.btn-ghost {
  background: transparent; color: var(--text-secondary);
}
.btn-ghost:hover { background: var(--surface-hover); color: var(--text-primary); }

.dialog-enter-active, .dialog-leave-active { transition: opacity 0.2s ease; }
.dialog-enter-from, .dialog-leave-to { opacity: 0; }
</style>
