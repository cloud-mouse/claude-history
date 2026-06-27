<template>
  <div class="dropdown-wrapper">
    <button
      ref="triggerRef"
      class="dropdown-trigger"
      :class="{ 'is-open': isOpen }"
      :title="triggerTitle"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      @click.stop="toggle"
    >
      <slot name="trigger">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="2"></circle>
          <circle cx="12" cy="12" r="2"></circle>
          <circle cx="12" cy="19" r="2"></circle>
        </svg>
      </slot>
    </button>

    <Teleport to="body">
      <transition name="dropdown-menu">
        <div
          v-if="isOpen"
          ref="menuRef"
          class="dropdown-menu"
          role="menu"
          :style="menuStyle"
          @click.stop
        >
          <button
            v-for="item in items"
            :key="item.key"
            class="dropdown-item"
            :class="{ danger: item.danger, disabled: item.disabled }"
            :disabled="item.disabled"
            :title="item.disabled ? (item.disabledHint || '') : ''"
            role="menuitem"
            @click="onSelect(item)"
          >
            <span class="item-label">{{ item.label }}</span>
          </button>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  triggerTitle: { type: String, default: '' }
});
const emit = defineEmits(['select', 'close']);

const isOpen = ref(false);
const triggerRef = ref(null);
const menuRef = ref(null);
const menuStyle = ref({});

// Module-level singleton: only one dropdown open across the whole app at a time.
// Each instance registers its own `close` here; opening one closes the previous.
let activeMenuClose = null;

function positionMenu() {
  const el = triggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  // Right-align to the trigger, drop down just below it. Fixed positioning uses
  // viewport coords, matching getBoundingClientRect.
  menuStyle.value = {
    top: `${rect.bottom + 4}px`,
    right: `${window.innerWidth - rect.right}px`
  };
}

function close() {
  if (!isOpen.value) return;
  isOpen.value = false;
  if (activeMenuClose === close) activeMenuClose = null;
  emit('close');
}

function open() {
  if (activeMenuClose && activeMenuClose !== close) activeMenuClose();
  isOpen.value = true;
  activeMenuClose = close;
  nextTick(positionMenu);
}

function toggle() {
  if (isOpen.value) close();
  else open();
}

function onSelect(item) {
  if (item.disabled) return;
  emit('select', item.key);
  close();
}

function onDocClick(e) {
  if (!isOpen.value) return;
  const t = e.target;
  if (triggerRef.value?.contains(t)) return;
  if (menuRef.value?.contains(t)) return;
  close();
}

function onKeydown(e) {
  if (e.key === 'Escape' && isOpen.value) close();
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('scroll', positionMenu, true);
  window.addEventListener('resize', positionMenu);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeydown);
  window.removeEventListener('scroll', positionMenu, true);
  window.removeEventListener('resize', positionMenu);
  if (activeMenuClose === close) activeMenuClose = null;
});
</script>

<style scoped>
.dropdown-wrapper {
  position: relative;
  display: inline-flex;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--transition-fast), background var(--transition-fast);
}

.dropdown-trigger:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.dropdown-menu {
  position: fixed;
  z-index: 10001;
  min-width: 168px;
  padding: 4px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-control);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.dropdown-item:hover:not(.disabled) {
  background: var(--surface-hover);
}

.dropdown-item.danger {
  color: var(--danger);
}

.dropdown-item.danger:hover:not(.disabled) {
  background: var(--danger-bg);
}

.dropdown-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.dropdown-menu-enter-active,
.dropdown-menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-menu-enter-from,
.dropdown-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
