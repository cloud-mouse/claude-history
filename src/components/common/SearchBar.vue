<template>
  <div class="search-bar">
    <input
      ref="inputRef"
      type="text"
      :value="query"
      placeholder="搜索..."
      @input="handleInput"
    />
    <button v-if="query" class="clear-btn" @click="clearSearch">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 6 6 18M6 6l12 12"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  query: String,
  default: ''
});

const emit = defineEmits(['search']);
const inputRef = ref(null);

function handleInput(event) {
  emit('search', event.target.value);
}

function clearSearch() {
  emit('search', '');
  inputRef.value?.focus();
}
</script>

<style scoped>
.search-bar {
  position: relative;
  display: flex;
  align-items: center;
}

input {
  width: 100%;
  padding: 8px 32px 8px 12px;
  font-size: var(--font-size-sm);
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

input::placeholder {
  color: var(--text-muted);
}

input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--surface-hover);
}

.clear-btn {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
}

.clear-btn:hover {
  color: var(--text-primary);
}
</style>
