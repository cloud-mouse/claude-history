import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref([]);
  const selectedProjectId = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const selectedProject = computed(() => {
    if (!projects.value || !Array.isArray(projects.value)) {
      return null;
    }
    return projects.value.find(p => p.id === selectedProjectId.value) || null;
  });

  async function loadProjects() {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.scanProjects();
      if (result.success) {
        projects.value = result.projects || [];
      } else {
        error.value = result.error || 'Unknown error';
        projects.value = [];
      }
    } catch (e) {
      error.value = e.message;
      projects.value = [];
    } finally {
      loading.value = false;
    }
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
    try {
      const result = await window.electronAPI.getConversations(projectId);
      if (result.success && result.conversations) {
        const proj = projects.value.find(p => p.id === projectId);
        if (proj) {
          proj.conversations = result.conversations;
        }
      }
    } catch {
      // Ignore — best-effort refresh
    }
  }

  return { projects, selectedProjectId, selectedProject, loading, error, loadProjects, selectProject, clearSelectedProject, refreshConversations };
});
