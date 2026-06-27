<template>
  <CollapsibleBlock ref="blockRef" name="Agent" :summary="description" :status="subagentType">
    <template #icon>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
        <path d="M2 17l10 5 10-5"></path>
        <path d="M2 12l10 5 10-5"></path>
      </svg>
    </template>
    <div class="agent-fields">
      <div v-if="description" class="agent-field">
        <span class="field-label">描述</span>
        <span class="field-value description">{{ description }}</span>
      </div>
      <div v-if="promptText" class="agent-field">
        <div class="prompt-header">
          <span class="field-label">提示</span>
          <button class="prompt-toggle" @click="promptExpanded = !promptExpanded">
            <svg v-if="promptExpanded" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 9l-7 7-7-7"></path>
            </svg>
            <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 5l7 7-7 7"></path>
            </svg>
            {{ promptExpanded ? '收起' : `展开 (${promptLineCount} 行)` }}
          </button>
        </div>
        <div v-if="promptExpanded" class="prompt-content">
          <pre>{{ promptText }}</pre>
        </div>
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
// Local expand state for the prompt block only; the outer CollapsibleBlock
// handles the overall collapse (driven by "展开/收起全部").
const promptExpanded = ref(false);

const input = computed(() => {
  if (typeof props.block.input === 'string') {
    try { return JSON.parse(props.block.input); } catch { return {}; }
  }
  return props.block.input || {};
});

const subagentType = computed(() => input.value.subagent_type || '');
const description = computed(() => input.value.description || '');
const promptText = computed(() => input.value.prompt || '');

const promptLineCount = computed(() => {
  if (!promptText.value) return 0;
  return promptText.value.split('\n').length;
});

function expandAll() { blockRef.value?.expandAll(); }
function collapseAll() { blockRef.value?.collapseAll(); }

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.agent-field { margin-bottom: 10px; }
.agent-field:last-child { margin-bottom: 0; }

.field-label {
  display: block;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.field-value.description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-style: italic;
}

.prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.prompt-header .field-label {
  margin-bottom: 0;
}

.prompt-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  font-family: var(--font-sans);
}

.prompt-toggle:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.prompt-content {
  background-color: var(--code-bg);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--accent);
  overflow: hidden;
}

.prompt-content pre {
  margin: 0;
  padding: 12px;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  line-height: 1.5;
  max-height: 400px;
  overflow-y: auto;
}
</style>
