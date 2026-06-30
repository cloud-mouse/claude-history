<template>
  <Teleport to="body">
    <transition name="dialog">
      <div v-if="show" class="picker-overlay" @click.self="$emit('close')">
        <div class="picker-modal" role="dialog" aria-modal="true" aria-label="绑定会话">
          <div class="modal-head">
            <h3>为「{{ bot && bot.name }}」绑定会话</h3>
            <div class="sub">{{ bot && bot.projectDir || '未设置目录' }}</div>
          </div>

          <div class="modal-body">
            <div v-if="loading" class="picker-empty">加载会话列表…</div>
            <div v-else-if="!bot || !bot.projectDir" class="picker-empty">
              此机器人未设置服务目录，请先编辑补全。
            </div>
            <div v-else-if="sessions.length === 0" class="picker-empty">
              该目录下暂无会话。请先用 Claude Code 在该目录产生对话历史。
            </div>

            <input
              v-else
              v-model="filter"
              class="filter-input"
              type="text"
              placeholder="搜索会话标题…"
            />

            <div v-if="!loading && sessions.length > 0" class="picker-list">
              <button
                v-for="s in filteredSessions"
                :key="s.filePath"
                type="button"
                class="picker-item"
                :class="{ disabled: isBoundElsewhere(s) }"
                :disabled="isBoundElsewhere(s)"
                @click="onPick(s)"
              >
                <span class="session-title">{{ displayTitle(s) }}</span>
                <span class="session-meta">
                  <span class="session-date">{{ formatDate(s.updatedAt) }}</span>
                  <span v-if="isBoundToThisBot(s)" class="pi-tag bound-to-this">已绑定</span>
                  <span v-else-if="isBoundElsewhere(s)" class="pi-tag unavailable">已被其他机器人绑定</span>
                  <span v-else class="pi-tag free">可用</span>
                </span>
              </button>
              <div v-if="filteredSessions.length === 0" class="picker-empty small">
                没有匹配的会话。
              </div>
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
import { ref, computed, watch } from 'vue';
import { cleanTitle } from '../../utils/title-extractor';
import { useProjectsStore } from '../../stores/projects';
import { useFeishuStore } from '../../stores/feishu';

const props = defineProps({
  show: { type: Boolean, default: false },
  /** The bot to bind a session to. */
  bot: { type: Object, default: null }
});
const emit = defineEmits(['close', 'bind', 'rebind-needed']);

const projectsStore = useProjectsStore();
const feishuStore = useFeishuStore();

const sessions = ref([]);
const loading = ref(false);
const filter = ref('');
const picking = ref(false);

// Match by the real cwd stored on each conversation (projectDir), NOT by decoding
// the slug name — a '-' inside a folder name like "my-space" makes slug decoding
// ambiguous (my-space -> my/space) and would never match the bot's projectDir.
const matchingProject = computed(() => {
  if (!props.bot || !props.bot.projectDir) return null;
  const target = props.bot.projectDir;
  return (projectsStore.projects || []).find((p) =>
    (p.conversations || []).some((c) => c.projectDir === target)
  ) || null;
});

const filteredSessions = computed(() => {
  if (!filter.value.trim()) return sessions.value;
  const q = filter.value.toLowerCase();
  return sessions.value.filter((s) => (displayTitle(s) || '').toLowerCase().includes(q));
});

watch(() => props.show, async (v) => {
  if (!v) return;
  filter.value = '';
  await loadSessions();
});

async function loadSessions() {
  sessions.value = [];
  if (!matchingProject.value) { return; }
  loading.value = true;
  try {
    const result = await window.electronAPI.getConversations(matchingProject.value.id);
    if (result.success) {
      // Sort newest first for easier picking.
      sessions.value = (result.conversations || []).slice().sort((a, b) =>
        (b.updatedAt || 0) - (a.updatedAt || 0)
      );
    }
  } finally {
    loading.value = false;
  }
}

function displayTitle(s) {
  return cleanTitle(s.title) || '未命名会话';
}

