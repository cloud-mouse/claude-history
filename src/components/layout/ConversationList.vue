<template>
  <div class="conversation-list">
    <div class="conversation-list-header">
      <SearchBar :query="searchQuery" @search="handleSearch" />
    </div>

    <div class="conversation-list-content">
      <div v-if="!filteredConversations || filteredConversations.length === 0" class="empty-state">
        <p>{{ searchQuery ? '无匹配结果' : '暂无对话' }}</p>
      </div>

      <ul v-else class="conversation-items">
        <li
          v-for="conv in filteredConversations"
          :key="conv.filePath"
          :class="['conversation-item', { active: conv.filePath === selectedId }]"
          @click="onSelect(conv)"
        >
          <div class="conv-main">
            <span v-if="feishuStore.isBound(conv.filePath)" class="binding-dot" title="已绑定飞书"></span>
            <span class="conv-title">{{ cleanTitle(titleMap[conv.filePath] || conv.title) || '未命名' }}</span>
            <span v-if="conv.fileSize > 50 * 1024 * 1024" class="large-file-badge">大文件</span>
          </div>
          <div class="conv-footer">
            <span class="conv-date">{{ formatDate(conv.updatedAt) }}</span>
            <DropdownMenu
              :items="menuItems(conv)"
              trigger-title="会话操作"
              @select="(key) => onMenuSelect(conv, key)"
            />
          </div>
        </li>
      </ul>
    </div>

    <ConfirmDialog
      :show="showDeleteConfirm"
      title="删除对话"
      :message="pendingDelete ? '确定要删除 ' + pendingDelete.displayName + ' 吗？' : ''"
      type="danger"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />

    <transition name="toast">
      <div v-if="toast" class="conv-toast" :class="toast.success ? 'success' : 'error'">
        {{ toast.message }}
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { cleanTitle } from '../../utils/title-extractor.js';
import { resolveProjectDir } from '../../utils/project-path.js';
import { buildResumeCommand } from '../../utils/conversation-resume.js';
import { useConversationsStore } from '../../stores/conversations.js';
import SearchBar from '../common/SearchBar.vue';
import ConfirmDialog from '../common/ConfirmDialog.vue';
import DropdownMenu from '../common/DropdownMenu.vue';
import { useFeishuStore } from '../../stores/feishu';

const feishuStore = useFeishuStore();

const conversationsStore = useConversationsStore();
const titleMap = conversationsStore.titleMap;

const props = defineProps({
  conversations: Array,
  selectedId: String
});

const emit = defineEmits(['select', 'search', 'delete']);

const searchQuery = ref('');
const showDeleteConfirm = ref(false);
const pendingDelete = ref(null);
const toast = ref(null); // { message: string, success: boolean }
let toastTimer = null;

function handleSearch(query) {
  searchQuery.value = query;
}

function onSelect(conv) {
  emit('select', conv);
}

// --- Per-conversation context menu (4 actions) ---

function menuItems(conv) {
  const bound = feishuStore.isBound(conv.filePath);
  return [
    {
      key: 'bind',
      label: bound ? '解除绑定' : '绑定到飞书',
      disabled: !feishuStore.connected,
      disabledHint: '请先在设置中连接飞书桥接'
    },
    { key: 'resume', label: '恢复会话' },
    { key: 'copy', label: '复制恢复命令' },
    { key: 'delete', label: '删除会话', danger: true }
  ];
}

async function onMenuSelect(conv, key) {
  if (key === 'bind') {
    // Singleton semantics (ADR-0001): binding replaces the previous binding.
    // Toggle directly — no confirmation — with a toast for feedback.
    if (feishuStore.isBound(conv.filePath)) {
      await feishuStore.unbind();
      showToast('已解除绑定', true);
    } else {
      const r = await feishuStore.bindSession(conv.filePath);
      showToast(r.success ? (r.message || '已绑定到飞书') : (r.error || '绑定失败'), r.success);
    }
  } else if (key === 'resume') {
    window.electronAPI.resumeConversation(conv.filePath, resolveProjectDir(conv));
  } else if (key === 'copy') {
    navigator.clipboard.writeText(buildResumeCommand(conv))
      .then(() => showToast('已复制恢复命令', true));
  } else if (key === 'delete') {
    confirmDelete(conv);
  }
}

function showToast(message, success) {
  toast.value = { message, success };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = null; }, 4000);
}

function confirmDelete(conv) {
  pendingDelete.value = {
    filePath: conv.filePath,
    displayName: cleanTitle(conv.title) || '未命名'
  };
  showDeleteConfirm.value = true;
}

function handleDelete() {
  if (pendingDelete.value) {
    emit('delete', pendingDelete.value.filePath);
  }
  showDeleteConfirm.value = false;
  pendingDelete.value = null;
}

const filteredConversations = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.conversations || [];
  }
  const query = searchQuery.value.toLowerCase();
  return (props.conversations || []).filter(conv =>
    (conv.title || '').toLowerCase().includes(query)
  );
});

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const days = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return '昨天';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}
</script>

<style scoped>
.conversation-list {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: transparent;
}

.conversation-list-header {
  padding: 12px 12px 8px;
}

.conversation-list-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.conversation-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.conversation-item {
  padding: 10px 12px;
  border-radius: var(--radius-card);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.conversation-item:hover {
  background: var(--surface-hover);
}

.conversation-item.active {
  background: var(--surface-selected);
  color: var(--surface-selected-text);
}

.conv-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.binding-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  flex-shrink: 0;
  box-shadow: 0 0 6px var(--success-bg);
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.conv-title {
  font-size: var(--font-size-sm);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.large-file-badge {
  font-size: var(--font-size-xs);
  color: var(--warning);
  background: var(--warning-bg);
  padding: 2px 6px;
  border-radius: var(--radius-control);
  flex-shrink: 0;
}

.conversation-item.active .large-file-badge {
  background: var(--surface-hover);
  opacity: 0.85;
}

.conv-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.conv-date {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.conversation-item.active .conv-date {
  opacity: 0.6;
}

/* Reveal the per-row menu trigger on hover / active row (mirrors the old
   delete-btn reveal behavior). */
.conversation-item :deep(.dropdown-trigger) {
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.conversation-item:hover :deep(.dropdown-trigger),
.conversation-item.active :deep(.dropdown-trigger) {
  opacity: 0.6;
}
.conversation-item :deep(.dropdown-trigger:hover),
.conversation-item :deep(.dropdown-trigger.is-open) {
  opacity: 1;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.empty-state p {
  margin: 0;
}

/* Inline toast for bind / copy feedback. */
.conv-toast {
  position: absolute;
  bottom: 16px;
  left: 50%;
  padding: 8px 16px;
  border-radius: var(--radius-control);
  font-size: var(--font-size-sm);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
  z-index: 20;
  pointer-events: none;
}
.conv-toast.success { color: var(--success); border-color: var(--success); }
.conv-toast.error { color: var(--danger); border-color: var(--danger); }

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
