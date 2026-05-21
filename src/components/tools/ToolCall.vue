<template>
  <div class="tool-call">
    <button class="toggle-btn" @click="expanded = !expanded">
      <span class="toggle-icon">
        <svg v-if="expanded" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 9l-7 7-7-7"></path>
        </svg>
        <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 5l7 7-7 7"></path>
        </svg>
      </span>
      <span class="tool-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        {{ toolName }}
      </span>
      <span v-if="lineCount > 0" class="line-count">{{ lineCount }} 行</span>
    </button>
    <div v-if="expanded" class="tool-content">
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

function expandAll() {
  expanded.value = true;
}

function collapseAll() {
  expanded.value = false;
}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.tool-call {
  margin-top: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-secondary);
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
  background-color: var(--border-color);
}

.toggle-icon {
  display: flex;
  align-items: center;
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.tool-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--text-primary);
  background: linear-gradient(135deg, rgba(180, 83, 9, 0.1), rgba(245, 158, 11, 0.1));
  padding: 3px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.line-count {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  margin-left: auto;
}

.tool-content {
  padding: 14px;
  background-color: var(--bg-primary);
  border-top: 1px solid var(--border-color);
  max-height: 500px;
  overflow-y: auto;
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
  background-color: var(--bg-tertiary);
  border-radius: var(--radius-md);
  border-left: 3px solid var(--primary);
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
</style>
