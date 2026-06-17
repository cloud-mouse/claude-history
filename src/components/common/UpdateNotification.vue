<template>
  <div class="update-wrapper">
    <button
      class="update-btn"
      :class="{ 'has-update': updateStore.hasUpdate }"
      @click="$emit('open')"
      :title="updateStore.hasUpdate ? '有新版本可用' : '检查更新 / 关于版本'"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spin: updateStore.checking }">
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
        <path d="M21 3v5h-5"></path>
      </svg>
      <span v-if="updateStore.hasUpdate" class="update-dot"></span>
    </button>
  </div>
</template>

<script setup>
import { useUpdateStore } from '../../stores/update';

defineEmits(['open']);

const updateStore = useUpdateStore();
</script>

<style scoped>
.update-wrapper {
  position: relative;
}

.update-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  color: var(--text-secondary);
  transition: background var(--transition-fast), color var(--transition-fast);
  position: relative;
}

.update-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.update-btn.has-update {
  color: var(--accent);
}

.update-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  background: var(--success);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}
</style>
