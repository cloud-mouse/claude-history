<template>
  <Teleport to="body">
    <transition name="modal">
      <div v-if="show" class="settings-overlay" @click.self="$emit('close')">
        <div class="settings-modal" role="dialog" aria-modal="true" aria-label="设置">
          <div class="modal-header">
            <h2>设置</h2>
            <button class="close-btn" @click="$emit('close')" title="关闭">&times;</button>
          </div>
          <div class="modal-shell">
            <nav class="settings-nav" aria-label="设置分区">
              <button
                v-for="tab in tabs"
                :key="tab.key"
                class="settings-nav-item"
                :class="{ active: activeTab === tab.key }"
                @click="activeTab = tab.key"
              >
                {{ tab.label }}
              </button>
            </nav>
            <div class="settings-content">
              <KeepAlive>
                <component :is="currentTabComponent" />
              </KeepAlive>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import FeishuSettingsTab from './FeishuSettingsTab.vue';
import AppearanceSettingsTab from './AppearanceSettingsTab.vue';
import StatsSettingsTab from './StatsSettingsTab.vue';
import AboutSettingsTab from './AboutSettingsTab.vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  initialTab: { type: String, default: 'feishu' }
});
defineEmits(['close']);

const tabs = [
  { key: 'feishu', label: '飞书桥接', comp: FeishuSettingsTab },
  { key: 'appearance', label: '外观', comp: AppearanceSettingsTab },
  { key: 'stats', label: '使用统计', comp: StatsSettingsTab },
  { key: 'about', label: '关于与更新', comp: AboutSettingsTab }
];

const activeTab = ref(props.initialTab);
const currentTabComponent = computed(() =>
  (tabs.find((t) => t.key === activeTab.value) || tabs[0]).comp
);

// Each open resets to the requested tab — supports deep-linking the update
// prompt on startup and keeps the last selection when reopened normally.
watch(() => props.show, (v) => {
  if (v) activeTab.value = props.initialTab;
});
</script>

<style scoped>
.settings-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(8px); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.settings-modal {
  background: var(--bg-primary); color: var(--text-primary);
  border-radius: var(--radius-card); width: 780px; max-width: 92vw; height: 70vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: var(--shadow-lg);
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; flex-shrink: 0; border-bottom: 1px solid var(--border-light);
}
.modal-header h2 { font-size: 16px; font-weight: 600; margin: 0; }
.close-btn {
  background: none; border: none; font-size: 22px; cursor: pointer;
  color: var(--text-muted); padding: 2px 6px; line-height: 1;
  border-radius: var(--radius-control); transition: background var(--transition-fast), color var(--transition-fast);
}
.close-btn:hover { color: var(--text-primary); background: var(--surface-hover); }

.modal-shell {
  flex: 1; min-height: 0; display: flex;
}
.settings-nav {
  width: 148px; flex-shrink: 0; padding: 10px 8px;
  border-right: 1px solid var(--border-light);
  display: flex; flex-direction: column; gap: 2px;
  background: var(--bg-secondary);
  overflow-y: auto;
}
.settings-nav-item {
  display: flex; align-items: center;
  width: 100%; padding: 9px 12px; border-radius: var(--radius-control);
  border: none; background: transparent; cursor: pointer;
  color: var(--text-secondary); font-size: 13px; text-align: left;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.settings-nav-item:hover { background: var(--surface-hover); color: var(--text-primary); }
.settings-nav-item.active {
  background: var(--surface-selected); color: var(--surface-selected-text);
  font-weight: 500;
}

.settings-content {
  flex: 1; min-width: 0; overflow-y: auto; padding: 16px 20px;
}

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
