<template>
  <div class="message-thread">
    <div v-if="loading" class="thread-loading">
      <SkeletonLoader :count="4" height="100px" />
    </div>

    <div v-else-if="!conversation" class="thread-empty">
      <p>选择一个对话查看历史记录</p>
    </div>

    <div v-else class="thread-container">
      <div class="thread-header">
        <div class="thread-header-right">
          <div class="thread-title-row">
            <h2>{{ cleanTitle(conversation.title) || '未命名对话' }}</h2>
            <span class="message-count">{{ messageCount }} 条消息</span>
          </div>
          <span class="conversation-date">{{ conversationTime }}</span>
          <span v-if="remoteSession" :class="['remote-badge', feishuStore.processing ? 'active' : 'idle']">
            <span :class="['status-dot-inline', feishuStore.processing ? 'green' : 'yellow']"></span>
            飞书 {{ feishuStore.processing ? '活跃' : '空闲' }}
          </span>
        </div>
        <div class="thread-header-left">
          <button class="expand-btn" @click="toggleAll">
            {{ allExpanded ? '收起全部' : '展开全部' }}
          </button>
          <ProjectToolOpener :project-dir="projectDir" />
        </div>
      </div>

      <div class="thread-messages" ref="messagesContainer" @scroll="handleScroll">
        <div class="messages-inner">
          <template v-for="(message, index) in messages" :key="index">
            <ChatBubble
              v-if="message.role === 'user' || message.role === 'assistant' || message.type === 'tool_result'"
              :blocks="message.blocks || [message]"
              :role="message.role === 'tool_result' ? 'assistant' : message.role"
              :timestamp="message.timestamp"
              :source="remoteSession && message.role === 'user' ? 'feishu' : null"
              :message-id="message.id"
              :ref="el => setBubbleRef(index, el)"
            />
            <PermissionBadge
              v-else-if="message.type === 'permission-mode'"
              :mode="message.permissionMode"
              :granted="message.granted"
            />
            <FileSnapshot
              v-else-if="message.type === 'file-history-snapshot' && message.files && message.files.length > 0"
              :blocks="message"
            />
            <ChatBubble
              v-else-if="message.type === 'last-prompt'"
              :blocks="normalizeContent(message.message?.content)"
              role="user"
              :message-id="message.id"
              :ref="el => setBubbleRef(index, el)"
            />
          </template>
        </div>
      </div>

      <transition name="fade">
        <button v-if="showBackToTop" class="back-to-top-btn" @click="scrollToTop" title="回到顶部">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { cleanTitle } from '../../utils/title-extractor.js';
import SkeletonLoader from '../common/SkeletonLoader.vue';
import ChatBubble from '../chat/ChatBubble.vue';
import PermissionBadge from '../chat/PermissionBadge.vue';
import FileSnapshot from '../chat/FileSnapshot.vue';
import ProjectToolOpener from './ProjectToolOpener.vue';
import { useFeishuStore } from '../../stores/feishu';
import { resolveProjectDir } from '../../utils/project-path.js';

const props = defineProps({
  conversation: Object,
  loading: Boolean,
  skippedCount: {
    type: Number,
    default: 0
  }
});

const feishuStore = useFeishuStore();

const messagesContainer = ref(null);
const allExpanded = ref(false);
const bubbleRefs = ref({});
const showBackToTop = ref(false);

// Real working directory for the active conversation. Preferred source is the cwd
// recorded in the JSONL (conversation.projectDir); we fall back to decoding the
// encoded projects-folder name only when no cwd was recorded. Drives the
// "open with tool" dropdown trigger via :project-dir.
const projectDir = computed(() => resolveProjectDir(props.conversation));

// Format conversation time
const conversationTime = computed(() => {
  const timestamp = props.conversation?.updatedAt;
  if (!timestamp || timestamp === 0) {
    const filePath = props.conversation?.filePath;
    if (filePath) {
      const match = filePath.match(/(\d{10,13})/);
      if (match) {
        const ts = parseInt(match[1]);
        const date = new Date(ts > 9999999999 ? ts : ts * 1000);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      }
    }
    return '';
  }
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
});

const messages = computed(() => {
  if (!props.conversation || !props.conversation.messages) {
    return [];
  }
  return props.conversation.messages;
});

const messageCount = computed(() => {
  return messages.value.filter(m =>
    m.role === 'user' || m.role === 'assistant' || m.type === 'tool_result'
  ).length;
});

// The active conversation is the bound one when the Feishu binding points at it.
// Drives the compact "飞书 活跃/空闲" capsule (only shown for bound conversations).
const remoteSession = computed(() => {
  if (!props.conversation?.filePath) return null;
  return feishuStore.binding?.jsonlPath === props.conversation.filePath ? feishuStore.binding : null;
});

function setBubbleRef(index, el) {
  if (el) {
    bubbleRefs.value[index] = el;
  }
}

function expandAll() {
  Object.values(bubbleRefs.value).forEach(bubble => {
    if (bubble && bubble.expandAll) {
      bubble.expandAll();
    }
  });
  allExpanded.value = true;
}

function collapseAll() {
  Object.values(bubbleRefs.value).forEach(bubble => {
    if (bubble && bubble.collapseAll) {
      bubble.collapseAll();
    }
  });
  allExpanded.value = false;
}

function toggleAll() {
  if (allExpanded.value) {
    collapseAll();
  } else {
    expandAll();
  }
}

function normalizeContent(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) return content;
  return [];
}

// Reset expand state when conversation changes
watch(() => props.conversation, () => {
  bubbleRefs.value = {};
  allExpanded.value = false;
  showBackToTop.value = false;
});

// Auto-scroll to bottom on new messages
watch(messages, async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}, { deep: true });

// Handle scroll to show/hide back-to-top button
function handleScroll() {
  if (messagesContainer.value) {
    showBackToTop.value = messagesContainer.value.scrollTop > 300;
  }
}

function scrollToTop() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
</script>

<style scoped>
.message-thread {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

.thread-loading {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.thread-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.thread-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.thread-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 24px 14px;
  gap: 24px;
}

.thread-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.thread-header-right {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.thread-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.thread-title-row h2 {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-date {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.message-count {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.expand-btn {
  padding: 6px 12px;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  flex-shrink: 0;
}

.expand-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.expand-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.thread-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px 0;
}

.messages-inner {
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  justify-content: flex-end;
  padding-bottom: 24px;
}

.back-to-top-btn {
  position: absolute;
  bottom: 24px;
  right: 24px;
  width: 40px;
  height: 40px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: var(--radius-full);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-md);
  transition: all var(--transition-fast);
  z-index: 10;
}

.back-to-top-btn:hover {
  background: var(--primary-hover);
  transform: translateY(-2px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Feishu status capsule — only for the bound conversation. */
.remote-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 500;
  margin-left: 8px;
  width: fit-content;
}

.remote-badge.active {
  background: var(--success-bg);
  color: var(--success);
}

.remote-badge.idle {
  background: var(--warning-bg);
  color: var(--warning);
}

.status-dot-inline {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot-inline.green {
  background: var(--success);
  box-shadow: 0 0 4px var(--success-bg);
}

.status-dot-inline.yellow {
  background: var(--warning);
}
</style>
