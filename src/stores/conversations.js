import { defineStore } from 'pinia';
import { ref, computed, reactive, nextTick } from 'vue';
import { extractTitle, cleanTitle } from '../utils/title-extractor.js';

export const useConversationsStore = defineStore('conversations', () => {
  const selectedConvId = ref(null);
  const activeConversation = ref(null);
  const loading = ref(false);
  const skippedMessages = ref(0);
  const cache = new Map();
  const titleMap = reactive({});
  let openRequestId = 0;

  function conversationKey(source, filePath) {
    return `${source || 'claude'}:${filePath || ''}`;
  }

  const selectedConv = computed(() =>
    activeConversation.value?.messages?.find(m => m.id === selectedConvId.value) || null
  );

  async function openConversation(conv, forceReload = false, focusMessageId = null) {
    const source = conv.source || 'claude';
    const cacheKey = conversationKey(source, conv.filePath);
    // If the same conversation is already open, just (re)focus a message if asked.
    if (!forceReload
      && activeConversation.value?.source === source
      && activeConversation.value?.filePath === conv.filePath) {
      if (focusMessageId) scrollToMessage(focusMessageId);
      return;
    }
    const requestId = ++openRequestId;
    loading.value = true;
    try {
      let conversation;

      // Use cache unless force-reloading (e.g. Feishu JSONL changed)
      if (!forceReload && cache.has(cacheKey)) {
        conversation = cache.get(cacheKey);
      } else {
        const result = await window.electronAPI.loadConversation(conv.filePath, source);
        if (requestId !== openRequestId) return;
        if (result.success) {
          conversation = {
            source,
            filePath: conv.filePath,
            sessionId: conv.sessionId || null,
            title: cleanTitle(conv.title) || '',
            updatedAt: conv.updatedAt,
            messages: result.messages || [],
            projectDir: result.projectDir || null,
            archived: conv.archived === true,
            skippedCount: 0
          };
          if (cache.size >= 20) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
          }
          cache.set(cacheKey, conversation);
        } else {
          console.error('[conversations store] load failed:', result.error);
          activeConversation.value = null;
          return;
        }
      }

      if (requestId !== openRequestId) return;
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
              if (source === 'claude') {
                await window.electronAPI.updateTitle(conv.id, title);
              }
            }
          }
        }
      }

      if (focusMessageId) scrollToMessage(focusMessageId);
    } finally {
      if (requestId === openRequestId) loading.value = false;
    }
  }

  // Scroll the message thread to a specific message and flash a highlight.
  // Double nextTick: wait for the active conversation to render + lay out first.
  function scrollToMessage(messageId) {
    nextTick(() => {
      nextTick(() => {
        const el = document.getElementById('msg-' + messageId);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('msg-highlight');
        setTimeout(() => el.classList.remove('msg-highlight'), 2000);
      });
    });
  }

  function clearActive() {
    openRequestId += 1;
    activeConversation.value = null;
    loading.value = false;
  }

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
    const source = conv.source || 'claude';
    const cacheKey = conversationKey(source, filePath);
    await window.electronAPI.invalidateConversationCache(filePath, source);
    cache.delete(cacheKey);

    // Bypass cache + bypass early-return
    await openConversation(conv, true);
  }

  return { selectedConvId, activeConversation, loading, skippedMessages, selectedConv, titleMap, openConversation, scrollToMessage, clearActive, clearCache, reloadByFilePath };
});
