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

  async function openConversation(conv) {
    if (activeConversation.value?.filePath === conv.filePath) return;
    loading.value = true;
    try {
      let conversation;

      if (cache.has(conv.filePath)) {
        conversation = cache.get(conv.filePath);
      } else {
        const result = await window.electronAPI.loadConversation(conv.filePath);
        if (result.success) {
          conversation = {
            filePath: conv.filePath,
            title: cleanTitle(conv.title) || '',
            updatedAt: conv.updatedAt,
            messages: result.messages || [],
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

  return { selectedConvId, activeConversation, loading, skippedMessages, selectedConv, titleMap, openConversation, clearActive, clearCache };
});
