<template>
  <div class="todo-write-block">
    <div class="todo-header">
      <span class="todo-icon">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"></path>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
      </span>
      <span class="todo-label">TodoWrite</span>
      <span class="todo-stats">
        <span v-if="completedCount > 0" class="stat completed-stat">{{ completedCount }} 完成</span>
        <span v-if="inProgressCount > 0" class="stat progress-stat">{{ inProgressCount }} 进行中</span>
        <span v-if="pendingCount > 0" class="stat pending-stat">{{ pendingCount }} 待办</span>
      </span>
    </div>
    <div class="todo-content">
      <div
        v-for="(todo, index) in todos"
        :key="index"
        :class="['todo-item', todo.status]"
      >
        <span class="todo-status-icon">
          <svg v-if="todo.status === 'completed'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M20 6L9 17l-5-5"></path>
          </svg>
          <svg v-else-if="todo.status === 'in_progress'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
        </span>
        <div class="todo-text">
          <span :class="['todo-subject', { completed: todo.status === 'completed' }]">{{ todo.content }}</span>
          <span v-if="todo.activeForm && todo.activeForm !== todo.content" class="todo-active-form">{{ todo.activeForm }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  block: {
    type: Object,
    required: true
  }
});

const input = computed(() => {
  if (typeof props.block.input === 'string') {
    try {
      return JSON.parse(props.block.input);
    } catch {
      return {};
    }
  }
  return props.block.input || {};
});

const todos = computed(() => {
  const rawTodos = input.value.todos;
  if (!Array.isArray(rawTodos)) return [];
  return rawTodos.map(todo => ({
    content: todo.content || '',
    status: todo.status || 'pending',
    activeForm: todo.activeForm || ''
  }));
});

const completedCount = computed(() => todos.value.filter(t => t.status === 'completed').length);
const inProgressCount = computed(() => todos.value.filter(t => t.status === 'in_progress').length);
const pendingCount = computed(() => todos.value.filter(t => t.status === 'pending').length);

function expandAll() {}
function collapseAll() {}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.todo-write-block {
  margin-top: 8px;
  border-radius: var(--radius-md);
  overflow: hidden;
  background-color: var(--bg-secondary);
}

.todo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--bg-tertiary);
}

.todo-icon {
  display: flex;
  align-items: center;
  color: var(--accent);
}

.todo-label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.todo-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.stat {
  font-size: var(--font-size-xs);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.stat.completed-stat {
  color: var(--success);
  background: var(--success-bg);
}

.stat.progress-stat {
  color: var(--accent);
  background: var(--accent-bg);
}

.stat.pending-stat {
  color: var(--text-muted);
  background: var(--bg-primary);
}

.todo-content {
  padding: 8px 12px;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 4px;
  border-radius: var(--radius-sm);
}

.todo-item + .todo-item {
  border-top: 1px solid var(--border-color);
}

.todo-status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.todo-item.completed .todo-status-icon {
  color: var(--success);
}

.todo-item.in_progress .todo-status-icon {
  color: var(--accent);
}

.todo-item.pending .todo-status-icon {
  color: var(--text-muted);
}

.todo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.todo-subject {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.5;
}

.todo-subject.completed {
  text-decoration: line-through;
  color: var(--text-muted);
}

.todo-active-form {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-style: italic;
}
</style>
