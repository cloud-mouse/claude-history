import { defineStore } from 'pinia';
import { ref, computed, reactive } from 'vue';
import { extractTitle, cleanTitle } from '../utils/title-extractor.js';

export const useConversationsStore = defineStore('conversations', () => {
  const selectedConvId = ref(null);
  const activeConversation = ref(null);
  const loading = ref(false);
  const skippedMessages = ref(0);
  const cache = new Map();
  const titleMap = reactive({});

  const selectedConv = computed(() =>
    activeConversation.value?.messages?.find(m => m.id === selectedConvId.value) || null
  );

  async function openConversation(conv, forceReload = false) {
    if (!forceReload && activeConversation.value?.filePath === conv.filePath) return;
    loading.value = true;
    try {
      let conversation;

      // Use cache unless force-reloading (e.g. Feishu JSONL changed)
      if (!forceReload && cache.has(conv.filePath)) {
        conversation = cache.get(conv.filePath);
      } else {
        const result = await window.electronAPI.loadConversation(conv.filePath);
        if (result.success) {
          conversation = {
            filePath: conv.filePath,
            title: cleanTitle(conv.title) || '',
            updatedAt: conv.updatedAt,
            messages: result.messages || [],
            projectDir: result.projectDir || null,
            skippedCount: 0
          };
          if (cache.size >= 20) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
          }
          cache.set(conv.filePath, conversation);
        } else {
          console.error('[conversations store] load failed:', result.error);
          activeConversation.value = null;
          return;
        }
      }

      activeConversation.value = conversation;

      // Auto-generate title if not present
      if (!conv.title && conversation.messages?.length > 0) {
        const firstUserMsg = conversation.messages.find(m => m.role === 'user');
        if (firstUserMsg) {
          const textBlock = firstUserMsg.blocks?.find(b => b.type === 'text');
          if (textBlock?.text) {
            const title = cleanTitle(extractTitle(textBlock.text));
            if (title) {
              titleMap[conv.filePath] = title;
              conversation.title = title;
              await window.electronAPI.updateTitle(conv.id, title);
            }
          }
        }
      }
    } finally {
      loading.value = false;
    }
  }

  function clearActive() { activeConversation.value = null; }

  function clearCache() { cache.clear(); }

  /**
   * Force-reload a conversation from disk by filePath.
   * Used when Feishu updates the JSONL file externally.
   * If the file is the active conversation, re-reads and updates in place.
   */
  async function reloadByFilePath(filePath) {
    const conv = activeConversation.value?.filePath === filePath
      ? activeConversation.value
      : null;
    if (!conv) return;

    // Clear both backend and frontend caches before re-reading
    await window.electronAPI.invalidateConversationCache(filePath);
    cache.delete(filePath);

    // Bypass cache + bypass early-return
    await openConversation(conv, true);
  }

  return { selectedConvId, activeConversation, loading, skippedMessages, selectedConv, titleMap, openConversation, clearActive, clearCache, reloadByFilePath };
});
