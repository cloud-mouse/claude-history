<template>
  <CollapsibleBlock ref="blockRef" name="TaskCreate" :summary="subject">
    <template #icon>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 11l3 3L22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    </template>
    <div class="task-fields">
      <div class="task-field">
        <span class="field-label">主题</span>
        <span class="field-value subject">{{ subject }}</span>
      </div>
      <div class="task-field">
        <span class="field-label">描述</span>
        <pre class="field-value description">{{ formatDescription(description) }}</pre>
      </div>
      <div v-if="activeForm" class="task-field">
        <span class="field-label">活动表单</span>
        <span class="field-value active-form">{{ activeForm }}</span>
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
    try { return JSON.parse(props.block.input); } catch { return {}; }
  }
  return props.block.input || {};
});

const subject = computed(() => input.value.subject || '');
const description = computed(() => input.value.description || '');
const activeForm = computed(() => input.value.activeForm || '');

// Break a long single-line description into more readable lines.
function formatDescription(desc) {
  if (!desc) return '';
  if (typeof desc !== 'string') return String(desc);
  if (desc.includes('\n')) return desc;
  const sentences = desc.split(/(?<=[。；，])/);
  return sentences.filter(s => s.trim()).join('\n');
}

function expandAll() { blockRef.value?.expandAll(); }
function collapseAll() { blockRef.value?.collapseAll(); }

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.task-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-field { display: flex; flex-direction: column; gap: 4px; }

.field-label {
  display: block;
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
  width: fit-content;
}
</style>
