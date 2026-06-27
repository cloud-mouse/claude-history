<template>
  <CollapsibleBlock ref="blockRef" name="结果" :summary="resultSummary" :failed="isError">
    <template #icon>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
      </svg>
    </template>
    <pre :class="['result-text', { error: isError }]"><code>{{ contentText }}</code></pre>
  </CollapsibleBlock>
</template>

<script setup>
import { ref, computed } from 'vue';
import CollapsibleBlock from '../common/CollapsibleBlock.vue';

const props = defineProps({
  block: { type: Object, required: true }
});

const blockRef = ref(null);

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

const resultSummary = computed(() => {
  const text = contentText.value;
  if (!text) return '';
  const firstLine = text.split('\n')[0];
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine;
});

function expandAll() { blockRef.value?.expandAll(); }
function collapseAll() { blockRef.value?.collapseAll(); }

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.result-text {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  line-height: 1.6;
}

.result-text.error {
  color: var(--danger);
}
</style>
