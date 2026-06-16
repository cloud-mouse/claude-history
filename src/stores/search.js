import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSearchStore = defineStore('search', () => {
  const query = ref('');
  const results = ref([]);
  const loading = ref(false);
  const error = ref(null);

  let _timer = null;

  function searchDebounced(q, projectId, delay = 300) {
    query.value = q;
    clearTimeout(_timer);
    const trimmed = (q || '').trim();
    if (!trimmed) { results.value = []; loading.value = false; return; }
    _timer = setTimeout(() => runSearch(trimmed, projectId), delay);
  }

  async function runSearch(q, projectId) {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.searchFulltext(q, projectId);
      if (result.success) results.value = result.results || [];
      else error.value = result.error;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  function clear() {
    query.value = '';
    results.value = [];
    error.value = null;
    loading.value = false;
    clearTimeout(_timer);
  }

  return { query, results, loading, error, searchDebounced, runSearch, clear };
});
