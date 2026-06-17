<template>
  <div class="task-create-block">
    <div class="task-header">
      <span class="task-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      </span>
      <span class="task-label">TaskCreate</span>
    </div>
    <div class="task-content">
      <div class="task-field">
        <span class="field-label">Subject</span>
        <span class="field-value subject">{{ input.subject }}</span>
      </div>
      <div class="task-field">
        <span class="field-label">Description</span>
        <pre class="field-value description">{{ formatDescription(input.description) }}</pre>
      </div>
      <div v-if="input.activeForm" class="task-field">
        <span class="field-label">ActiveForm</span>
        <span class="field-value active-form">{{ input.activeForm }}</span>
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
      return {};
    }
  }
  return props.block.input || {};
});

// Format description to be more readable
function formatDescription(desc) {
  if (!desc) return '';
  if (typeof desc !== 'string') return String(desc);

  // Check if it's already somewhat formatted
  if (desc.includes('\n')) {
    return desc;
  }

  // Try to add line breaks for better readability
  // Split on common separators
  const sentences = desc.split(/(?<=[。；，])/);
  return sentences.filter(s => s.trim()).join('\n');
}

// Expand all
function expandAll() {
  // No-op for this component
}

function collapseAll() {
  // No-op for this component
}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.task-create-block {
  margin-top: 8px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
}

.task-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

.task-label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.task-content {
  padding: 12px;
}

.task-field {
  margin-bottom: 12px;
}

.task-field:last-child {
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

.field-value.subject {
  font-weight: 600;
  color: var(--accent);
}

.field-value.description {
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  line-height: 1.5;
  background-color: var(--code-bg);
  padding: 8px;
  border-radius: var(--radius-sm);
}

.field-value.active-form {
  font-family: var(--font-mono);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  background-color: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  display: inline-block;
}
</style>