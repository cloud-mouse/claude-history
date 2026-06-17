<template>
  <div class="command-block">
    <div class="command-header">
      <span class="command-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
      </span>
      <span v-if="command.name" class="command-name">{{ command.name }}</span>
      <span v-else-if="command.message" class="command-message">{{ command.message }}</span>
    </div>
    <div v-if="hasArgs" class="command-args">
      <pre class="args-content"><code>{{ formattedArgs }}</code></pre>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  command: {
    type: Object,
    required: true
  },
  body: {
    type: String,
    default: ''
  }
});

const hasArgs = computed(() => {
  return props.command.args && props.command.args.trim().length > 0;
});

// Format arguments for better readability
const formattedArgs = computed(() => {
  const args = props.command.args || '';
  // If it's a long URL or multi-line content, clean it up
  if (args.length > 200 && !args.includes('\n')) {
    return args;
  }
  return args;
});

function expandAll() {
  // No-op
}

function collapseAll() {
  // No-op
}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.command-block {
  margin-bottom: 12px;
  border-radius: var(--radius-card);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.command-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
}

.command-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

.command-name {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--accent);
  font-family: var(--font-mono);
}

.command-message {
  font-weight: 500;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.command-args {
  padding: 12px;
  background-color: var(--bg-primary);
  max-height: 300px;
  overflow-y: auto;
}

.args-content {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
  line-height: 1.5;
}
</style>
