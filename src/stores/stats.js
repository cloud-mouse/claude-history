import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useStatsStore = defineStore('stats', () => {
  const data = ref(null); // { totals, byProject, byDay, byModel }
  const loading = ref(false);
  const error = ref(null);

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

  function clear() { data.value = null; }

  return { data, loading, error, loadOverview, clear };
});
