<template>
  <div id="app">
    <div class="app-container">
      <aside
        class="panel panel-left"
        :class="{ collapsed: leftCollapsed }"
        :style="{ width: leftCollapsed ? '0px' : leftPanelWidth + 'px' }"
      >
        <div class="app-header">
          <span class="app-title">Claude History</span>
        </div>
        <div class="left-list-wrap">
          <ProjectList
            :projects="projectsStore.projects"
            :selectedId="projectsStore.selectedProjectId"
            :loading="projectsStore.loading"
            :error="projectsStore.error"
            @select="handleProjectSelect"
            @refresh="handleRefresh"
            @delete="handleProjectDelete"
          />
        </div>
        <div class="app-toolbar">
          <button class="settings-btn" @click="showSearch = true" title="全文搜索 (Ctrl/Cmd+Shift+F)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
          <button class="settings-btn" @click="openSettings()" title="设置">
            <svg width="16" height="16" viewBox="0 0 1024 1024" fill="currentColor">
              <path d="M812.6976 195.976533L936.021333 409.6a204.8 204.8 0 0 1 0 204.8L812.714667 828.023467a204.8 204.8 0 0 1-177.373867 102.4H388.676267a204.8 204.8 0 0 1-177.373867-102.4L87.978667 614.4a204.8 204.8 0 0 1 0-204.8l123.323733-213.623467a204.8 204.8 0 0 1 177.373867-102.4h246.647466a204.8 204.8 0 0 1 177.373867 102.4z m-59.118933 34.133334a136.533333 136.533333 0 0 0-118.254934-68.266667H388.676267a136.533333 136.533333 0 0 0-118.254934 68.266667L147.114667 443.733333a136.533333 136.533333 0 0 0 0 136.533334l123.323733 213.623466a136.533333 136.533333 0 0 0 118.254933 68.266667h246.647467a136.533333 136.533333 0 0 0 118.254933-68.266667L876.885333 580.266667a136.533333 136.533333 0 0 0 0-136.533334l-123.323733-213.623466z"></path>
              <path d="M512 682.666667c94.2592 0 170.666667-76.407467 170.666667-170.666667s-76.407467-170.666667-170.666667-170.666667-170.666667 76.407467-170.666667 170.666667 76.407467 170.666667 170.666667 170.666667z m0-68.266667a102.4 102.4 0 1 1 0-204.8 102.4 102.4 0 0 1 0 204.8z"></path>
            </svg>
            <span v-if="feishuStore.connected || updateStore.hasUpdate" class="settings-badge">
              <span v-if="feishuStore.connected" class="badge-dot badge-connected"></span>
              <span v-if="updateStore.hasUpdate" class="badge-dot badge-update"></span>
            </span>
          </button>
        </div>
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

    <SettingsModal :show="showSettings" :initialTab="settingsInitialTab" @close="showSettings = false" />
    <SearchOverlay :show="showSearch" @close="showSearch = false" @select="handleSearchSelect" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useProjectsStore } from './stores/projects';
import { useConversationsStore } from './stores/conversations';
import { useThemeStore } from './stores/theme';
import ProjectList from './components/layout/ProjectList.vue';
import ConversationList from './components/layout/ConversationList.vue';
import MessageThread from './components/layout/MessageThread.vue';
import SettingsModal from './components/settings/SettingsModal.vue';
import SearchOverlay from './components/search/SearchOverlay.vue';
import { useFeishuStore } from './stores/feishu';
import { useUpdateStore } from './stores/update';
import { useStatsStore } from './stores/stats';

const projectsStore = useProjectsStore();
const conversationsStore = useConversationsStore();
const themeStore = useThemeStore();
const feishuStore = useFeishuStore();
const updateStore = useUpdateStore();
const statsStore = useStatsStore();

const showSettings = ref(false);
const showSearch = ref(false);
const settingsInitialTab = ref('feishu');

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

// Open the settings modal, optionally deep-linking to a specific tab.
function openSettings(tab = 'feishu') {
  settingsInitialTab.value = tab;
  showSettings.value = true;
}

