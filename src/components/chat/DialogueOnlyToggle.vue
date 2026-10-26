<template>
  <label class="dialogue-only-toggle">
    <span>仅查看对话内容</span>
    <input v-model="enabled" type="checkbox" role="switch" @change="savePreference" />
    <span class="toggle-track" aria-hidden="true"><span class="toggle-knob"></span></span>
  </label>
</template>

<script setup>
import { shallowRef } from 'vue'

const preferenceKey = 'claude-history-dialogue-only'
const enabled = shallowRef(readPreference())

function readPreference() {
  try {
    return localStorage.getItem(preferenceKey) === 'true'
  } catch {
    return false
  }
}

function savePreference() {
  try {
    localStorage.setItem(preferenceKey, String(enabled.value))
  } catch {
    // Storage may be unavailable; the switch still works for this view.
  }
}
</script>

<style scoped>
.dialogue-only-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  cursor: pointer;
}

.dialogue-only-toggle input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.toggle-track {
  width: 32px;
  height: 18px;
  padding: 2px;
  box-sizing: border-box;
  border-radius: var(--radius-full);
  background: var(--bg-tertiary);
  transition: background var(--transition-fast);
}

.toggle-knob {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface-selected-text);
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-fast);
}

input:checked + .toggle-track {
  background: var(--primary);
}

input:checked + .toggle-track .toggle-knob {
  transform: translateX(14px);
}

input:focus-visible + .toggle-track {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  .toggle-track,
  .toggle-knob {
    transition: none;
  }
}
</style>
