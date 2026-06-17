<template>
  <div class="glob-tool-block">
    <div class="glob-header">
      <span class="glob-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </span>
      <span class="glob-label">Glob</span>
    </div>
    <div class="glob-content">
      <div class="glob-field">
        <span class="field-label">Pattern</span>
        <span class="field-value pattern-value">{{ pattern }}</span>
      </div>
      <div v-if="path" class="glob-field">
        <span class="field-label">Path</span>
        <span class="field-value path-value">{{ path }}</span>
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

const pattern = computed(() => input.value.pattern || '');
const path = computed(() => input.value.path || '');

function expandAll() {}
function collapseAll() {}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.glob-tool-block {
  margin-top: 8px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.glob-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
}

.glob-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

.glob-label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.glob-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.glob-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.field-value {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.pattern-value {
  font-family: var(--font-mono);
  color: var(--accent);
  background-color: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  word-break: break-all;
}

.path-value {
  font-family: var(--font-mono);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  background-color: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  word-break: break-all;
}
</style>
