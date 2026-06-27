<template>
  <CollapsibleBlock ref="blockRef" name="Write" :summary="filePath" :status="lineStatus">
    <template #icon>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </template>
    <div class="write-fields">
      <div class="write-field">
        <span class="field-label">路径</span>
        <span class="field-value file-path">{{ filePath }}</span>
      </div>
      <div class="write-field">
        <span class="field-label">内容</span>
        <pre class="field-value code-content">{{ content }}</pre>
      </div>
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
    try { return JSON.parse(props.block.input); } catch { return props.block.input; }
  }
  return props.block.input || {};
});

const filePath = computed(() => input.value.file_path || '');
const content = computed(() => input.value.content || '');

const lineStatus = computed(() => {
  if (!content.value) return '';
  const lines = content.value.split('\n').length;
  return `${lines} 行`;
});

function expandAll() { blockRef.value?.expandAll(); }
function collapseAll() { blockRef.value?.collapseAll(); }

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.write-fields {
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
  margin: 0;
  padding: 12px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  overflow-x: auto;
  background-color: var(--code-bg);
}
</style>
