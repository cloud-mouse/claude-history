<template>
  <CollapsibleBlock ref="blockRef" name="TaskOutput" :summary="taskId" :status="outputStatus">
    <template #icon>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
      </svg>
    </template>
    <div v-if="taskId" class="output-fields">
      <span class="task-id-label">任务</span>
      <code class="task-id-value">{{ taskId }}</code>
    </div>
  </CollapsibleBlock>
</template>

<script setup>
import { ref, computed } from 'vue';
import CollapsibleBlock from '../common/CollapsibleBlock.vue';

const props = defineProps({
  block: { type: Object, required: true }
});

const blockRef = ref(null);

const input = computed(() => {
  if (typeof props.block.input === 'string') {
    try { return JSON.parse(props.block.input); } catch { return {}; }
  }
  return props.block.input || {};
});

const taskId = computed(() => input.value.task_id || '');
const isBlocking = computed(() => input.value.block === true);
const timeout = computed(() => input.value.timeout || 0);

const formattedTimeout = computed(() => {
  const ms = timeout.value;
  if (ms <= 0) return '';
  if (ms >= 60000) return `${(ms / 60000).toFixed(0)}min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(0)}s`;
  return `${ms}ms`;
});

const outputStatus = computed(() => {
  if (isBlocking.value) return '等待中';
  return formattedTimeout.value;
});

function expandAll() { blockRef.value?.expandAll(); }
function collapseAll() { blockRef.value?.collapseAll(); }

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.output-fields {
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
