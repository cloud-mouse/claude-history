<template>
  <div class="theme-selector">
    <button class="theme-btn" @click="toggleDropdown" :title="'切换主题: ' + currentThemeName">
      <span class="theme-icon">{{ currentThemeIcon }}</span>
    </button>
    <transition name="dropdown">
      <div v-if="showDropdown" class="theme-dropdown">
        <button
          v-for="theme in themes"
          :key="theme.id"
          :class="['theme-option', { active: themeStore.currentTheme === theme.id }]"
          @click="selectTheme(theme.id)"
        >
          <span class="option-icon">{{ theme.icon }}</span>
          <span class="option-name">{{ theme.name }}</span>
          <svg v-if="themeStore.currentTheme === theme.id" class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>
    </transition>
    <div v-if="showDropdown" class="backdrop" @click="showDropdown = false"></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useThemeStore } from '../../stores/theme';

const themeStore = useThemeStore();
const showDropdown = ref(false);

const themes = computed(() => themeStore.themes);

const currentThemeName = computed(() => {
  const theme = themes.value.find(t => t.id === themeStore.currentTheme);
  return theme?.name || '主题';
});

const currentThemeIcon = computed(() => {
  const theme = themes.value.find(t => t.id === themeStore.currentTheme);
  return theme?.icon || '🎨';
});

function toggleDropdown() {
  showDropdown.value = !showDropdown.value;
}

function selectTheme(themeId) {
  themeStore.setTheme(themeId);
  showDropdown.value = false;
}
</script>

<style scoped>
.theme-selector {
  position: relative;
}

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  color: var(--text-secondary);
}

.theme-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.theme-icon {
  font-size: 16px;
}

.theme-dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 8px;
  min-width: 160px;
  z-index: 1000;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-primary);
  font-size: var(--font-size-sm);
  transition: all var(--transition-fast);
  text-align: left;
}

.theme-option:hover {
  background: var(--surface-hover);
}

.theme-option.active {
  background: var(--surface-selected);
  color: var(--surface-selected-text);
}

.option-icon {
  font-size: 16px;
  width: 20px;
  text-align: center;
}

.option-name {
  flex: 1;
}

.check-icon {
  color: var(--accent);
}

.backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
}

/* Dropdown animation */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
