import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useFeishuStore = defineStore('feishu', () => {
  // State
  const connected = ref(false);
  const config = ref({ appId: '', hasSecret: false, enabled: false });
  const binding = ref(null);   // { chatId, jsonlPath, sessionId }
  const processing = ref(false);
  const loading = ref(false);
  const error = ref(null);

  // Check if a conversation is bound
  function isBound(jsonlPath) {
    return binding.value?.jsonlPath === jsonlPath;
  }

  // Detect: load config from main process
  async function detect() {
    loading.value = true;
    error.value = null;
    try {
      const status = await window.electronAPI.feishuGetStatus();
      if (status.success) {
        connected.value = status.connected;
        if (status.binding) {
          binding.value = status.binding;
        }
      }
      const cfg = await window.electronAPI.feishuGetConfig();
      if (cfg.success) {
        config.value = {
          appId: cfg.appId,
          hasSecret: cfg.hasSecret,
          enabled: cfg.enabled
        };
      }
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  async function saveConfig(appId, appSecret) {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuSaveConfig({ appId, appSecret });
      if (result.success) {
        config.value.appId = appId;
        config.value.hasSecret = true;
        config.value.enabled = true;
      }
      return result;
    } catch (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    } finally {
      loading.value = false;
    }
  }

  async function start() {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuStart();
      if (result.success) {
        connected.value = true;
      } else {
        error.value = result.error;
      }
      return result;
    } catch (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    } finally {
      loading.value = false;
    }
  }

  async function stop() {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuStop();
      if (result.success) {
        connected.value = false;
      }
      return result;
    } catch (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    } finally {
      loading.value = false;
    }
  }

  async function bindSession(jsonlPath) {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuBindSession({ jsonlPath });
      if (result.success) {
        binding.value = {
          chatId: '_pending',
          jsonlPath: result.jsonlPath,
          sessionId: result.sessionId
        };
      } else {
        error.value = result.error;
      }
      return result;
    } catch (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    } finally {
      loading.value = false;
    }
  }

  async function unbind() {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuUnbindSession();
      if (result.success) {
        binding.value = null;
      }
      return result;
    } catch (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    } finally {
      loading.value = false;
    }
  }

  async function fetchBinding(jsonlPath) {
    try {
      const result = await window.electronAPI.feishuGetBinding(jsonlPath);
      if (result.success && result.binding) {
        binding.value = {
          chatId: result.binding.chat_id,
          jsonlPath: result.binding.jsonl_path,
          sessionId: result.binding.session_id
        };
      }
    } catch (err) {
      // Ignore
    }
  }

  // Handle status change events from main process
  function handleStatusChanged(data) {
    if (data.connected !== undefined) connected.value = data.connected;
    if (data.processing !== undefined) processing.value = data.processing;
  }

  return {
    connected, config, binding, processing, loading, error,
    isBound,
    detect, saveConfig, start, stop, bindSession, unbind, fetchBinding,
    handleStatusChanged
  };
});
