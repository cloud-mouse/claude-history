<template>
  <CollapsibleBlock ref="blockRef" name="Grep" :summary="pattern" :status="grepStatus">
    <template #icon>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="4 17 10 11 4 5"/>
        <line x1="12" y1="19" x2="20" y2="19"/>
      </svg>
    </template>
    <div class="grep-fields">
      <div class="grep-field">
        <span class="field-label">模式</span>
        <span class="field-value pattern-value">{{ pattern }}</span>
      </div>
      <div v-if="path" class="grep-field">
        <span class="field-label">路径</span>
        <span class="field-value path-value">{{ path }}</span>
      </div>
      <div v-if="hasParams" class="grep-params">
        <div v-if="glob" class="grep-param">
          <span class="param-label">glob</span>
          <span class="param-value">{{ glob }}</span>
        </div>
        <div v-if="outputMode" class="grep-param">
          <span class="param-label">output_mode</span>
          <span class="param-value">{{ outputMode }}</span>
        </div>
        <div v-if="caseInsensitive" class="grep-param">
          <span class="param-label">case insensitive</span>
        </div>
        <div v-if="type" class="grep-param">
          <span class="param-label">type</span>
          <span class="param-value">{{ type }}</span>
        </div>
        <div v-if="headLimit" class="grep-param">
          <span class="param-label">head_limit</span>
          <span class="param-value">{{ headLimit }}</span>
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

const input = computed(() => {
  if (typeof props.block.input === 'string') {
    try { return JSON.parse(props.block.input); } catch { return props.block.input; }
  }
  return props.block.input || {};
});

const pattern = computed(() => input.value.pattern || '');
const path = computed(() => input.value.path || '');
const glob = computed(() => input.value.glob || '');
const outputMode = computed(() => input.value.output_mode || '');
const caseInsensitive = computed(() => input.value['-i'] || false);
const type = computed(() => input.value.type || '');
const headLimit = computed(() => input.value.head_limit ?? '');

const hasParams = computed(() =>
  glob.value || outputMode.value || caseInsensitive.value || type.value || headLimit.value
);

// Summary status: prefer output_mode, fall back to head_limit cap.
const grepStatus = computed(() => {
  if (outputMode.value) return outputMode.value;
  if (headLimit.value) return `上限 ${headLimit.value}`;
  return '';
});

function expandAll() { blockRef.value?.expandAll(); }
function collapseAll() { blockRef.value?.collapseAll(); }

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.grep-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grep-field {
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

.pattern-value {
  font-family: var(--font-mono);
  color: var(--accent);
  background-color: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  word-break: break-all;
}

.path-value {
  font-family: var(--font-mono);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  background-color: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  word-break: break-all;
}

.grep-params {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.grep-param {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-label { font-size: var(--font-size-xs); color: var(--text-muted); }

.param-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background-color: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}
</style>
