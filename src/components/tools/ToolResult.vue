<template>
  <div :class="['tool-result', { error: isError }]">
    <button class="toggle-btn" @click="expanded = !expanded">
      <span class="toggle-icon">
        <svg v-if="expanded" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 9l-7 7-7-7"></path>
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 5l7 7-7 7"></path>
        </svg>
      </span>
      <span class="result-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        结果
      </span>
      <span v-if="isError" class="error-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        Error
      </span>
    </button>
    <div v-if="expanded" class="result-content">
      <pre class="result-text"><code>{{ contentText }}</code></pre>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  block: {
    type: Object,
    required: true
  }
});

const expanded = ref(false);

const isError = computed(() => {
  return props.block.isError === true || props.block.is_error === true;
});

const contentText = computed(() => {
  const content = props.block.content || props.block.result || '';
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content, null, 2);
});

function expandAll() {
  expanded.value = true;
}

function collapseAll() {
  expanded.value = false;
}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.tool-result {
  margin-top: 12px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-secondary);
}

.tool-result.error {
  background: var(--danger-bg);
}

.toggle-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background-color: var(--bg-tertiary);
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  text-align: left;
  transition: all var(--transition-fast);
}

.toggle-btn:hover {
  background-color: var(--surface-hover);
}

.toggle-icon {
  display: flex;
  align-items: center;
  color: var(--text-muted);
}

.result-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.error-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--danger);
  background: var(--danger-bg);
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  margin-left: auto;
}

.result-content {
  padding: 14px;
  background-color: var(--bg-primary);
  max-height: 500px;
  overflow-y: auto;
}

.result-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  line-height: 1.6;
}

.tool-result.error .result-text {
  color: var(--danger);
}
</style>
