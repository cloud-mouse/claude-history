<template>
  <div class="thinking-block">
    <button class="toggle-btn" @click="expanded = !expanded">
      <span class="toggle-icon">{{ expanded ? '▼' : '▶' }}</span>
      <span class="thinking-label">Thinking</span>
    </button>
    <div v-if="expanded" class="thinking-content">
      <p class="thinking-text">{{ thinkingText }}</p>
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

const thinkingText = computed(() => {
  const thinking = props.block.thinking || props.block.content || props.block.text || '';
  if (typeof thinking === 'string') {
    return thinking;
  }
  return JSON.stringify(thinking, null, 2);
});

// Expand all (set expanded to true)
function expandAll() {
  expanded.value = true;
}

function collapseAll() {
  expanded.value = false;
}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.thinking-block {
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.toggle-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  text-align: left;
}

.toggle-btn:hover {
  background-color: var(--border-color);
}

.toggle-icon {
  font-size: 10px;
  color: var(--text-muted);
}

.thinking-label {
  font-weight: 500;
  color: var(--text-secondary);
}

.thinking-content {
  padding: 12px;
  background-color: var(--bg-primary);
  border-top: 1px solid var(--border-color);
}

.thinking-text {
  margin: 0;
  font-style: italic;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
