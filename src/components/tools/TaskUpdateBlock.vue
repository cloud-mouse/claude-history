<template>
  <CollapsibleBlock ref="blockRef" name="TaskUpdate" :summary="subject" :status="statusLabel">
    <div v-if="subject" class="update-fields">
      <span class="task-subject">{{ subject }}</span>
    </div>
  </CollapsibleBlock>
</template>

<script setup>
import { ref, computed } from 'vue';
import CollapsibleBlock from '../common/CollapsibleBlock.vue';

const props = defineProps({
  block: { type: Object, required: true }
});

const blockRef = ref(null);

const input = computed(() => {
  if (typeof props.block.input === 'string') {
    try { return JSON.parse(props.block.input); } catch { return {}; }
  }
  return props.block.input || {};
});

const taskId = computed(() => input.value.taskId || '');
const status = computed(() => input.value.status || 'pending');
const subject = computed(() => input.value.subject || '');

const statusLabel = computed(() => {
  const map = {
    completed: '已完成',
    in_progress: '进行中',
    pending: '待办',
    deleted: '已删除'
  };
  return map[status.value] || status.value;
});

function expandAll() { blockRef.value?.expandAll(); }
function collapseAll() { blockRef.value?.collapseAll(); }

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.update-fields {
  padding: 4px 0;
}

.task-subject {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.5;
}
</style>
