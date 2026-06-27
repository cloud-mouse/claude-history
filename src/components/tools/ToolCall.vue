<template>
  <CollapsibleBlock ref="blockRef" :name="toolName" :summary="callSummary" :status="callStatus">
    <template #icon>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
        <line x1="8" y1="21" x2="16" y2="21"></line>
        <line x1="12" y1="17" x2="12" y2="21"></line>
      </svg>
    </template>
    <div v-if="isBashJsonCommand" class="bash-command-wrapper">
      <div class="bash-field">
        <span class="bash-label">命令</span>
        <pre class="bash-command"><code>{{ parsedCommand }}</code></pre>
      </div>
      <div v-if="parsedDescription" class="bash-field">
        <span class="bash-label">描述</span>
        <span class="bash-description">{{ parsedDescription }}</span>
      </div>
    </div>
    <pre v-else class="code-block"><code>{{ inputText }}</code></pre>
  </CollapsibleBlock>
</template>

<script setup>
import { ref, computed } from 'vue';
import CollapsibleBlock from '../common/CollapsibleBlock.vue';

const props = defineProps({
  block: { type: Object, required: true }
});

const blockRef = ref(null);

const toolName = computed(() => props.block.toolName || props.block.name || 'unknown');

const lineCount = computed(() => {
  if (props.block.inputLines) {
    return props.block.inputLines;
  }
  const input = props.block.input;
  if (typeof input === 'string') {
    const lines = input.split('\n').length;
    return lines > 1 ? lines : 0;
  }
  if (typeof input === 'object' && input !== null) {
    return 1;
  }
  return 0;
});

const inputText = computed(() => {
  const input = props.block.input;
  if (typeof input === 'string') {
    return input;
  }
  if (typeof input === 'object' && input !== null) {
    return JSON.stringify(input, null, 2);
  }
  return '';
});

const isBashJsonCommand = computed(() => {
  const name = toolName.value.toLowerCase();
  if (name !== 'bash') return false;

  const input = props.block.input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return parsed.command && typeof parsed.command === 'string';
    } catch {
      return false;
    }
  }
  if (typeof input === 'object' && input !== null) {
    return input.command && typeof input.command === 'string';
  }
  return false;
});

const parsedCommand = computed(() => {
  const input = props.block.input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return parsed.command || '';
    } catch {
      return input;
    }
  }
  if (typeof input === 'object' && input !== null) {
    return input.command || '';
  }
  return '';
});

const parsedDescription = computed(() => {
  const input = props.block.input;
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return parsed.description || '';
    } catch {
      return '';
    }
  }
  if (typeof input === 'object' && input !== null) {
    return input.description || '';
  }
  return '';
});

// First line of the command / input, truncated — the collapsed summary.
const callSummary = computed(() => {
  const cmd = isBashJsonCommand.value ? parsedCommand.value : inputText.value;
  if (!cmd) return '';
  const firstLine = String(cmd).split('\n')[0];
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine;
});

const callStatus = computed(() => (lineCount.value > 0 ? `${lineCount.value} 行` : ''));

function expandAll() { blockRef.value?.expandAll(); }
function collapseAll() { blockRef.value?.collapseAll(); }

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.bash-command-wrapper {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bash-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bash-label {
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.bash-command {
  margin: 0;
  padding: 14px;
  background-color: var(--code-bg);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--accent);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  line-height: 1.6;
  overflow-x: auto;
}

.bash-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-style: italic;
}

.code-block {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  line-height: 1.6;
}
</style>
