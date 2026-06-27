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

    <div v-if="showFrostedGlass" class="setting-card">
      <div class="frosted-head">
        <div class="frosted-text">
          <h3 class="card-title">毛玻璃效果</h3>
          <p class="frosted-desc">开启后窗口透出桌面并模糊；关闭则切换为高对比不透明背景。</p>
        </div>
        <button
          type="button"
          class="toggle"
          role="switch"
          :aria-checked="frostedOn ? 'true' : 'false'"
          :class="{ on: frostedOn, loading: appearanceStore.frostedGlass === null }"
          :disabled="appearanceStore.frostedGlass === null"
          :title="frostedOn ? '点击关闭' : '点击开启'"
          @click="handleToggle"
        >
          <span class="toggle-knob"></span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useThemeStore } from '../../stores/theme';
import { useAppearanceStore } from '../../stores/appearance';

const themeStore = useThemeStore();
const appearanceStore = useAppearanceStore();

// Linux has no native equivalent — hide the card entirely.
const showFrostedGlass = window.electronAPI?.platform !== 'linux';

// `frostedGlass` is null only for the brief moment before init() resolves;
// treat that as ON (the documented default) so the toggle renders in the
// expected state instead of flickering to OFF.
const frostedOn = computed(() => appearanceStore.frostedGlass !== false);

function handleToggle() {
  // Don't fire while the initial value is still loading.
  if (appearanceStore.frostedGlass === null) return;
  appearanceStore.setFrostedGlass(!frostedOn.value);
}
</script>

<style scoped>
.appearance-tab { display: flex; flex-direction: column; gap: 12px; }

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

/* Frosted-glass card */
.frosted-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.frosted-text { flex: 1; min-width: 0; }
.frosted-text .card-title { margin-bottom: 6px; }
.frosted-desc {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--leading-normal);
}

/* Toggle switch — accessible button with role="switch" + aria-checked. */
.toggle {
  flex-shrink: 0;
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
  padding: 0;
  background: var(--bg-tertiary);
  transition: background var(--transition-base);
}
.toggle.on { background: var(--primary); }
.toggle:disabled { cursor: default; opacity: 0.6; }

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface-selected-text);
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-base);
}
.toggle.on .toggle-knob { transform: translateX(18px); }
</style>
