<template>
  <CollapsibleBlock ref="blockRef" name="思考" :summary="summaryText">
    <template #icon>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 18h6"></path>
        <path d="M10 22h4"></path>
        <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"></path>
      </svg>
    </template>
    <p class="thinking-text">{{ thinkingText }}</p>
  </CollapsibleBlock>
</template>

<script setup>
import { ref, computed } from 'vue';
import CollapsibleBlock from '../common/CollapsibleBlock.vue';

const props = defineProps({
  block: { type: Object, required: true }
});

const blockRef = ref(null);

const thinkingText = computed(() => {
  const thinking = props.block.thinking || props.block.content || props.block.text || '';
  if (typeof thinking === 'string') {
    return thinking;
  }
  return JSON.stringify(thinking, null, 2);
});

const summaryText = computed(() => {
  const text = thinkingText.value;
  if (!text) return '';
  const firstLine = text.split('\n')[0];
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine;
});

function expandAll() { blockRef.value?.expandAll(); }
function collapseAll() { blockRef.value?.collapseAll(); }

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
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