// Open a conversation jumped to from full-text search, focusing the matched message.
function handleSearchSelect({ projectId, messageId, conv }) {
  showSearch.value = false;
  if (projectId != null) projectsStore.selectProject(projectId);
  conversationsStore.openConversation(conv, false, messageId);
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

const _unsubs = [];

onMounted(() => {
  themeStore.initTheme();
  projectsStore.loadProjects();
  feishuStore.detect();

  // Register event listeners for real-time updates (with cleanup)
  let _jsonlDebounce = null;
  let _reloadDebounce = null;
  _unsubs.push(
    window.electronAPI.onFeishuStatusChanged((data) => {
      feishuStore.handleStatusChanged(data);
    })
  );
  _unsubs.push(
    window.electronAPI.onFeishuJsonlChanged((data) => {
      // Debounce reload of active conversation
      if (conversationsStore.activeConversation?.filePath === data.jsonlPath) {
        clearTimeout(_reloadDebounce);
        _reloadDebounce = setTimeout(async () => {
          await conversationsStore.reloadByFilePath(data.jsonlPath);
          // Re-aggregate token stats incrementally after the JSONL changed.
          window.electronAPI.refreshIndex(data.jsonlPath);
        }, 500);
      }
      // Debounce conversation list refresh (Claude writes JSONL multiple times)
      clearTimeout(_jsonlDebounce);
      _jsonlDebounce = setTimeout(() => {
        const selectedProject = projectsStore.selectedProject;
        if (selectedProject) {
          projectsStore.refreshConversations(selectedProject.id);
        }
      }, 1000);
    })
  );

  // Stats reindex runs in the background; subscribe at the App level so the store
  // keeps tracking progress even while the settings/stats tab is closed.
  _unsubs.push(
    window.electronAPI.onStatsReindexProgress((p) => statsStore.handleReindexProgress(p))
  );

  // Startup update check: if a newer release exists, deep-link the settings modal
  // to the "关于与更新" tab. (Signing-independent — fetches the latest GitHub
  // release, opens browser to download.)
  updateStore.check().then(() => {
    if (updateStore.hasUpdate) openSettings('about');
  }).catch(() => {});

  // Global shortcut: Cmd/Ctrl+Shift+F opens full-text search.
  // (Cmd/Ctrl+K is already taken by the dev-tools menu item in index.js.)
  const onKeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      showSearch.value = true;
    }
  };
  window.addEventListener('keydown', onKeydown);
  _unsubs.push(() => window.removeEventListener('keydown', onKeydown));
});

onUnmounted(() => {
  for (const unsub of _unsubs) unsub();
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
  background: var(--bg-panel);
}

.panel-middle {
  flex-shrink: 0;
  background: var(--bg-panel);
}

.panel-right {
  flex: 1;
}

.app-header {
  display: flex;
  align-items: center;
  padding: 14px 16px 10px;
  flex-shrink: 0;
}

.app-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.2px;
}

.left-list-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
}

.app-toolbar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 10px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

.settings-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  color: var(--text-secondary);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.settings-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

/* Dual-signal badge: green = Feishu connected, red = update available. */
.settings-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1.5px solid var(--bg-panel);
}

.badge-connected { background: var(--success); }

.badge-update {
  background: var(--danger);
  animation: badge-pulse 2s infinite;
}

@keyframes badge-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
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
  border: none;
  border-radius: 0 var(--radius-control) var(--radius-control) 0;
  cursor: pointer;
  color: var(--text-muted);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.expand-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.resize-handle {
  width: 8px;
  background-color: transparent;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color var(--transition-fast);
}

.resize-handle:hover {
  background-color: var(--surface-hover);
}

.resize-handle:hover .handle-line {
  background-color: var(--text-muted);
  transform: scaleY(1.3);
}

.handle-line {
  width: 2px;
  height: 40px;
  background-color: var(--border-color);
  border-radius: var(--radius-full);
  transition: background-color var(--transition-fast), transform var(--transition-fast);
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
  border-radius: var(--radius-control);
  transition: background var(--transition-fast), color var(--transition-fast);
  margin-top: 4px;
}

.collapse-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}
</style>
