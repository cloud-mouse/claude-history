<template>
  <div class="write-tool-block">
    <div class="write-header">
      <span class="write-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </span>
      <span class="write-label">Write File</span>
    </div>
    <div class="write-content">
      <div class="write-field">
        <span class="field-label">File Path</span>
        <span class="field-value file-path">{{ filePath }}</span>
      </div>
      <div class="write-field">
        <span class="field-label">Content</span>
        <pre class="field-value code-content">{{ content }}</pre>
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
const content = computed(() => input.value.content || '');

function expandAll() {}
function collapseAll() {}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.write-tool-block {
  margin-top: 8px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.write-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
}

.write-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

.write-label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.write-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.write-field {
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

.field-value.file-path {
  font-family: var(--font-mono);
  color: var(--accent);
  background-color: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  word-break: break-all;
}

.code-content {
  background-color: var(--code-bg);
}
</style>