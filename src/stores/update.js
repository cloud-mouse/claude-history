import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Signing-independent update state.
 * Checks the latest GitHub release via the main process and, on download,
 * opens the OS browser (works on all platforms, including unsigned mac).
 */
export const useUpdateStore = defineStore('update', () => {
  const hasUpdate = ref(false);
  const checking = ref(false);
  const latest = ref(null); // { version, name, notes, publishedAt, htmlUrl, asset }
  const current = ref('');
  const error = ref(null);

  async function check() {
    checking.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.updateCheckLatest();
      if (result.success) {
        hasUpdate.value = !!result.hasUpdate;
        latest.value = result.latest || null;
        current.value = result.current || '';
      } else {
        error.value = result.error;
      }
    } catch (e) {
      error.value = e.message;
    } finally {
      checking.value = false;
    }
  }

  async function downloadLatest() {
    const url = latest.value?.asset?.url || latest.value?.htmlUrl;
    if (url) await window.electronAPI.openExternalUrl(url);
  }

  return { hasUpdate, checking, latest, current, error, check, downloadLatest };
});
