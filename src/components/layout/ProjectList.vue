<template>
  <div class="project-list">
    <div class="project-list-header">
      <div class="header-title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <h2>项目</h2>
      </div>
      <button class="refresh-btn" @click="$emit('refresh')" :disabled="loading" title="刷新">
        <svg :class="{ spinning: loading }" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
      </button>
    </div>

    <div v-if="projects && projects.length > 0" class="sort-bar">
      <svg class="sort-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
      </svg>
      <button :class="['sort-btn', { active: sortBy === 'time' }]" @click="sortBy = 'time'">时间</button>
      <button :class="['sort-btn', { active: sortBy === 'count' }]" @click="sortBy = 'count'">数量</button>
    </div>

    <div class="project-list-content">
      <SkeletonLoader v-if="loading" :count="5" height="56px" />

      <div v-else-if="error" class="error-state">
        <p>{{ error }}</p>
        <button class="retry-btn" @click="$emit('refresh')">重试</button>
      </div>

      <div v-else-if="!projects || projects.length === 0" class="empty-state">
        <p>暂无项目</p>
      </div>

      <ul v-else class="project-items">
        <li
          v-for="project in sortedProjects"
          :key="project.id"
          :class="['project-item', { active: project.id === selectedId }]"
          @click="$emit('select', project.id)"
        >
          <div class="project-info">
            <span class="project-name">{{ getDisplayName(project) }}</span>
            <span class="project-path">{{ getShortPath(project.path) }}</span>
          </div>
          <div class="project-actions">
            <span class="project-count">{{ project.conversations?.length || 0 }}</span>
            <button class="delete-btn" @click.stop="confirmDelete(project)" title="删除">
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
      title="删除项目"
      :message="pendingDelete ? '确定要删除 ' + pendingDelete.displayName + ' 吗？' : ''"
      type="danger"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import SkeletonLoader from '../common/SkeletonLoader.vue';
import ConfirmDialog from '../common/ConfirmDialog.vue';

const props = defineProps({
  projects: Array,
  selectedId: [String, Number],
  loading: Boolean,
  error: String
});

const emit = defineEmits(['select', 'refresh', 'delete']);

const showDeleteConfirm = ref(false);
const pendingDelete = ref(null);
const sortBy = ref('time');

const sortedProjects = computed(() => {
  const list = [...(props.projects || [])];
  if (sortBy.value === 'count') {
    list.sort((a, b) => (b.conversations?.length || 0) - (a.conversations?.length || 0));
  } else {
    list.sort((a, b) => {
      const aTime = Math.max(0, ...((a.conversations || []).map(c => c.updatedAt || 0)));
      const bTime = Math.max(0, ...((b.conversations || []).map(c => c.updatedAt || 0)));
      return bTime - aTime;
    });
  }
  return list;
});

function confirmDelete(project) {
  pendingDelete.value = {
    id: project.id,
    displayName: getDisplayName(project)
  };
  showDeleteConfirm.value = true;
}

function handleDelete() {
  if (pendingDelete.value) {
    emit('delete', pendingDelete.value.id);
  }
  showDeleteConfirm.value = false;
  pendingDelete.value = null;
}

function getDisplayName(project) {
  if (!project.name) {
    return project.path?.split('/').pop() || '未命名项目';
  }
  const parts = project.name.split('-');
  if (parts.length >= 2) {
    return parts.slice(-2).join('-');
  }
  return parts[parts.length - 1];
}

function getShortPath(path) {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 3) return path;
  return parts.slice(0, 2).join('/') + '/.../' + parts.slice(-1).join('/');
}
</script>

<style scoped>
.project-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: transparent;
}

.project-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 6px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-muted);
}

.header-title h2 {
  font-size: var(--font-size-xs);
  font-weight: 600;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  color: var(--text-muted);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.refresh-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.refresh-btn:disabled {
  opacity: 0.5;
}

.refresh-btn svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.project-list-content {
  flex: 1;
  overflow-y: auto;
  padding: 4px 8px 8px;
}

.sort-bar {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 2px 4px 6px;
}

.sort-icon {
  color: var(--text-muted);
  opacity: 0.5;
  margin-right: 4px;
  flex-shrink: 0;
}

.sort-btn {
  padding: 3px 8px;
  font-size: 11px;
  font-family: var(--font-sans);
  color: var(--text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.7;
  transition: all var(--transition-fast);
}

.sort-btn:hover {
  opacity: 1;
  color: var(--text-secondary);
}

.sort-btn.active {
  opacity: 1;
  color: var(--accent);
  font-weight: 600;
}

.project-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.project-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: var(--radius-card);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.project-item:hover {
  background: var(--surface-hover);
}

.project-item:hover .delete-btn {
  opacity: 1;
}

.project-item.active {
  background: var(--surface-selected);
  color: var(--surface-selected-text);
}

.project-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.project-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-path {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-item.active .project-path {
  opacity: 0.6;
}

.project-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-count {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: var(--radius-full);
}

.project-item.active .project-count {
  background: var(--surface-hover);
}

.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
}

.project-item.active .delete-btn {
  opacity: 0.6;
}

.delete-btn:hover {
  color: var(--danger);
  background: var(--danger-bg);
  opacity: 1;
}

.empty-state,
.error-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.error-state p {
  margin: 0 0 12px;
  color: var(--danger);
}

.retry-btn {
  padding: 6px 16px;
  font-size: var(--font-size-sm);
  color: var(--accent);
  background: transparent;
  border: 1px solid var(--accent);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.retry-btn:hover {
  background: var(--accent);
  color: white;
}
</style>
