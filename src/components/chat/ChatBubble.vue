<template>
  <div v-if="hasVisibleContent" :id="messageId ? 'msg-' + messageId : undefined" :class="['chat-bubble', role]">
    <div class="bubble-header">
      <span class="avatar">
        <svg v-if="role === 'user'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
      </span>
      <span class="role-label">{{ roleLabel }}</span>
      <span v-if="source === 'feishu'" class="source-badge">🐦 来自飞书</span>
      <span v-if="formattedTime" class="bubble-time">{{ formattedTime }}</span>
    </div>
    <div class="bubble-content">
      <template v-for="(block, i) in normalizedBlocks" :key="i">
        <div v-if="block.type === 'text'" class="text-block">
          <div v-if="block.command" class="command-wrapper">
            <CommandBlock
              :command="block.command"
              :body="block.body"
            />
            <div v-if="block.body && block.body.trim()" v-html="block.renderedHtml" class="markdown-content command-body"></div>
          </div>
          <div v-else class="text-content">
            <button class="copy-md-btn" @click="copyText(block, $event)" title="复制内容">
              <svg v-if="copiedIndex !== i" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
            <div v-html="block.renderedHtml" class="markdown-content"></div>
          </div>
        </div>
        <div v-else-if="block.type === 'image'" class="image-block">
          <img v-if="block.imageUrl" :src="block.imageUrl" class="attached-image" @click="previewImage(block.imageUrl)" />
          <span v-else class="image-placeholder">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            图片
          </span>
        </div>
        <TaskCreateBlock v-if="block.type === 'tool_use' && block.name === 'TaskCreate'" :block="block" :ref="el => setChildRef('taskcreate_' + i, el)" />
        <TaskUpdateBlock v-else-if="block.type === 'tool_use' && (block.name === 'TaskUpdate' || block.toolName === 'TaskUpdate')" :block="block" :ref="el => setChildRef('taskupdate_' + i, el)" />
        <AgentToolBlock v-else-if="block.type === 'tool_use' && (block.name === 'Agent' || block.toolName === 'Agent')" :block="block" :ref="el => setChildRef('agent_' + i, el)" />
        <TodoWriteBlock v-else-if="block.type === 'tool_use' && (block.name === 'TodoWrite' || block.toolName === 'TodoWrite')" :block="block" :ref="el => setChildRef('todo_' + i, el)" />
        <WriteToolBlock v-else-if="block.type === 'tool_use' && block.name === 'Write'" :block="block" :ref="el => setChildRef('write_' + i, el)" />
        <EditToolBlock v-else-if="block.type === 'tool_use' && block.name === 'Edit'" :block="block" :ref="el => setChildRef('edit_' + i, el)" />
        <ReadToolBlock v-else-if="block.type === 'tool_use' && block.name === 'Read'" :block="block" :ref="el => setChildRef('read_' + i, el)" />
        <GlobToolBlock v-else-if="block.type === 'tool_use' && block.name === 'Glob'" :block="block" :ref="el => setChildRef('glob_' + i, el)" />
        <GrepToolBlock v-else-if="block.type === 'tool_use' && block.name === 'Grep'" :block="block" :ref="el => setChildRef('grep_' + i, el)" />
        <AskUserQuestionBlock v-else-if="block.type === 'tool_use' && (block.name === 'AskUserQuestion' || block.toolName === 'AskUserQuestion')" :block="block" :ref="el => setChildRef('ask_' + i, el)" />
        <TaskOutputBlock v-else-if="block.type === 'tool_use' && (block.name === 'TaskOutput' || block.toolName === 'TaskOutput')" :block="block" :ref="el => setChildRef('taskoutput_' + i, el)" />
        <ToolCall v-else-if="block.type === 'tool_use'" :block="block" :ref="el => setChildRef('tool_' + i, el)" />
        <ToolResult v-else-if="block.type === 'tool_result'" :block="block" :ref="el => setChildRef('result_' + i, el)" />
        <ThinkingBlock v-else-if="block.type === 'thinking'" :block="block" :ref="el => setChildRef('thinking_' + i, el)" />
      </template>
    </div>
    <Teleport to="body">
      <transition name="lightbox">
        <div v-if="previewUrl" class="image-lightbox" @click="closePreview" @keydown.escape="closePreview">
          <img :src="previewUrl" class="lightbox-image" @click.stop />
          <button class="lightbox-close" @click="closePreview">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { renderMarkdown, parseCommandContent } from '../../utils/markdown.js';
