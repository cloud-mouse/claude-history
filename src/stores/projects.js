import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref([]);
  const selectedProjectId = ref(null);
  const activeSource = ref('claude');
  const loading = ref(false);
  const error = ref(null);
  let loadRequestId = 0;

  const selectedProject = computed(() => {
    if (!projects.value || !Array.isArray(projects.value)) {
      return null;
    }
    return projects.value.find(p => p.id === selectedProjectId.value) || null;
  });

  async function loadProjects(source = activeSource.value) {
    const requestId = ++loadRequestId;
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.scanProjects(source);
      if (requestId !== loadRequestId || source !== activeSource.value) return;
      if (result.success) {
        projects.value = result.projects || [];
      } else {
        error.value = result.error || 'Unknown error';
        projects.value = [];
      }
    } catch (e) {
      if (requestId !== loadRequestId || source !== activeSource.value) return;
      error.value = e.message;
      projects.value = [];
    } finally {
      if (requestId === loadRequestId) loading.value = false;
    }
  }

  async function switchSource(source) {
    if (source !== 'claude' && source !== 'codex') return;
    if (source === activeSource.value && projects.value.length > 0) return;
    loadRequestId += 1;
    activeSource.value = source;
    projects.value = [];
    selectedProjectId.value = null;
    error.value = null;
    await loadProjects(source);
  }

  function selectProject(id) {
    selectedProjectId.value = id;
  }

  function clearSelectedProject() {
    selectedProjectId.value = null;
  }

  /**
   * Refresh the conversation list for a given project.
   * Used when Feishu updates a JSONL file externally.
   */
  async function refreshConversations(projectId) {
    if (activeSource.value !== 'claude') return;
    try {
      const result = await window.electronAPI.getConversations(projectId);
      if (result.success && result.conversations && result.conversations.length > 0) {
        const proj = projects.value.find(p => p.id === projectId);
        if (proj) {
          proj.conversations = result.conversations;
        }
      }
    } catch {
      // Ignore — best-effort refresh
    }
  }

  return {
    projects,
    selectedProjectId,
    selectedProject,
    activeSource,
    loading,
    error,
    loadProjects,
    switchSource,
    selectProject,
    clearSelectedProject,
    refreshConversations
  };
});
