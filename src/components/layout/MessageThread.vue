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
        <div v-if="remoteSession" class="session-bind-info">
          <span class="bind-icon">🔗</span>
          <span class="bind-text">绑定会话: <code>{{ sessionIdShort }}</code></span>
        </div>
        <div class="thread-header-left">
          <button v-if="canBindToFeishu" class="bind-btn" @click="bindToFeishu" :disabled="binding" :title="bindTooltip">
            <span class="bind-btn-icon">🐦</span>
            {{ binding ? '绑定中...' : (remoteSession ? '已绑定' : '绑定到飞书') }}
          </button>
          <span v-if="bindResult" :class="['bind-feedback', bindResult.success ? 'success' : 'error']">
            {{ bindResult.success ? '✓' : '✗' }} {{ bindResult.message }}
          </span>
          <button class="resume-btn" @click="resumeConversation" title="在终端中恢复会话">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            恢复会话
          </button>
          <button class="expand-btn" @click="toggleAll">
            {{ allExpanded ? '收起全部' : '展开全部' }}
          </button>
        </div>
      </div>

      <div class="session-command-bar">
        <div class="session-command" @click="copyCommand">
          <code>{{ resumeCommand }}</code>
          <button class="copy-btn" :class="{ copied: commandCopied }">
            <svg v-if="!commandCopied" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </button>
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
import { useFeishuStore } from '../../stores/feishu';

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
const commandCopied = ref(false);
const showBackToTop = ref(false);

// Build resume command
const resumeCommand = computed(() => {
  if (!props.conversation?.filePath) return '';
  const fileName = props.conversation.filePath.split('/').pop().replace('.jsonl', '');
  const projectDir = props.conversation.projectDir || props.conversation.filePath.split('/').slice(0, -1).join('/');
  return `cd "${projectDir}" && claude --resume ${fileName}`;
});

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

// Resume conversation in terminal
function resumeConversation() {
  if (props.conversation?.filePath) {
    window.electronAPI.resumeConversation(props.conversation.filePath, props.conversation.projectDir);
  }
}

// Copy resume command
function copyCommand() {
  const cmd = resumeCommand.value;
  navigator.clipboard.writeText(cmd).then(() => {
    commandCopied.value = true;
    setTimeout(() => {
      commandCopied.value = false;
    }, 2000);
  });
}

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

const remoteSession = computed(() => {
  if (!props.conversation?.filePath) return null;
  return feishuStore.binding?.jsonlPath === props.conversation.filePath ? feishuStore.binding : null;
});

const sessionIdShort = computed(() => {
  if (!remoteSession.value?.sessionId) return '';
  const id = remoteSession.value.sessionId;
  return id.length > 16 ? id.slice(0, 8) + '...' + id.slice(-8) : id;
});

// Extract the agent session ID from the JSONL file path
const agentSessionId = computed(() => {
  if (!props.conversation?.filePath) return null;
  const fileName = props.conversation.filePath.split('/').pop();
  return fileName?.replace('.jsonl', '') || null;
});

// Can bind to Feishu: Feishu is connected and session ID exists
const canBindToFeishu = computed(() => {
  return feishuStore.connected && agentSessionId.value;
});

const bindTooltip = computed(() => {
  if (!feishuStore.connected) return '请先在设置中启用飞书桥接';
  if (remoteSession.value) return '此会话已绑定到飞书远程会话';
  return '将此会话绑定到飞书，下次飞书消息将进入此会话';
});

const binding = ref(false);
const bindResult = ref(null); // { success: boolean, message: string }

async function bindToFeishu() {
  if (!agentSessionId.value || binding.value) return;
  binding.value = true;
  bindResult.value = null;
  try {
    const result = await feishuStore.bindSession(props.conversation.filePath);
    if (result.success) {
      bindResult.value = { success: true, message: result.message || '已绑定到飞书' };
    } else {
      bindResult.value = { success: false, message: result.error || '绑定失败' };
    }
  } catch (err) {
    bindResult.value = { success: false, message: err.message || '绑定失败' };
  } finally {
    binding.value = false;
    setTimeout(() => { bindResult.value = null; }, 4000);
  }
}

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
  commandCopied.value = false;
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
  background: var(--bg-primary);
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
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-light);
  background: var(--bg-secondary);
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

.resume-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: white;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.resume-btn:hover {
  background: var(--primary-hover);
}

.expand-btn {
  padding: 6px 12px;
  font-size: var(--font-size-xs);
  color: var(--primary);
  background: transparent;
  border: 1px solid var(--primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.expand-btn:hover:not(:disabled) {
  background: var(--primary);
  color: white;
}

.expand-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.session-command-bar {
  display: flex;
  align-items: center;
  padding: 12px 24px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-light);
}

.session-command {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 6px 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.session-command:hover {
  border-color: var(--primary);
}

.session-command code {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--text-primary);
  white-space: nowrap;
}

.copy-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.copy-btn:hover {
  color: var(--primary);
  background: var(--bg-tertiary);
}

.copy-btn.copied {
  color: var(--color-success);
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

/* Remote session badge */
.remote-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 500;
  margin-left: 8px;
}

.remote-badge.active {
  background: rgba(34, 197, 94, 0.1);
  color: var(--color-success);
}

.remote-badge.idle {
  background: rgba(245, 158, 11, 0.1);
  color: var(--color-warning);
}

.status-dot-inline {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot-inline.green {
  background: var(--color-success);
  box-shadow: 0 0 4px var(--color-success);
}

.status-dot-inline.yellow {
  background: var(--color-warning);
}

/* Session bind info */
.session-bind-info {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-left: 8px;
  margin-top: 2px;
}

.bind-icon {
  font-size: 12px;
}

.bind-text code {
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--bg-tertiary);
  padding: 1px 4px;
  border-radius: 3px;
}

/* Bind to Feishu button */
.bind-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-family: inherit;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.bind-btn:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--primary);
}

.bind-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bind-btn-icon {
  font-size: 13px;
}

.bind-feedback {
  font-size: var(--font-size-xs);
  font-weight: 500;
  animation: fadeIn 0.3s ease;
}

.bind-feedback.success {
  color: var(--color-success);
}

.bind-feedback.error {
  color: var(--color-error);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>