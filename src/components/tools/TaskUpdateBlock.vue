<template>
  <div :class="['task-update-block', status]">
    <div class="update-header">
      <span class="update-icon">
        <svg v-if="status === 'completed'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M20 6L9 17l-5-5"></path>
        </svg>
        <svg v-else-if="status === 'in_progress'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <svg v-else-if="status === 'deleted'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      </span>
      <span class="update-label">TaskUpdate</span>
      <span class="status-badge" :class="status">{{ statusLabel }}</span>
      <span v-if="taskId" class="task-id">#{{ taskId }}</span>
    </div>
    <div v-if="subject" class="update-content">
      <span class="task-subject">{{ subject }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  block: {
    type: Object,
    required: true
  }
});

const input = computed(() => {
  if (typeof props.block.input === 'string') {
    try {
      return JSON.parse(props.block.input);
    } catch {
      return {};
    }
  }
  return props.block.input || {};
});

const taskId = computed(() => input.value.taskId || '');
const status = computed(() => input.value.status || 'pending');
const subject = computed(() => input.value.subject || '');

const statusLabel = computed(() => {
  const map = {
    completed: '已完成',
    in_progress: '进行中',
    pending: '待办',
    deleted: '已删除'
  };
  return map[status.value] || status.value;
});

function expandAll() {}
function collapseAll() {}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.task-update-block {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.task-update-block.completed {
  border-color: rgba(22, 163, 74, 0.3);
}

.task-update-block.deleted {
  border-color: rgba(185, 28, 28, 0.3);
}

.update-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.update-icon {
  display: flex;
  align-items: center;
}

.task-update-block.completed .update-icon {
  color: #16a34a;
}

.task-update-block.in_progress .update-icon {
  color: #2563eb;
}

.task-update-block.deleted .update-icon {
  color: var(--color-error);
}

.task-update-block.pending .update-icon {
  color: var(--text-muted);
}

.update-label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.status-badge {
  font-size: var(--font-size-xs);
  font-weight: 500;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.status-badge.completed {
  color: #16a34a;
  background: rgba(22, 163, 74, 0.1);
}

.status-badge.in_progress {
  color: #2563eb;
  background: rgba(37, 99, 235, 0.1);
}

.status-badge.pending {
  color: var(--text-muted);
  background: var(--bg-primary);
}

.status-badge.deleted {
  color: var(--color-error);
  background: rgba(185, 28, 28, 0.1);
}

.task-id {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
  margin-left: auto;
}

.update-content {
  padding: 8px 12px;
}

.task-subject {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.5;
}
</style>
