<template>
  <div class="task-output-block">
    <div class="output-header">
      <span class="output-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      </span>
      <span class="output-label">TaskOutput</span>
      <span v-if="block" class="block-badge">等待中</span>
      <span class="timeout-badge">{{ formattedTimeout }}</span>
    </div>
    <div v-if="taskId" class="output-content">
      <span class="task-id-label">Task</span>
      <code class="task-id-value">{{ taskId }}</code>
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

const taskId = computed(() => input.value.task_id || '');
const block = computed(() => input.value.block === true);
const timeout = computed(() => input.value.timeout || 0);

const formattedTimeout = computed(() => {
  const ms = timeout.value;
  if (ms <= 0) return '';
  if (ms >= 60000) return `${(ms / 60000).toFixed(0)}min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(0)}s`;
  return `${ms}ms`;
});

function expandAll() {}
function collapseAll() {}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.task-output-block {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.output-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.output-icon {
  display: flex;
  align-items: center;
  color: var(--text-secondary);
}

.output-label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.block-badge {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: #d97706;
  background: rgba(245, 158, 11, 0.1);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.timeout-badge {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  background: var(--bg-primary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  margin-left: auto;
}

.output-content {
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-id-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.task-id-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  word-break: break-all;
}
</style>
