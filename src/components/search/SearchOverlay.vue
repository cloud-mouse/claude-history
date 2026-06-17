<template>
  <Teleport to="body">
    <transition name="modal">
      <div v-if="show" class="search-overlay" @click.self="$emit('close')">
        <div class="search-modal">
          <div class="search-input-row">
            <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input ref="inputRef" v-model="localQuery" @input="onInput"
              placeholder="搜索对话内容、代码、命令、文件路径…"
              @keydown.esc="$emit('close')" @keydown.enter="onEnter" />
            <span v-if="searchStore.loading" class="spinner">搜索中…</span>
          </div>

          <div class="search-results">
            <div v-if="searchStore.error" class="state-msg error">{{ searchStore.error }}</div>
            <div v-else-if="localQuery.trim() && !searchStore.loading && !searchStore.results.length" class="state-msg">
              无匹配结果
            </div>
            <div v-else-if="!localQuery.trim()" class="state-msg">
              输入关键词，搜索全部对话的正文、工具调用与命令
            </div>

            <div v-for="(r, i) in searchStore.results" :key="r.messageId + '-' + i"
              class="result-item" :class="{ active: activeIndex === i }"
              @click="select(r)" @mouseenter="activeIndex = i">
              <div class="result-head">
                <span class="result-proj" :title="r.projectPath">{{ r.projectName || '未知项目' }}</span>
                <span class="result-role" :class="r.role">{{ roleLabel(r.role) }}</span>
              </div>
              <div class="result-title">{{ r.convTitle || '未命名对话' }}</div>
              <div v-if="r.preview" class="result-preview" v-html="highlight(r.preview)"></div>
            </div>
          </div>

          <div class="search-footer">
            <kbd>Esc</kbd> 关闭 · <kbd>↵</kbd> 打开 · 全文搜索（含 2 字中文、代码标识符）
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { useSearchStore } from '../../stores/search';

const props = defineProps({ show: Boolean });
const emit = defineEmits(['close', 'select']);

const searchStore = useSearchStore();
const localQuery = ref('');
const inputRef = ref(null);
const activeIndex = ref(0);

watch(() => props.show, (v) => {
  if (v) {
    localQuery.value = searchStore.query || '';
    activeIndex.value = 0;
    nextTick(() => inputRef.value?.focus());
  } else {
    searchStore.clear();
  }
});

watch(() => searchStore.results, () => { activeIndex.value = 0; });

function onInput() {
  searchStore.searchDebounced(localQuery.value, null);
}

function onEnter() {
  const r = searchStore.results[activeIndex.value];
  if (r) select(r);
}

function select(r) {
  emit('select', {
    projectId: r.projectId,
    messageId: r.messageId,
    conv: {
      id: r.convId,
      filePath: r.filePath,
      title: r.convTitle,
      updatedAt: r.updatedAt
    }
  });
}

function roleLabel(role) {
  if (role === 'user') return '用户';
  if (role === 'assistant') return 'Claude';
  return role || '消息';
}

// Escape HTML, then turn the snippet's 【】 markers into <mark> highlights.
function highlight(p) {
  if (!p) return '';
  const esc = String(p).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/【/g, '<mark>').replace(/】/g, '</mark>');
}
</script>

<style scoped>
.search-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.45); backdrop-filter: blur(8px); z-index: 1100;
  display: flex; align-items: flex-start; justify-content: center; padding-top: 12vh;
}
.search-modal {
  background: var(--bg-primary, #1e1e1e); color: var(--text-primary, #e0e0e0);
  border-radius: var(--radius-card); width: 600px; max-width: 92vw; max-height: 76vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: var(--shadow-lg);
}
.search-input-row {
  display: flex; align-items: center; gap: 10px; padding: 14px 16px;
  border-bottom: 1px solid var(--border-color, #333);
}
.search-icon { color: var(--text-muted, #888); flex-shrink: 0; }
.search-input-row input {
  flex: 1; background: transparent; border: none; outline: none;
  color: var(--text-primary, #e0e0e0); font-size: 15px;
}
.spinner { font-size: 12px; color: var(--text-muted, #888); flex-shrink: 0; }

.search-results { flex: 1; overflow-y: auto; padding: 6px; }
.state-msg { padding: 32px 16px; text-align: center; color: var(--text-muted, #888); font-size: 13px; }
.state-msg.error { color: var(--color-error, #ff6666); }

.result-item {
  padding: 10px 12px; border-radius: var(--radius-card); cursor: pointer; transition: background 0.12s;
}
.result-item:hover { background: var(--surface-hover); }
.result-item.active { background: var(--surface-selected); color: var(--surface-selected-text); }
.result-head { display: flex; align-items: center; gap: 8px; margin-bottom: 3px; }
.result-proj {
  font-size: 11px; color: var(--text-muted, #888);
  max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.result-role {
  font-size: 10px; padding: 1px 7px; border-radius: 10px; font-weight: 500;
  background: var(--bg-tertiary, #2d2d2d); color: var(--text-secondary, #aaa);
}
.result-role.user { color: var(--color-success, #4caf50); }
.result-role.assistant { color: var(--primary, #4a9eff); }
.result-title { font-size: 13px; font-weight: 500; margin-bottom: 3px; }
.result-preview {
  font-size: 12px; color: var(--text-secondary, #999); line-height: 1.5;
  max-height: 60px; overflow: hidden;
}
.result-preview :deep(mark) {
  background: var(--accent-bg); color: var(--accent);
  padding: 0 2px; border-radius: 3px;
}

.search-footer {
  padding: 8px 16px; border-top: 1px solid var(--border-light, #2a2a2a);
  font-size: 11px; color: var(--text-muted, #777);
}
kbd {
  background: var(--bg-tertiary, #2d2d2d); border: 1px solid var(--border-color, #333);
  border-radius: 3px; padding: 1px 5px; font-size: 10px; font-family: var(--font-mono, monospace);
}

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
