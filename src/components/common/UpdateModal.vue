<template>
  <Teleport to="body">
    <transition name="um-dialog">
      <div v-if="show" class="um-overlay" @click.self="$emit('close')">
        <div class="um-dialog">
          <button class="um-close" @click="$emit('close')" title="关闭">&times;</button>

          <div class="um-header">
            <h2 class="um-title">有新版本可用</h2>
            <p class="um-version" v-if="updateStore.latest">
              Claude History <strong>v{{ updateStore.latest.version }}</strong>
              <span class="um-date" v-if="updateStore.latest.publishedAt">{{ formatDate(updateStore.latest.publishedAt) }}</span>
            </p>
          </div>

          <div class="um-body">
            <div class="um-notes-wrap">
              <h3 class="um-notes-title" v-if="updateStore.latest">Claude History v{{ updateStore.latest.version }}</h3>
              <div class="um-notes">{{ updateStore.latest?.notes || '暂无更新说明' }}</div>
            </div>

            <div class="um-compare">
              Current: v{{ updateStore.current }} → Latest: v{{ updateStore.latest?.version }}
            </div>
            <div class="um-recommend" v-if="updateStore.latest?.asset">
              推荐下载：{{ updateStore.latest.asset.name }}
            </div>
          </div>

          <div class="um-footer">
            <button class="um-btn um-btn-secondary" @click="$emit('close')">稍后</button>
            <button class="um-btn um-btn-primary" @click="handleDownload">下载推荐版本</button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { useUpdateStore } from '../../stores/update';

defineProps({ show: Boolean });
defineEmits(['close']);

const updateStore = useUpdateStore();

async function handleDownload() {
  await updateStore.downloadLatest();
}

function formatDate(d) {
  try { return new Date(d).toLocaleDateString('zh-CN'); } catch { return ''; }
}
</script>

<style scoped>
.um-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.um-dialog {
  position: relative;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 12px;
  width: 560px;
  max-width: 92vw;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.um-close {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
  z-index: 2;
}

.um-close:hover {
  color: var(--text-primary);
}

.um-header {
  padding: 24px 28px 12px;
}

.um-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 6px;
}

.um-version {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
}

.um-version strong {
  color: var(--primary);
}

.um-date {
  margin-left: 10px;
  color: var(--text-muted);
}

.um-body {
  padding: 0 28px 16px;
  overflow-y: auto;
  flex: 1;
}

.um-notes-wrap {
  background: var(--bg-tertiary);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.um-notes-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
}

.um-notes {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-line;
  max-height: 260px;
  overflow-y: auto;
}

.um-compare {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.um-recommend {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 14px;
}

.um-footer {
  padding: 14px 28px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-color);
}

.um-btn {
  padding: 9px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.um-btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.um-btn-secondary:hover {
  background: var(--border-color);
}

.um-btn-primary {
  background: var(--primary);
  color: white;
}

.um-btn-primary:hover {
  background: var(--primary-hover);
}

.um-dialog-enter-active,
.um-dialog-leave-active {
  transition: opacity 0.2s ease;
}

.um-dialog-enter-from,
.um-dialog-leave-to {
  opacity: 0;
}
</style>
