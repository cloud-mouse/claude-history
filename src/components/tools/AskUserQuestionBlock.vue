<template>
  <div class="ask-question-block">
    <div class="question-header">
      <span class="question-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </span>
      <span class="question-label">Question</span>
    </div>
    <div class="question-content">
      <template v-for="(q, qi) in questions" :key="qi">
        <div class="question-item">
          <div class="question-meta">
            <span v-if="q.header" class="question-tag">{{ q.header }}</span>
            <span v-if="q.multiSelect" class="multi-select-badge">多选</span>
          </div>
          <p class="question-text">{{ q.question }}</p>
          <div class="options-list">
            <div
              v-for="(opt, oi) in q.options"
              :key="oi"
              :class="['option-item', { selected: isOptionSelected(qi, oi) }]"
            >
              <span class="option-index">{{ String.fromCharCode(65 + oi) }}</span>
              <div class="option-content">
                <span class="option-label">{{ opt.label }}</span>
                <span v-if="opt.description" class="option-desc">{{ opt.description }}</span>
              </div>
              <span v-if="isOptionSelected(qi, oi)" class="option-check">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M20 6L9 17l-5-5"></path>
                </svg>
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  block: {
    type: Object,
    required: true
  }
});

const input = computed(() => {
  if (typeof props.block.input === 'string') {
    try {
      return JSON.parse(props.block.input);
    } catch {
      return {};
    }
  }
  return props.block.input || {};
});

const questions = computed(() => {
  const raw = input.value.questions;
  if (!Array.isArray(raw)) {
    if (input.value.question) {
      return [{
        question: input.value.question,
        header: input.value.header || '',
        multiSelect: input.value.multiSelect || false,
        options: input.value.options || []
      }];
    }
    return [];
  }
  return raw;
});

function isOptionSelected(qIndex, oIndex) {
  return false;
}

function expandAll() {}
function collapseAll() {}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.ask-question-block {
  margin-top: 8px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.question-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
}

.question-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

.question-label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.question-content {
  padding: 12px;
}

.question-item + .question-item {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
}

.question-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.question-tag {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-bg);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.multi-select-badge {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.question-text {
  margin: 0 0 10px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  transition: all var(--transition-fast);
}

.option-item.selected {
  border-color: var(--accent);
  background: var(--accent-bg);
}

.option-index {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 600;
  background: var(--bg-primary);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
}

.option-item.selected .option-index {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
}

.option-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.option-label {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  font-weight: 500;
}

.option-desc {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.5;
}

.option-check {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: var(--accent);
}
</style>
