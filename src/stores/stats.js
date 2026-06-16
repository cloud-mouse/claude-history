import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useStatsStore = defineStore('stats', () => {
  const data = ref(null); // { totals, byProject, byDay, byModel }
  const loading = ref(false);
  const error = ref(null);

  const reindexing = ref(false);
  const reindexProgress = ref(null); // { scanned, total, updated, done?, cancelled? }

  async function loadOverview() {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.statsGetOverview();
      if (result.success) data.value = result.data;
      else error.value = result.error || '加载失败';
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function reindexAll() {
    if (reindexing.value) return;
    reindexing.value = true;
    reindexProgress.value = { scanned: 0, total: 0, updated: 0 };
    error.value = null;
    try {
      const result = await window.electronAPI.statsReindexAll();
      if (!result.success) {
        reindexing.value = false;
        error.value = result.error;
      }
      // On success, `reindexing` is cleared by handleReindexProgress (done event).
    } catch (e) {
      reindexing.value = false;
      error.value = e.message;
    }
  }

  function cancelReindex() {
    window.electronAPI.statsReindexCancel();
  }

  function handleReindexProgress(p) {
    reindexProgress.value = p;
    if (p && p.done) {
      reindexing.value = false;
      loadOverview(); // refresh the dashboard with the newly indexed data
    }
  }

  function clear() { data.value = null; }

  return { data, loading, error, reindexing, reindexProgress, loadOverview, reindexAll, cancelReindex, handleReindexProgress, clear };
});
