<template>
  <CollapsibleBlock
    name="文件"
    :summary="summaryText"
    :status="totalFiles > 0 ? String(totalFiles) : ''"
    :default-expanded="totalFiles < 3"
  >
    <template #icon>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    </template>
    <div class="file-list">
      <div v-if="createdFiles.length > 0" class="file-group">
        <div class="group-header">
          <span class="group-label created">新建</span>
          <span class="group-count">{{ createdFiles.length }}</span>
        </div>
        <div v-for="file in createdFiles" :key="file.path" class="file-item">
          <span class="action-badge created">+</span>
          <span class="file-path">{{ file.path }}</span>
        </div>
      </div>
      <div v-if="modifiedFiles.length > 0" class="file-group">
        <div class="group-header">
          <span class="group-label modified">修改</span>
          <span class="group-count">{{ modifiedFiles.length }}</span>
        </div>
        <div v-for="file in modifiedFiles" :key="file.path" class="file-item">
          <span class="action-badge modified">~</span>
          <span class="file-path">{{ file.path }}</span>
        </div>
      </div>
      <div v-if="deletedFiles.length > 0" class="file-group">
        <div class="group-header">
          <span class="group-label deleted">删除</span>
          <span class="group-count">{{ deletedFiles.length }}</span>
        </div>
        <div v-for="file in deletedFiles" :key="file.path" class="file-item">
          <span class="action-badge deleted">-</span>
          <span class="file-path">{{ file.path }}</span>
        </div>
      </div>
    </div>
  </CollapsibleBlock>
</template>

<script setup>
import { computed } from 'vue';
import CollapsibleBlock from '../common/CollapsibleBlock.vue';

const props = defineProps({
  blocks: { type: Object, required: true }
});

const fileSnapshots = computed(() => {
  // Extract file snapshots from message.files (set by message-parser)
  if (props.blocks.files) {
    return props.blocks.files;
  }
  // Fallback: try to parse from snapshot structure
  if (props.blocks.snapshot) {
    const snapshot = props.blocks.snapshot;
    return snapshot.files || [];
  }
  return [];
});

const totalFiles = computed(() => fileSnapshots.value.length);

const createdFiles = computed(() =>
  fileSnapshots.value.filter(f => f.action === 'created' || f.type === 'created' || f.status === 'created')
);

const modifiedFiles = computed(() =>
  fileSnapshots.value.filter(f => f.action === 'modified' || f.type === 'modified' || f.status === 'modified')
);

const deletedFiles = computed(() =>
  fileSnapshots.value.filter(f => f.action === 'deleted' || f.type === 'deleted' || f.status === 'deleted')
);

const summaryText = computed(() => {
  const created = createdFiles.value.length;
  const modified = modifiedFiles.value.length;
  const deleted = deletedFiles.value.length;
  const parts = [];
  if (created > 0) parts.push(`${created} 新建`);
  if (modified > 0) parts.push(`${modified} 修改`);
  if (deleted > 0) parts.push(`${deleted} 删除`);
  if (parts.length > 0) return parts.join(', ');
  return totalFiles.value > 0 ? `${totalFiles.value} 个文件` : '';
});
</script>

<style scoped>
.file-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.file-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.group-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: var(--radius-control);
}

.group-label.created { background-color: var(--success-bg); color: var(--success); }
.group-label.modified { background-color: var(--accent-bg); color: var(--accent); }
.group-label.deleted { background-color: var(--danger-bg); color: var(--danger); }

.group-count {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}

.action-badge {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
  font-weight: bold;
  font-size: 12px;
  flex-shrink: 0;
}

.action-badge.created { background-color: var(--success-bg); color: var(--success); }
.action-badge.modified { background-color: var(--accent-bg); color: var(--accent); }
.action-badge.deleted { background-color: var(--danger-bg); color: var(--danger); }

.file-path {
  color: var(--text-primary);
  word-break: break-all;
}
</style>
