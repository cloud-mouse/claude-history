import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Appearance store — frosted-glass toggle.
 *
 * This is a window-level native effect (macOS vibrancy / Windows acrylic), so
 * the source of truth lives in the main process (`app_settings.frostedGlass`).
 * The renderer reads it via IPC and mirrors it onto `<html data-frosted>` so
 * CSS can switch panel opacity (ON → semi-transparent --bg-panel reveals the
 * frosted glass; OFF → opaque override covers the desktop).
 *
 * Default: ON (matches ADR-0002 + main-process fallback). The `data-frosted`
 * attribute is orthogonal to `data-theme` — they vary independently.
 */
export const useAppearanceStore = defineStore('appearance', () => {
  // `null` until init() resolves; components gate on this for the initial render.
  const frostedGlass = ref(null);

  function _apply(enabled) {
    const root = document.documentElement;
    root.setAttribute('data-frosted', enabled ? 'on' : 'off');
  }

  /** Read the persisted value from the main process and tag <html>. */
  async function init() {
    try {
      const result = await window.electronAPI.getFrostedGlass();
      // IPC contract: returns a boolean directly (not wrapped in { success }).
      const enabled = result !== false;
      frostedGlass.value = enabled;
      _apply(enabled);
    } catch (e) {
      // IPC failure → fall back to ON (the documented default).
      frostedGlass.value = true;
      _apply(true);
    }
  }

  /** Toggle frosted glass: persist via IPC (main applies native material live),
   *  then update <html> so CSS reacts immediately. */
  async function setFrostedGlass(enabled) {
    const value = !!enabled;
    frostedGlass.value = value;
    _apply(value);
    try {
      await window.electronAPI.setFrostedGlass(value);
    } catch (e) {
      // Best-effort: the attribute is already applied locally; persistence
      // failure just means it won't survive restart. Surface to console.
      console.warn('[appearance] setFrostedGlass failed:', e.message);
    }
  }

  return { frostedGlass, init, setFrostedGlass };
});
