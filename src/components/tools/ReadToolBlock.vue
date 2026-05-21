<template>
  <div class="read-tool-block">
    <div class="read-header">
      <span class="read-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
      </span>
      <span class="read-label">Read File</span>
    </div>
    <div class="read-content">
      <div class="read-field">
        <span class="field-label">File Path</span>
        <span class="field-value file-path">{{ filePath }}</span>
      </div>
      <div class="read-params">
        <div v-if="offset !== null" class="read-param">
          <span class="param-label">Offset</span>
          <span class="param-value">{{ offset }}</span>
        </div>
        <div v-if="limit !== null" class="read-param">
          <span class="param-label">Limit</span>
          <span class="param-value">{{ limit }}</span>
        </div>
      </div>
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
      return props.block.input;
    }
  }
  return props.block.input || {};
});

const filePath = computed(() => input.value.file_path || '');
const offset = computed(() => input.value.offset ?? null);
const limit = computed(() => input.value.limit ?? null);

function expandAll() {}
function collapseAll() {}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.read-tool-block {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.read-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.read-icon {
  display: flex;
  align-items: center;
  color: var(--primary);
}

.read-label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.read-content {
  padding: 12px;
}

.read-field {
  margin-bottom: 8px;
}

.read-field:last-child {
  margin-bottom: 0;
}

.field-label {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.field-value {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.field-value.file-path {
  font-family: var(--font-mono);
  color: var(--primary);
  background-color: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  word-break: break-all;
}

.read-params {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.read-param {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.param-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  background-color: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
</style>