function isBoundToThisBot(s) {
  const bot = feishuStore.getBot(props.bot?.id);
  return !!bot && bot.binding?.jsonlPath === s.filePath;
}

function isBoundElsewhere(s) {
  // Bound by some other bot → can't bind from here (would be a cross-bot rebind
  // which the model doesn't support; the other bot must unbind first).
  const bound = feishuStore.boundBotFor(s.filePath);
  return !!bound && bound.id !== props.bot?.id;
}

async function onPick(s) {
  // Skip if bound elsewhere (cross-bot), already bound to THIS bot (no-op self
  // rebind), or a pick is already in flight (double-click guard).
  if (isBoundElsewhere(s) || isBoundToThisBot(s) || !props.bot || picking.value) return;
  picking.value = true;
  try {
    const result = await feishuStore.bindSessionToBot({ botId: props.bot.id, jsonlPath: s.filePath });
    if (!result.success) return;
    if (result.needsRebind) {
      emit('rebind-needed', {
        botId: props.bot.id,
        botName: props.bot.name,
        jsonlPath: s.filePath,
        newSessionId: sessionShortId(s),
        currentBinding: result.currentBinding
      });
    } else {
      emit('bind', { botId: props.bot.id, jsonlPath: s.filePath });
    }
  } finally {
    picking.value = false;
  }
}

function sessionShortId(s) {
  // Try to derive a short session id from the file name (Claude stores as <sessionId>.jsonl).
  const name = (s.filePath || '').split('/').pop() || '';
  const id = name.replace(/\.jsonl$/, '');
  return id;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
</script>

<style scoped>
.picker-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 10011;
}
.picker-modal {
  width: 100%; max-width: 480px;
  background: var(--bg-secondary); color: var(--text-primary);
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex; flex-direction: column;
  max-height: 80vh;
}

.modal-head { padding: 18px 20px 4px; }
.modal-head h3 { font-size: 15px; font-weight: 700; margin: 0; }
.modal-head .sub {
  font-size: 12px; color: var(--text-muted); margin-top: 3px;
  font-family: var(--font-mono);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.modal-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
.modal-foot {
  padding: 12px 20px 18px;
  display: flex; justify-content: flex-end; gap: 8px;
}

.filter-input {
  width: 100%; padding: 8px 12px; margin-bottom: 12px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary); color: var(--text-primary);
  font-size: 13px; box-sizing: border-box;
}
.filter-input:focus { outline: none; border-color: var(--accent); }

.picker-empty {
  font-size: 13px; color: var(--text-muted); text-align: center; padding: 24px 0;
}
.picker-empty.small { padding: 12px 0; }

.picker-list { display: flex; flex-direction: column; gap: 8px; }
.picker-item {
  display: flex; flex-direction: column; gap: 4px;
  padding: 10px 12px; width: 100%;
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

.session-title {
  font-size: 13px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.session-meta {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
}
.session-date { font-size: 11px; color: var(--text-muted); }
.pi-tag {
  font-size: 10px; padding: 2px 7px; border-radius: 10px;
  font-weight: 500; flex-shrink: 0;
}
.pi-tag.free { background: var(--success-bg); color: var(--success); }
.pi-tag.bound-to-this { background: var(--accent-bg); color: var(--accent); }
.pi-tag.unavailable { background: var(--surface-hover); color: var(--text-muted); }

.btn {
  padding: 8px 16px; border-radius: var(--radius-control);
  border: 1px solid var(--border-color); cursor: pointer;
  font-size: 13px; font-weight: 500;
  transition: background var(--transition-fast), opacity var(--transition-fast);
}
.btn-ghost { background: transparent; color: var(--text-secondary); }
.btn-ghost:hover { background: var(--surface-hover); color: var(--text-primary); }

.dialog-enter-active, .dialog-leave-active { transition: opacity 0.2s ease; }
.dialog-enter-from, .dialog-leave-to { opacity: 0; }
</style>
