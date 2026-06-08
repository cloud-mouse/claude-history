import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useUpdaterStore = defineStore('updater', () => {
  // State
  const checking = ref(false);
  const updateAvailable = ref(false);
  const updateInfo = ref(null);    // { version, releaseNotes, releaseName }
  const downloading = ref(false);
  const downloadProgress = ref(0); // 0-100
  const downloaded = ref(false);
  const error = ref(null);

  // Check for updates
  async function checkForUpdates() {
    checking.value = true;
    error.value = null;
    try {
      await window.electronAPI.updaterCheck();
    } catch (err) {
      error.value = err.message;
      checking.value = false;
    }
    // checking state is reset by handleAvailable / handleNotAvailable events
  }

  // Download the available update
  async function downloadUpdate() {
    downloading.value = true;
    downloadProgress.value = 0;
    error.value = null;
    try {
      await window.electronAPI.updaterDownload();
    } catch (err) {
      error.value = err.message;
      downloading.value = false;
    }
    // downloading state is reset by handleDownloaded event
  }

  // Quit and install the downloaded update
  function installUpdate() {
    window.electronAPI.updaterInstall();
  }

  // Event handlers from main process
  function handleChecking() {
    checking.value = true;
  }

  function handleAvailable(info) {
    checking.value = false;
    updateAvailable.value = true;
    updateInfo.value = info;
  }

  function handleNotAvailable() {
    checking.value = false;
    updateAvailable.value = false;
  }

  function handleProgress(progress) {
    downloadProgress.value = progress.percent;
  }

  function handleDownloaded(info) {
    downloading.value = false;
    downloaded.value = true;
    if (info?.version) {
      updateInfo.value = { ...updateInfo.value, version: info.version };
    }
  }

  function handleError(err) {
    checking.value = false;
    downloading.value = false;
    error.value = err.message;
  }

  return {
    checking, updateAvailable, updateInfo,
    downloading, downloadProgress, downloaded, error,
    checkForUpdates, downloadUpdate, installUpdate,
    handleChecking, handleAvailable, handleNotAvailable,
    handleProgress, handleDownloaded, handleError
  };
});
