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
            <button class="delete-btn" @click.stop="confirmDelete(conv)" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { cleanTitle } from '../../utils/title-extractor.js';
import { useConversationsStore } from '../../stores/conversations.js';
import SearchBar from '../common/SearchBar.vue';
import ConfirmDialog from '../common/ConfirmDialog.vue';
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

function handleSearch(query) {
  searchQuery.value = query;
}

function onSelect(conv) {
  emit('select', conv);
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
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
}

.conversation-list-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
}

.conversation-list-content {
  flex: 1;
  overflow-y: auto;
}

.conversation-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.conversation-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.conversation-item:hover {
  background: var(--bg-tertiary);
}

.conversation-item:hover .delete-btn {
  opacity: 1;
}

.conversation-item.active {
  background: var(--primary);
  color: white;
}

.conv-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.binding-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: #4caf50; flex-shrink: 0;
  box-shadow: 0 0 6px #4caf5088;
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
  color: var(--color-warning);
  background: rgba(245, 158, 11, 0.1);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.conversation-item.active .large-file-badge {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.2);
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
  color: rgba(255, 255, 255, 0.7);
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
}

.conversation-item.active .delete-btn {
  opacity: 1;
  color: rgba(255, 255, 255, 0.7);
}

.delete-btn:hover {
  color: var(--color-error);
  background: rgba(239, 68, 68, 0.1);
}

.conversation-item.active .delete-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.2);
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
</style>
