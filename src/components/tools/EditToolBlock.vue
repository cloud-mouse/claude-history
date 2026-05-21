<template>
  <div class="edit-tool-block">
    <div class="edit-header">
      <span class="edit-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </span>
      <span class="edit-label">Edit File</span>
    </div>
    <div class="edit-content">
      <div class="edit-field">
        <span class="field-label">File Path</span>
        <span class="field-value file-path">{{ filePath }}</span>
      </div>
      <div class="edit-field">
        <span class="field-label">Old String</span>
        <pre class="field-value code-diff old">{{ oldString }}</pre>
      </div>
      <div class="edit-field">
        <span class="field-label">New String</span>
        <pre class="field-value code-diff new">{{ newString }}</pre>
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
const oldString = computed(() => input.value.old_string || '');
const newString = computed(() => input.value.new_string || '');

function expandAll() {}
function collapseAll() {}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.edit-tool-block {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.edit-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.edit-icon {
  display: flex;
  align-items: center;
  color: var(--primary);
}

.edit-label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.edit-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-field {
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
  color: var(--primary);
  background-color: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  word-break: break-all;
}

.code-diff {
  margin: 0;
  padding: 12px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  overflow-x: auto;
}

.code-diff.old {
  background-color: rgba(220, 38, 38, 0.1);
  border: 1px solid rgba(220, 38, 38, 0.3);
}

.code-diff.new {
  background-color: rgba(22, 163, 74, 0.1);
  border: 1px solid rgba(22, 163, 74, 0.3);
}
</style>