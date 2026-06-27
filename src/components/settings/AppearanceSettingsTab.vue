<template>
  <div class="appearance-tab">
    <div class="setting-card">
      <h3 class="card-title">主题</h3>
      <div class="theme-list">
        <button
          v-for="theme in themeStore.themes"
          :key="theme.id"
          class="theme-option"
          :class="{ active: themeStore.currentTheme === theme.id }"
          @click="themeStore.setTheme(theme.id)"
        >
          <span class="option-icon">{{ theme.icon }}</span>
          <span class="option-name">{{ theme.name }}</span>
          <svg v-if="themeStore.currentTheme === theme.id" class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useThemeStore } from '../../stores/theme';

const themeStore = useThemeStore();
</script>

<style scoped>
.appearance-tab { display: flex; flex-direction: column; }

.setting-card {
  background: var(--bg-secondary); border-radius: var(--radius-card);
  padding: 16px;
}
.card-title {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.6px;
}

.theme-list { display: flex; flex-direction: column; gap: 4px; }

.theme-option {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 10px 12px; border-radius: var(--radius-md);
  border: none; background: transparent; cursor: pointer;
  color: var(--text-primary); font-size: 14px; text-align: left;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.theme-option:hover { background: var(--surface-hover); }
.theme-option.active {
  background: var(--surface-selected); color: var(--surface-selected-text);
}

.option-icon { font-size: 16px; width: 20px; text-align: center; }
.option-name { flex: 1; }
.check-icon { color: var(--accent); }
</style>
