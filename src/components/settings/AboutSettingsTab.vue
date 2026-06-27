<template>
  <div class="about-tab">
    <!-- Current version -->
    <div class="setting-card">
      <h3 class="card-title">版本</h3>
      <p class="version-line">Claude History <code>v{{ updateStore.current || '—' }}</code></p>
      <button class="btn btn-secondary" @click="checkForUpdates" :disabled="updateStore.checking">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ spin: updateStore.checking }">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
          <path d="M21 3v5h-5"></path>
        </svg>
        {{ updateStore.checking ? '检查中…' : '检查更新' }}
      </button>
    </div>

    <!-- Latest release -->
    <div v-if="updateStore.latest" class="setting-card">
      <h3 class="card-title">最新版本 v{{ updateStore.latest.version }}</h3>
      <p class="update-date" v-if="updateStore.latest.publishedAt">发布于 {{ formatDate(updateStore.latest.publishedAt) }}</p>
      <div class="update-notes">{{ updateStore.latest.notes || '暂无更新说明' }}</div>
      <div class="update-compare">v{{ updateStore.current }} → v{{ updateStore.latest.version }}</div>
      <button class="btn btn-primary" @click="updateStore.downloadLatest()">
        {{ updateStore.hasUpdate ? '下载最新版本' : '打开下载页' }}
      </button>
    </div>

    <div v-if="updateStore.error" class="error-section">{{ updateStore.error }}</div>
  </div>
</template>

<script setup>
import { onActivated } from 'vue';
import { useUpdateStore } from '../../stores/update';

const updateStore = useUpdateStore();

// Re-check when revisiting the tab so release info is fresh.
onActivated(() => {
  if (!updateStore.checking) updateStore.check();
});

async function checkForUpdates() {
  await updateStore.check();
}

function formatDate(d) {
  try { return new Date(d).toLocaleDateString('zh-CN'); } catch { return ''; }
}
</script>

<style scoped>
.about-tab { display: flex; flex-direction: column; }

.setting-card {
  background: var(--bg-secondary); border-radius: var(--radius-card);
  padding: 16px; margin-bottom: 12px;
}
.card-title {
  font-size: 12px; font-weight: 600; color: var(--text-muted);
  margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.6px;
}

.version-line { font-size: 14px; color: var(--text-primary); margin: 0 0 12px; }
.version-line code {
  background: var(--bg-tertiary); padding: 2px 6px; border-radius: var(--radius-control);
  font-size: 13px; font-family: var(--font-mono, monospace);
}

.update-date { font-size: 12px; color: var(--text-muted); margin: 0 0 8px; }
.update-notes {
  font-size: 13px; color: var(--text-secondary); line-height: 1.7;
  white-space: pre-line; max-height: 260px; overflow-y: auto;
  background: var(--bg-tertiary); border-radius: var(--radius-card);
  padding: 12px 14px; margin-bottom: 12px;
}
.update-compare { font-size: 13px; color: var(--text-primary); margin-bottom: 12px; }

.error-section {
  padding: 10px 14px; border-radius: var(--radius-control); background: var(--danger-bg);
  color: var(--danger); font-size: 13px; margin-bottom: 12px;
}

.btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: var(--radius-control); border: none; cursor: pointer;
  font-size: 13px; transition: background var(--transition-fast), opacity var(--transition-fast);
}
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-hover); }
.btn-secondary {
  background: var(--bg-tertiary); color: var(--text-primary);
  border: 1px solid var(--border-color);
}
.btn-secondary:hover { background: var(--surface-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
