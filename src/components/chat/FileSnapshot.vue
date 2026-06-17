<template>
  <div class="file-snapshot">
    <button class="toggle-btn" @click="expanded = !expanded">
      <span class="toggle-icon">{{ expanded ? '▼' : '▼' }}</span>
      <span class="summary">{{ summaryText }}</span>
    </button>
    <div v-if="expanded" class="file-list">
      <div v-if="createdFiles.length > 0" class="file-group">
        <div class="group-header">
          <span class="group-label created">Created</span>
          <span class="group-count">{{ createdFiles.length }}</span>
        </div>
        <div v-for="file in createdFiles" :key="file.path" class="file-item">
          <span class="action-badge created">+</span>
          <span class="file-path">{{ file.path }}</span>
        </div>
      </div>
      <div v-if="modifiedFiles.length > 0" class="file-group">
        <div class="group-header">
          <span class="group-label modified">Modified</span>
          <span class="group-count">{{ modifiedFiles.length }}</span>
        </div>
        <div v-for="file in modifiedFiles" :key="file.path" class="file-item">
          <span class="action-badge modified">~</span>
          <span class="file-path">{{ file.path }}</span>
        </div>
      </div>
      <div v-if="deletedFiles.length > 0" class="file-group">
        <div class="group-header">
          <span class="group-label deleted">Deleted</span>
          <span class="group-count">{{ deletedFiles.length }}</span>
        </div>
        <div v-for="file in deletedFiles" :key="file.path" class="file-item">
          <span class="action-badge deleted">-</span>
          <span class="file-path">{{ file.path }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  blocks: {
    type: Object,
    required: true
  }
});

const expanded = ref(false);

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
  // Show expanded if less than 3 files
  if (totalFiles.value < 3) {
    expanded.value = true;
    return `Files: ${totalFiles.value}`;
  }
  const created = createdFiles.value.length;
  const modified = modifiedFiles.value.length;
  const deleted = deletedFiles.value.length;
  const parts = [];
  if (created > 0) parts.push(`${created} created`);
  if (modified > 0) parts.push(`${modified} modified`);
  if (deleted > 0) parts.push(`${deleted} deleted`);
  return `Files: ${parts.join(', ')}`;
});
</script>

<style scoped>
.file-snapshot {
  margin-top: 8px;
  border-radius: var(--radius-card);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.toggle-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  text-align: left;
  transition: background var(--transition-fast);
}

.toggle-btn:hover {
  background-color: var(--surface-hover);
}

.toggle-icon {
  font-size: 10px;
  color: var(--text-muted);
}

.summary {
  color: var(--text-secondary);
}

.file-list {
  padding: 12px;
  background-color: var(--bg-primary);
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

.group-label.created {
  background-color: var(--success-bg);
  color: var(--success);
}

.group-label.modified {
  background-color: var(--accent-bg);
  color: var(--accent);
}

.group-label.deleted {
  background-color: var(--danger-bg);
  color: var(--danger);
}

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
}

.action-badge.created {
  background-color: var(--success-bg);
  color: var(--success);
}

.action-badge.modified {
  background-color: var(--accent-bg);
  color: var(--accent);
}

.action-badge.deleted {
  background-color: var(--danger-bg);
  color: var(--danger);
}

.file-path {
  color: var(--text-primary);
  word-break: break-all;
}
</style>