import ToolCall from '../tools/ToolCall.vue';
import ToolResult from '../tools/ToolResult.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import TaskCreateBlock from '../tools/TaskCreateBlock.vue';
import CommandBlock from './CommandBlock.vue';
import WriteToolBlock from '../tools/WriteToolBlock.vue';
import EditToolBlock from '../tools/EditToolBlock.vue';
import ReadToolBlock from '../tools/ReadToolBlock.vue';
import AgentToolBlock from '../tools/AgentToolBlock.vue';
import TodoWriteBlock from '../tools/TodoWriteBlock.vue';
import TaskUpdateBlock from '../tools/TaskUpdateBlock.vue';
import AskUserQuestionBlock from '../tools/AskUserQuestionBlock.vue';
import TaskOutputBlock from '../tools/TaskOutputBlock.vue';
import GlobToolBlock from '../tools/GlobToolBlock.vue';
import GrepToolBlock from '../tools/GrepToolBlock.vue';

const props = defineProps({
  blocks: {
    type: Array,
    required: true
  },
  role: {
    type: String,
    required: true,
    validator: (value) => ['user', 'assistant'].includes(value)
  },
  timestamp: {
    type: [String, Number],
    default: null
  },
  source: {
    type: String,
    default: null
  },
  messageId: {
    type: String,
    default: null
  }
});

const childRefs = ref({});

const normalizedBlocks = computed(() => {
  return props.blocks.map((block, index) => {
    if (block.type === 'text') {
      const text = block.text || block.content || '';
      if (typeof text === 'string' && text.trim()) {
        const { command, body } = parseCommandContent(text);
        return {
          ...block,
          command,
          body,
          renderedHtml: renderMarkdown(body)
        };
      }
      return null;
    }
    if (block.type === 'tool_use' && block.toolName) {
      return { ...block, name: block.toolName };
    }
    if (block.type === 'image') {
      const source = block.source || {};
      return {
        ...block,
        imageUrl: source.url || (source.data ? `data:${source.media_type || 'image/png'};base64,${source.data}` : null)
      };
    }
    return block;
  }).filter(Boolean);
});

const hasVisibleContent = computed(() => normalizedBlocks.value.length > 0);

const roleLabel = computed(() => {
  return props.role === 'user' ? '用户' : 'Claude';
});

const formattedTime = computed(() => {
  if (!props.timestamp) return '';
  const ts = typeof props.timestamp === 'number'
    ? (props.timestamp > 9999999999 ? props.timestamp : props.timestamp * 1000)
    : new Date(props.timestamp).getTime();
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
});

const previewUrl = ref(null);
const copiedIndex = ref(-1);

function copyText(block, event) {
  event.stopPropagation();
  const text = block.text || block.content || '';
  navigator.clipboard.writeText(text).then(() => {
    const idx = normalizedBlocks.value.indexOf(block);
    copiedIndex.value = idx;
    setTimeout(() => { copiedIndex.value = -1; }, 2000);
  });
}

function previewImage(url) {
  previewUrl.value = url;
  document.addEventListener('keydown', onPreviewEscape);
}

function closePreview() {
  previewUrl.value = null;
  document.removeEventListener('keydown', onPreviewEscape);
}

function onPreviewEscape(e) {
  if (e.key === 'Escape') closePreview();
}

function setChildRef(index, el) {
  if (el) {
    childRefs.value[index] = el;
  }
}

function expandAll() {
  Object.values(childRefs.value).forEach(child => {
    if (child && child.expandAll) {
      child.expandAll();
    }
  });
}

function collapseAll() {
  Object.values(childRefs.value).forEach(child => {
    if (child && child.collapseAll) {
      child.collapseAll();
    }
  });
}

defineExpose({ expandAll, collapseAll });
</script>

<style scoped>
.chat-bubble {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}

.chat-bubble.user {
  max-width: 80%;
  align-self: flex-end;
}

.chat-bubble.assistant {
  max-width: 100%;
  align-self: flex-start;
}

.bubble-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.chat-bubble.user .avatar {
  background: var(--bubble-user-bg);
  color: var(--bubble-user-text);
}

