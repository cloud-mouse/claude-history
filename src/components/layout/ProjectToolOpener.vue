<template>
  <div class="tool-opener" ref="rootRef">
    <!-- Split button: main action (open with current tool / invite pick) + caret (toggle list) -->
    <div class="tool-split">
      <button
        class="tool-main"
        :class="{ 'has-tool': !!selectedTool }"
        :disabled="!projectDir"
        :title="mainTitle"
        @click="onMainClick"
      >
        <span v-if="selectedTool" class="tool-icon">
          <img v-if="selectedTool.iconType === 'img'" :src="selectedTool.icon" class="tool-icon-img" alt="" />
          <span v-else class="tool-icon-svg" v-html="selectedTool.icon"></span>
        </span>
        <svg v-else class="open-glyph" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 4h6v6"></path>
          <path d="M20 4l-9 9"></path>
          <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>
        </svg>
      </button>
      <button
        class="tool-caret"
        :class="{ open: open }"
        :disabled="!projectDir"
        @click="toggle"
        title="选择打开方式"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    </div>

    <transition name="dropdown">
      <div v-if="open" class="tool-dropdown">
        <div class="dropdown-header">用工具打开项目</div>
        <button
          v-for="t in TOOLS"
          :key="t.id"
          class="dropdown-item"
          :class="{ selected: selectedTool?.id === t.id }"
          @click="selectTool(t)"
        >
          <span class="tool-icon">
            <img v-if="t.iconType === 'img'" :src="t.icon" class="tool-icon-img" alt="" />
            <span v-else class="tool-icon-svg" v-html="t.icon"></span>
          </span>
          <span class="tool-name">{{ t.name }}</span>
          <svg v-if="selectedTool?.id === t.id" class="check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
        <div class="dropdown-path" :title="projectDir || ''">{{ projectDir || '无法定位项目目录' }}</div>
      </div>
    </transition>

    <transition name="fade">
      <span v-if="error" class="tool-error">{{ error }}</span>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import cursorIcon from '../../assets/icons/cursor.svg';
import vscodeIcon from '../../assets/icons/vscode.svg';
import intellijIcon from '../../assets/icons/intellij.svg';

const STORAGE_KEY = 'project-opener:last-tool';

// Terminal has no brand asset; keep its hand-drawn glyph as an inline SVG string.
const TERMINAL_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16"><rect width="24" height="24" rx="5" fill="#3A3A3A"/><path d="M7 9l3 3-3 3M13 15h4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Fixed tool roster — not configurable (per stage-1 scope).
// Brand tools load their official logo via <img>; terminal keeps the inline glyph.
const TOOLS = [
  { id: 'cursor', name: 'Cursor', iconType: 'img', icon: cursorIcon },
  { id: 'vscode', name: 'VS Code', iconType: 'img', icon: vscodeIcon },
  { id: 'idea', name: 'IntelliJ IDEA', iconType: 'img', icon: intellijIcon },
  { id: 'terminal', name: '终端', iconType: 'svg', icon: TERMINAL_ICON_SVG },
];

const props = defineProps({
  projectDir: { type: String, default: null },
});

const rootRef = ref(null);
const open = ref(false);
const error = ref(null);
const selectedTool = ref(null); // full tool object, hydrated from localStorage
let errorTimer = null;

onMounted(() => {
  const savedId = localStorage.getItem(STORAGE_KEY);
  if (savedId) {
    selectedTool.value = TOOLS.find(t => t.id === savedId) || null;
  }
  document.addEventListener('mousedown', onDocClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick);
  if (errorTimer) clearTimeout(errorTimer);
});

function onDocClick(e) {
  if (rootRef.value && !rootRef.value.contains(e.target)) {
    open.value = false;
  }
}

function toggle() {
  open.value = !open.value;
}

const mainTitle = computed(() => {
  if (!props.projectDir) return '无法定位当前项目目录';
  if (selectedTool.value) return `用 ${selectedTool.value.name} 打开项目`;
  return '选择一个工具打开项目';
});

// Two-stage interaction (per spec): pick a tool from the list first, then click
// the trigger icon to actually open — prevents accidental launches.
function onMainClick() {
  if (!props.projectDir) return;
  if (selectedTool.value) {
    openProject();
  } else {
    open.value = true; // no tool chosen yet — invite the user to pick one
  }
}

function selectTool(tool) {
  selectedTool.value = tool;
  localStorage.setItem(STORAGE_KEY, tool.id);
  open.value = false; // collapse; user clicks the trigger icon again to open
}

async function openProject() {
  if (!selectedTool.value || !props.projectDir) return;
  try {
    const res = await window.electronAPI.openProjectWith(selectedTool.value.id, props.projectDir);
    if (!res?.success) showError(res?.error || '打开失败');
  } catch (e) {
    showError(e.message || '打开失败');
  }
}

function showError(msg) {
  error.value = msg;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { error.value = null; }, 3000);
}
</script>

<style scoped>
.tool-opener {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.tool-split {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-control);
  overflow: hidden;
  background: transparent;
}

.tool-main,
.tool-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  font-family: inherit;
}

.tool-main {
  padding: 5px 8px;
  gap: 6px;
}

.tool-caret {
  padding: 5px 6px;
  border-left: 1px solid var(--border-color);
}

.tool-main:hover:not(:disabled),
.tool-caret:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.tool-main.has-tool {
  color: var(--text-primary);
}

.tool-main:disabled,
.tool-caret:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tool-caret.open svg {
  transform: rotate(180deg);
}

.tool-caret svg {
  transition: transform var(--transition-fast);
}

.tool-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.tool-icon :deep(svg) {
  display: block;
}

.tool-icon-img {
  width: 16px;
  height: 16px;
  display: block;
  object-fit: contain;
}

.open-glyph {
  flex-shrink: 0;
}

/* Dropdown */
.tool-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 220px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-lg);
  padding: 4px;
  z-index: 50;
}

.dropdown-header {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 6px 8px 4px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.dropdown-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.dropdown-item.selected {
  background: var(--surface-selected);
  color: var(--surface-selected-text);
}

.dropdown-item .check {
  margin-left: auto;
  color: var(--primary);
}

.dropdown-item.selected .check {
  color: var(--surface-selected-text);
}

.tool-name {
  flex-shrink: 0;
}

.dropdown-path {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  padding: 6px 8px 4px;
  margin-top: 2px;
  border-top: 1px solid var(--border-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl;
  text-align: left;
}

.tool-error {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  font-size: var(--font-size-xs);
  color: var(--danger);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-control);
  padding: 4px 8px;
  box-shadow: var(--shadow-md);
  white-space: nowrap;
  z-index: 50;
}

/* Transitions */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
