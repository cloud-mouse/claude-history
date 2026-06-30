import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

/**
 * Feishu multi-bot store (design §13 / §11).
 *
 * State shape — `bots` is the aggregated status array straight from the main
 * process (`feishu:getStatus` / `feishu:statusChanged`):
 *   { id, name, appId, projectDir, enabled, hasSecret, needsProjectDir,
 *     online, processing, binding: { jsonlPath, sessionId } | null }
 *
 * App Secret is never present on these objects (only `hasSecret`); the
 * renderer cannot read the cleartext.
 */
export const useFeishuStore = defineStore('feishu', () => {
  const bots = ref([]);
  const loading = ref(false);
  const error = ref(null);

  // --- Derived stats (prototype overview chips) ---
  const totalBots = computed(() => bots.value.length);
  const onlineBots = computed(() => bots.value.filter((b) => b.online).length);
  const boundBots = computed(() => bots.value.filter((b) => b.binding).length);
  const idleBots = computed(() => bots.value.filter((b) => !b.binding).length);

  /**
   * Look up the bot currently bound to a conversation jsonl.
   * @param {string} jsonlPath
   * @returns {{ name: string, id: number } | null} null when not bound.
   */
  function boundBotFor(jsonlPath) {
    if (!jsonlPath) return null;
    const bot = bots.value.find((b) => b.binding?.jsonlPath === jsonlPath);
    return bot ? { id: bot.id, name: bot.name } : null;
  }

  /**
   * Boolean form for list dots / badges.
   * @param {string} jsonlPath
   * @returns {boolean}
   */
  function isBound(jsonlPath) {
    return boundBotFor(jsonlPath) != null;
  }

  function getBot(botId) {
    return bots.value.find((b) => b.id === botId) || null;
  }

  // --- Status sync ---

  /** Populate `bots` from a getStatus / statusChanged payload. */
  function _applyStatus(data) {
    if (data && Array.isArray(data.bots)) {
      bots.value = data.bots;
    }
  }

  /** Initial load from main process. */
  async function detect() {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuGetStatus();
      if (result.success) {
        _applyStatus(result);
      } else {
        error.value = result.error || 'Unknown error';
      }
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  /** statusChanged event handler (aggregated bots payload, design §11.3). */
  function handleStatusChanged(data) {
    _applyStatus(data);
  }

  // --- Bot CRUD actions ---

  /**
   * @param {{ name, appId, appSecret, projectDir, allowedUsers }} payload
   * @returns {Promise<{ success: boolean, bot?: object, error?: string }>}
   */
  async function createBot(payload) {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuCreateBot(payload);
      if (result.success) {
        // Optimistic: the statusChanged event will refresh; but to keep the UI
        // responsive we directly push the sanitized bot returned by the main.
        if (result.bot && !bots.value.find((b) => b.id === result.bot.id)) {
          bots.value.push(result.bot);
        }
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

  /**
   * @param {{ botId, name?, appSecret?, allowedUsers?, enabled?, projectDir? }} payload
   * @returns {Promise<{ success: boolean, bot?: object, error?: string, code?: string }>}
   */
  async function updateBot(payload) {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuUpdateBot(payload);
      if (result.success && result.bot) {
        const idx = bots.value.findIndex((b) => b.id === result.bot.id);
        if (idx !== -1) bots.value[idx] = result.bot;
      } else if (!result.success) {
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

  /**
   * @param {number} botId
   * @returns {Promise<{ success: boolean, error?: string, code?: string }>}
   */
  async function deleteBot(botId) {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuDeleteBot(botId);
      if (result.success) {
        bots.value = bots.value.filter((b) => b.id !== botId);
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

  /**
   * @param {{ botId, enabled }} payload
   * @returns {Promise<{ success: boolean, error?: string, code?: string }>}
   */
  async function toggleBot(payload) {
    loading.value = true;
    error.value = null;
    try {
      const result = await window.electronAPI.feishuToggleBot(payload);
      // Optimistically flip the persisted `enabled` flag so the button label
      // reacts immediately; `online` will follow once the runtime actually
      // (dis)connects and a statusChanged event arrives.
      if (result.success) {
        const idx = bots.value.findIndex((b) => b.id === payload.botId);
        if (idx !== -1) {
          bots.value[idx] = {
            ...bots.value[idx],
            enabled: !!payload.enabled,
            // Stopping flips online immediately; starting waits for onReady.
            online: payload.enabled ? bots.value[idx].online : false
          };
        }
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

  // --- Binding actions ---

  /**
   * @param {string} projectDir
   * @returns {Promise<{ success: boolean, bots?: Array, error?: string }>}
   */
  async function listBindableBots(projectDir) {
    try {
      const result = await window.electronAPI.feishuListBindableBots(projectDir);
      return result;
    } catch (err) {
      return { success: false, error: err.message, bots: [] };
    }
  }

  /**
   * Bind (or detect rebind needed).
   * @param {{ botId, jsonlPath }} payload
   * @returns {Promise<{ success: boolean, needsRebind?: boolean, currentBinding?: object, error?: string }>}
   */
  async function bindSessionToBot(payload) {
    try {
      return await window.electronAPI.feishuBindSessionToBot(payload);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Confirm a rebind (after the user accepts the rebind modal).
   * @param {{ botId, jsonlPath }} payload
   */
  async function rebindSessionToBot(payload) {
    try {
      return await window.electronAPI.feishuRebindSessionToBot(payload);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * @param {number} botId
   */
  async function unbindBot(botId) {
    try {
      return await window.electronAPI.feishuUnbindBot(botId);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    // state
    bots, loading, error,
    // derived
    totalBots, onlineBots, boundBots, idleBots,
    // helpers
    isBound, boundBotFor, getBot,
    // lifecycle
    detect, handleStatusChanged,
    // bot CRUD
    createBot, updateBot, deleteBot, toggleBot,
    // binding
    listBindableBots, bindSessionToBot, rebindSessionToBot, unbindBot
  };
});