.chat-bubble.assistant .avatar {
  background: var(--primary);
  color: white;
}

.role-label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.source-badge {
  font-size: 10px;
  color: var(--success);
  background: var(--success-bg);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-weight: 500;
}

.bubble-time {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  opacity: 0.7;
}

.bubble-content {
  padding: 12px 16px;
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-bubble);
}

.chat-bubble.user .bubble-content {
  background: var(--bubble-user-bg);
  color: var(--bubble-user-text);
  border-radius: var(--radius-card) var(--radius-control) var(--radius-card) var(--radius-card);
}

.chat-bubble.assistant .bubble-content {
  background: var(--bubble-claude-bg);
  color: var(--bubble-claude-text);
  border-radius: var(--radius-card);
}

.text-content {
  position: relative;
  word-break: break-word;
  line-height: 1.7;
}

.copy-md-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: all var(--transition-fast);
  z-index: 2;
}

.text-content:hover .copy-md-btn {
  opacity: 1;
}

.copy-md-btn:hover {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.chat-bubble.assistant .text-content {
  line-height: 1.8;
}

.command-wrapper {
  margin-bottom: 8px;
}

.command-body {
  margin-top: 10px;
  padding: 10px 12px;
  background-color: var(--code-bg);
  border-radius: var(--radius-control);
  border-left: 3px solid var(--accent);
}

.markdown-content {
  overflow-x: auto;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  margin: 0.8em 0 0.4em;
  font-weight: 600;
}

.markdown-content :deep(h1) { font-size: 1.3em; }
.markdown-content :deep(h2) { font-size: 1.15em; }
.markdown-content :deep(h3) { font-size: 1.05em; }

.markdown-content :deep(p) {
  margin: 0.5em 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.markdown-content :deep(li) {
  margin: 0.2em 0;
}

.markdown-content :deep(code) {
  background-color: var(--code-bg);
  padding: 0.15em 0.4em;
  border-radius: var(--radius-control);
  font-family: var(--font-mono);
  font-size: 0.88em;
}

.chat-bubble.user .markdown-content :deep(code) {
  background-color: rgba(255, 255, 255, 0.12);
}

.markdown-content :deep(pre) {
  background-color: var(--code-bg);
  padding: 12px 16px;
  border-radius: var(--radius-card);
  overflow-x: auto;
  margin: 0.8em 0;
}

.chat-bubble.user .markdown-content :deep(pre) {
  background-color: rgba(255, 255, 255, 0.1);
}

.markdown-content :deep(pre code) {
  background: none;
  padding: 0;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid var(--accent);
  margin: 0.5em 0;
  padding: 0.3em 0 0.3em 1em;
  opacity: 0.85;
  background: var(--surface-hover);
  border-radius: 0 var(--radius-control) var(--radius-control) 0;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.8em 0;
  font-size: 0.92em;
}

.markdown-content :deep(thead) {
  background: var(--bg-tertiary);
}

.markdown-content :deep(th) {
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  font-size: 0.9em;
  border-bottom: 1px solid var(--border-color);
}

.markdown-content :deep(td) {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
}

.markdown-content :deep(tr:hover td) {
  background: var(--surface-hover);
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 1em 0;
}

.markdown-content :deep(a) {
  color: var(--primary);
  text-decoration: none;
}

.markdown-content :deep(a:hover) {
  text-decoration: underline;
}

.markdown-content :deep(strong) {
  font-weight: 600;
}

.image-block {
  margin-top: 8px;
}

.attached-image {
  max-width: 100%;
  max-height: 400px;
  border-radius: var(--radius-card);
  cursor: zoom-in;
}

.image-placeholder {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 6px 12px;
  border-radius: var(--radius-control);
}
</style>

<style>
.image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: zoom-out;
}

.lightbox-image {
  max-width: 92vw;
  max-height: 92vh;
  object-fit: contain;
  border-radius: 4px;
  cursor: default;
}

.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 50%;
  color: white;
  cursor: pointer;
  transition: background 0.15s;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.lightbox-enter-active,
.lightbox-leave-active {
  transition: opacity 0.2s ease;
}

.lightbox-enter-from,
.lightbox-leave-to {
  opacity: 0;
}
</style>
