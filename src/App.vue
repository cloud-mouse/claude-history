<template>
  <div id="app">
    <div class="app-container">
      <aside
        class="panel panel-left"
        :class="{ collapsed: leftCollapsed }"
        :style="{ width: leftCollapsed ? '0px' : leftPanelWidth + 'px' }"
      >
        <ProjectList
          :projects="projectsStore.projects"
          :selectedId="projectsStore.selectedProjectId"
          :loading="projectsStore.loading"
          :error="projectsStore.error"
          @select="handleProjectSelect"
          @refresh="handleRefresh"
          @delete="handleProjectDelete"
        />
      </aside>

      <div class="panel-divider">
        <button v-if="leftCollapsed" class="expand-btn" @click="leftCollapsed = false" title="展开项目列表">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 5l7 7-7 7"></path>
          </svg>
        </button>
        <template v-else>
          <div class="resize-handle" @mousedown="startResize('left', $event)">
            <div class="handle-line"></div>
          </div>
          <button class="collapse-btn" @click="leftCollapsed = true" title="收起项目列表">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M15 5l-7 7 7 7"></path>
            </svg>
          </button>
        </template>
      </div>

      <aside
        class="panel panel-middle"
        :class="{ collapsed: middleCollapsed }"
        :style="{ width: middleCollapsed ? '0px' : middlePanelWidth + 'px' }"
      >
        <div class="panel-header-actions">
          <ThemeSelector />
        </div>
        <ConversationList
          :conversations="currentConversations"
          :selectedId="conversationsStore.activeConversation?.filePath"
          @select="handleConversationSelect"
          @delete="handleConversationDelete"
        />
      </aside>

      <div class="panel-divider">
        <button v-if="middleCollapsed" class="expand-btn" @click="middleCollapsed = false" title="展开对话列表">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 5l7 7-7 7"></path>
          </svg>
        </button>
        <template v-else>
          <div class="resize-handle" @mousedown="startResize('right', $event)">
            <div class="handle-line"></div>
          </div>
          <button class="collapse-btn" @click="middleCollapsed = true" title="收起对话列表">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M15 5l-7 7 7 7"></path>
            </svg>
          </button>
        </template>
      </div>

      <main class="panel panel-right">
        <MessageThread
          :conversation="conversationsStore.activeConversation"
          :loading="conversationsStore.loading"
          :skippedCount="conversationsStore.skippedMessages"
        />
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useProjectsStore } from './stores/projects';
import { useConversationsStore } from './stores/conversations';
import { useThemeStore } from './stores/theme';
import ProjectList from './components/layout/ProjectList.vue';
import ConversationList from './components/layout/ConversationList.vue';
import MessageThread from './components/layout/MessageThread.vue';
import ThemeSelector from './components/common/ThemeSelector.vue';

const projectsStore = useProjectsStore();
const conversationsStore = useConversationsStore();
const themeStore = useThemeStore();

const leftPanelWidth = ref(240);
const middlePanelWidth = ref(300);
const rightPanelMinWidth = 400;
const leftCollapsed = ref(false);
const middleCollapsed = ref(false);

const currentConversations = computed(() => {
  return projectsStore.selectedProject?.conversations || [];
});

function handleProjectSelect(projectId) {
  projectsStore.selectProject(projectId);
  conversationsStore.clearActive();
}

function handleConversationSelect(conv) {
  conversationsStore.openConversation(conv);
}

async function handleRefresh() {
  projectsStore.clearSelectedProject();
  conversationsStore.clearActive();
  conversationsStore.clearCache();
  await window.electronAPI.clearCache();
  projectsStore.loadProjects();
}

function handleProjectDelete(projectId) {
  window.electronAPI.deleteProject(projectId).then(() => {
    const index = projectsStore.projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
      projectsStore.projects.splice(index, 1);
    }
    conversationsStore.clearActive();
  });
}

function handleConversationDelete(filePath) {
  window.electronAPI.deleteConversation(filePath).then(() => {
    const currentProject = projectsStore.selectedProject;
    if (currentProject && currentProject.conversations) {
      const index = currentProject.conversations.findIndex(c => c.filePath === filePath);
      if (index !== -1) {
        currentProject.conversations.splice(index, 1);
      }
    }
    conversationsStore.clearActive();
  });
}

const resizing = ref(null);
const resizeStartX = ref(0);
const resizeStartWidth = ref(0);

function startResize(panel, event) {
  resizing.value = panel;
  resizeStartX.value = event.clientX;
  resizeStartWidth.value = panel === 'left' ? leftPanelWidth.value : middlePanelWidth.value;
  document.addEventListener('mousemove', handleResize);
  document.addEventListener('mouseup', stopResize);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function handleResize(event) {
  if (!resizing.value) return;
  const delta = event.clientX - resizeStartX.value;

  if (resizing.value === 'left') {
    const newWidth = resizeStartWidth.value + delta;
    leftPanelWidth.value = Math.max(180, Math.min(360, newWidth));
  } else if (resizing.value === 'right') {
    const newWidth = resizeStartWidth.value + delta;
    middlePanelWidth.value = Math.max(240, Math.min(480, newWidth));
  }
}

function stopResize() {
  resizing.value = null;
  document.removeEventListener('mousemove', handleResize);
  document.removeEventListener('mouseup', stopResize);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

onMounted(() => {
  themeStore.initTheme();
  projectsStore.loadProjects();
});
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
}

.panel.collapsed {
  width: 0 !important;
  pointer-events: none;
}

.panel-left {
  flex-shrink: 0;
}

.panel-middle {
  flex-shrink: 0;
}

.panel-right {
  flex: 1;
}

.panel-header-actions {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-secondary);
}

.panel-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 48px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  cursor: pointer;
  color: var(--text-muted);
  transition: all var(--transition-fast);
}

.expand-btn:hover {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.resize-handle {
  width: 8px;
  background-color: var(--border-light);
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color var(--transition-fast);
}

.resize-handle:hover {
  background-color: var(--bg-tertiary);
}

.resize-handle:hover .handle-line {
  background-color: var(--primary);
  transform: scaleY(1.3);
}

.handle-line {
  width: 2px;
  height: 40px;
  background-color: var(--border-color);
  border-radius: var(--radius-full);
  transition: all var(--transition-fast);
}

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 32px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  margin-top: 4px;
}

.collapse-btn:hover {
  background: var(--bg-tertiary);
  color: var(--primary);
}
</style>
