<template>
  <div :class="['collapsible-block', { failed }]">
    <button class="cb-header" @click="expanded = !expanded" :aria-expanded="expanded">
      <svg class="cb-chevron" :class="{ open: expanded }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 5l7 7-7 7"></path>
      </svg>
      <slot name="icon">
        <svg class="cb-icon-default" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
      </slot>
      <span class="cb-name">{{ name }}</span>
      <span v-if="summary || $slots.summary" class="cb-summary">
        <slot name="summary">{{ summary }}</slot>
      </span>
      <span v-if="status" class="cb-status">{{ status }}</span>
    </button>
    <transition name="cb-expand">
      <div v-show="expanded" class="cb-body">
        <slot></slot>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  name: { type: String, required: true },
  summary: { type: String, default: '' },
  status: { type: String, default: '' },
  failed: { type: Boolean, default: false },
  defaultExpanded: { type: Boolean, default: false }
});

const expanded = ref(props.defaultExpanded);

function expandAll() {
  expanded.value = true;
}

function collapseAll() {
  expanded.value = false;
}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.collapsible-block {
  margin-top: 8px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-secondary);
}

.collapsible-block.failed {
  background: var(--danger-bg);
}

.cb-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  text-align: left;
  transition: background var(--transition-fast);
}

.cb-header:hover {
  background: var(--surface-hover);
}

.collapsible-block.failed .cb-header {
  background: var(--danger-bg);
}

.cb-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform var(--transition-fast);
}

.cb-chevron.open {
  transform: rotate(90deg);
}

.cb-icon-default {
  flex-shrink: 0;
  color: var(--text-muted);
}

.cb-name {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  flex-shrink: 0;
  font-family: var(--font-mono);
}

.collapsible-block.failed .cb-name {
  color: var(--danger);
}

.cb-summary {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.cb-status {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  flex-shrink: 0;
  margin-left: auto;
}

.collapsible-block.failed .cb-status {
  color: var(--danger);
}

.cb-body {
  padding: 12px;
  background: var(--bg-primary);
}

.cb-expand-enter-active,
.cb-expand-leave-active {
  transition: opacity var(--transition-fast);
}

.cb-expand-enter-from,
.cb-expand-leave-to {
  opacity: 0;
}
</style>
