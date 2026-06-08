<template>
  <div class="update-wrapper">
    <!-- Update badge button in toolbar -->
    <button
      v-if="updaterStore.updateAvailable && !showModal"
      class="update-btn"
      :class="{ 'has-update': updaterStore.updateAvailable }"
      @click="showModal = true"
      title="有新版本可用"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
        <path d="M21 3v5h-5"></path>
      </svg>
      <span class="update-dot"></span>
    </button>

    <!-- Checking indicator -->
    <div v-if="updaterStore.checking && !updaterStore.updateAvailable" class="update-btn checking" title="正在检查更新...">
      <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
        <path d="M21 3v5h-5"></path>
      </svg>
    </div>

    <!-- Update modal dialog -->
    <Teleport to="body">
      <transition name="dialog">
        <div v-if="showModal" class="update-overlay" @click.self="showModal = false">
          <div class="update-dialog" role="dialog" aria-modal="true">
            <div class="update-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
              </svg>
            </div>

            <h3 class="update-title">发现新版本</h3>

            <div class="update-version-info">
              <span class="version-label">v{{ updaterStore.updateInfo?.version }}</span>
              <span class="version-current">当前版本 v{{ currentVersion }}</span>
            </div>

            <!-- Release notes -->
            <div v-if="releaseNotes" class="update-notes">
              {{ releaseNotes }}
            </div>

            <!-- Download progress -->
            <div v-if="updaterStore.downloading" class="progress-section">
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: updaterStore.downloadProgress + '%' }"></div>
              </div>
              <span class="progress-text">{{ updaterStore.downloadProgress }}%</span>
            </div>

            <!-- Error message -->
            <div v-if="updaterStore.error" class="update-error">
              {{ updaterStore.error }}
            </div>

            <!-- Actions -->
            <div class="update-actions">
              <button class="btn btn-cancel" @click="showModal = false">
                {{ updaterStore.downloaded ? '稍后' : '取消' }}
              </button>
              <button
                v-if="!updaterStore.downloading && !updaterStore.downloaded"
                class="btn btn-primary"
                @click="handleDownload"
              >
                下载更新
              </button>
              <button
                v-if="updaterStore.downloading"
                class="btn btn-primary"
                disabled
              >
                下载中...
              </button>
              <button
                v-if="updaterStore.downloaded"
                class="btn btn-primary"
                :disabled="installing"
                @click="handleInstall"
              >
                {{ installing ? '正在重启...' : '重启并安装' }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
/* global __APP_VERSION__ */
import { ref, computed } from 'vue';
import { useUpdaterStore } from '../../stores/updater';

const updaterStore = useUpdaterStore();
const showModal = ref(false);
const installing = ref(false);

const currentVersion = computed(() => {
  // Version is baked into the app at build time via vite.config.js define
  return __APP_VERSION__ || 'unknown';
});

const releaseNotes = computed(() => {
  const notes = updaterStore.updateInfo?.releaseNotes;
  if (!notes) return '';
  // releaseNotes can be a string or an array of objects
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) return notes.map(n => n.note || '').join('\n');
  return '';
});

function handleDownload() {
  updaterStore.downloadUpdate();
}

function handleInstall() {
  installing.value = true;
  updaterStore.installUpdate();
}
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
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
  position: relative;
}

.update-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--primary);
}

.update-btn.has-update {
  color: var(--primary);
  border-color: var(--primary);
}

.update-btn.checking {
  cursor: default;
  color: var(--text-muted);
}

.update-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  background: var(--color-success);
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

/* Modal overlay */
.update-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.update-dialog {
  background: var(--bg-secondary);
  border-radius: var(--radius-xl);
  padding: 32px;
  max-width: 420px;
  width: 90%;
  box-shadow: var(--shadow-lg);
  text-align: center;
  border: 1px solid var(--border-color);
}

.update-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  margin: 0 auto 20px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.15));
  color: var(--primary);
}

.update-title {
  font-family: var(--font-display);
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.update-version-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}

.version-label {
  display: inline-block;
  padding: 3px 10px;
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  color: white;
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: 500;
}

.version-current {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.update-notes {
  text-align: left;
  padding: 12px 16px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
  max-height: 160px;
  overflow-y: auto;
  margin-bottom: 16px;
  white-space: pre-line;
}

.progress-section {
  margin-bottom: 20px;
}

.progress-bar {
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: 6px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary), var(--primary-hover));
  border-radius: var(--radius-full);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.update-error {
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-error);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  margin-bottom: 16px;
}

.update-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  padding: 10px 28px;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-cancel:hover {
  background-color: var(--border-color);
}

.btn-primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

/* Dialog animation */
.dialog-enter-active,
.dialog-leave-active {
  transition: all 0.25s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .update-dialog,
.dialog-leave-to .update-dialog {
  transform: scale(0.95) translateY(10px);
}
</style>
