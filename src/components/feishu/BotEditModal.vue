<template>
  <Teleport to="body">
    <transition name="dialog">
      <div v-if="show" class="bot-modal-overlay" @click.self="$emit('close')">
        <div class="bot-modal" role="dialog" aria-modal="true" :aria-label="isEdit ? '编辑机器人' : '添加机器人'">
          <div class="modal-head">
            <h3>{{ isEdit ? '编辑机器人' : '添加机器人' }}</h3>
            <div class="sub">每个机器人对应一个独立的飞书自建应用</div>
          </div>

          <div class="modal-body">
            <div class="field">
              <label class="field-label">机器人名称</label>
              <input
                v-model.trim="form.name"
                class="form-input"
                type="text"
                placeholder="如：前端机器人"
              />
            </div>

            <div class="field-row">
              <div class="field">
                <label class="field-label">App ID</label>
                <input
                  v-model.trim="form.appId"
                  class="form-input"
                  :class="{ 'input-error': appIdError }"
                  type="text"
                  placeholder="cli_xxxxxxxxxxxxx"
                  :disabled="isEdit"
                  :title="isEdit ? 'App ID 创建后不可修改，更换需删旧建新' : ''"
                />
                <div v-if="appIdError" class="field-error">{{ appIdError }}</div>
                <div v-else-if="isEdit" class="field-hint">App ID 创建后不可修改</div>
              </div>
              <div class="field">
                <label class="field-label">App Secret</label>
                <input
                  v-model="form.appSecret"
                  class="form-input"
                  type="password"
                  :placeholder="isEdit && bot && bot.hasSecret ? '留空表示不修改' : '应用密钥（加密存储）'"
                />
                <div v-if="isEdit && bot && bot.hasSecret" class="field-hint">
                  已设置密钥，留空则保留原密钥
                </div>
              </div>
            </div>

            <div class="field">
              <label class="field-label">服务的工作目录</label>
              <input
                v-model.trim="form.projectDir"
                class="form-input"
                type="text"
                list="dir-suggestions-bot"
                placeholder="选择或输入工作目录路径"
                :disabled="isEdit && bot && bot.projectDir !== ''"
                :title="(isEdit && bot && bot.projectDir !== '') ? '目录创建后不可修改，换目录需删旧建新' : ''"
              />
              <datalist id="dir-suggestions-bot">
                <option v-for="p in knownProjects" :key="p.path" :value="p.path"></option>
              </datalist>
              <div v-if="isEdit && bot && bot.projectDir !== ''" class="field-hint">
                目录已固定，更换需删除重建
              </div>
              <div v-else-if="isEdit" class="field-hint field-hint-warn">
                ⚠ 此机器人未设置服务目录，可在此一次性补填，保存后即锁定
              </div>
              <div v-else class="field-hint">
                可从已知项目选择，或手动输入任意目录路径。创建后固定，此机器人只能绑定该目录下的会话。
              </div>
            </div>

            <div class="field">
              <label class="field-label">用户白名单（可选）</label>
              <textarea
                v-model="form.allowedUsersText"
                class="form-input form-textarea"
                rows="2"
                placeholder="ou_xxxxx, ou_yyyy（每行一个或逗号分隔，留空 = 允许所有人）"
              ></textarea>
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn btn-ghost" @click="$emit('close')">取消</button>
            <button class="btn btn-primary" :disabled="!canSubmit || submitting" @click="submit">
              {{ submitting ? '保存中…' : (isEdit ? '保存' : '创建并连接') }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useProjectsStore } from '../../stores/projects';
import { decodeProjectDirName } from '../../utils/project-path';

const props = defineProps({
  show: { type: Boolean, default: false },
  /** When present, edit mode; otherwise create mode. */
  bot: { type: Object, default: null },
  /** Existing appIds (excluding the bot being edited) for client-side dup check. */
  existingAppIds: { type: Array, default: () => [] }
});
const emit = defineEmits(['close', 'submit']);

const projectsStore = useProjectsStore();

const isEdit = computed(() => !!props.bot);

// Known projects as decoded real paths — for the service-directory datalist.
const knownProjects = computed(() => {
  const list = (projectsStore.projects || []).map((p) => {
    // The raw project `name` is the encoded cwd slug; decode it into a real path.
    const decoded = p.name ? decodeProjectDirName(p.name) : null;
    return { path: decoded || p.path, raw: p };
  }).filter((p) => p.path);
  // Deduplicate by path (same dir could appear via multiple encoded names).
  const seen = new Set();
  return list.filter((p) => {
    if (seen.has(p.path)) return false;
    seen.add(p.path);
    return true;
  });
});

const emptyForm = () => ({
  name: '',
  appId: '',
  appSecret: '',
  projectDir: '',
  allowedUsersText: ''
});
const form = ref(emptyForm());

function syncFromBot() {
  if (props.bot) {
    form.value = {
      name: props.bot.name || '',
      appId: props.bot.appId || '',
      appSecret: '', // never prefill secret; empty = no change in edit mode
      projectDir: props.bot.projectDir || '',
      // Prefill the current whitelist so saving an unrelated edit doesn't wipe it.
      // (allowedUsers comes from the aggregated status payload as an array.)
      allowedUsersText: Array.isArray(props.bot.allowedUsers)
        ? props.bot.allowedUsers.join(', ')
        : ''
    };
  } else {
    form.value = emptyForm();
  }
}

watch(() => props.show, (v) => { if (v) syncFromBot(); });
watch(() => props.bot, () => { if (props.show) syncFromBot(); });

const submitting = ref(false);

// Client-side App ID duplicate check (backend UNIQUE is the real guarantee).
const appIdError = computed(() => {
  if (!isEdit.value && form.value.appId) {
    if (props.existingAppIds.includes(form.value.appId)) {
      return '该 App ID 已被其他机器人使用';
    }
  }
  return '';
});

const canSubmit = computed(() => {
  if (!form.value.name) return false;
  if (!isEdit.value && !form.value.appId) return false;
  if (!isEdit.value && !form.value.appSecret) return false;
  if (!isEdit.value && !form.value.projectDir) return false;
  if (appIdError.value) return false;
  return true;
});

function parseAllowedUsers(text) {
  return (text || '')
    .split(/[\n,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function submit() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  const payload = {
    name: form.value.name,
    allowedUsers: parseAllowedUsers(form.value.allowedUsersText)
  };
  if (isEdit.value) {
    payload.botId = props.bot.id;
    // Only include fields the user actually wants to change.
    if (form.value.appSecret) payload.appSecret = form.value.appSecret;
    // One-time projectDir backfill when currently empty.
    if (props.bot.projectDir === '' && form.value.projectDir) {
      payload.projectDir = form.value.projectDir;
    }
  } else {
    payload.appId = form.value.appId;
    payload.appSecret = form.value.appSecret;
    payload.projectDir = form.value.projectDir;
  }
  emit('submit', { payload, done: () => { submitting.value = false; } });
}

defineExpose({ reset: syncFromBot });
</script>

<style scoped>
.bot-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  z-index: 10010;
}
.bot-modal {
  width: 100%; max-width: 460px;
  background: var(--bg-secondary); color: var(--text-primary);
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.modal-head { padding: 18px 20px 4px; }
.modal-head h3 { font-size: 15px; font-weight: 700; margin: 0; }
.modal-head .sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.modal-body { padding: 16px 20px; }
.modal-foot {
  padding: 12px 20px 18px;
  display: flex; justify-content: flex-end; gap: 8px;
}

.field { margin-bottom: 14px; }
.field:last-child { margin-bottom: 0; }
.field-label {
  display: block; font-size: 12px; font-weight: 500;
  color: var(--text-secondary); margin-bottom: 6px;
}
.form-input {
  width: 100%; padding: 9px 12px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary); color: var(--text-primary);
  font-size: 13px; font-family: inherit; box-sizing: border-box;
  transition: border-color var(--transition-fast);
}
.form-input:focus { outline: none; border-color: var(--accent); }
.form-input::placeholder { color: var(--text-muted); }
.form-input:disabled {
  opacity: 0.6; cursor: not-allowed;
}
.form-textarea { resize: vertical; min-height: 48px; }
.input-error { border-color: var(--danger); }

.field-row { display: flex; gap: 10px; }
.field-row .field { flex: 1; }

.field-hint {
  font-size: 11px; color: var(--text-muted);
  margin-top: 5px; line-height: 1.4;
}
.field-hint-warn { color: var(--warning); }
.field-error {
  font-size: 11px; color: var(--danger);
  margin-top: 5px;
}

.btn {
  padding: 8px 16px; border-radius: var(--radius-control);
  border: 1px solid var(--border-color); cursor: pointer;
  font-size: 13px; font-weight: 500;
  transition: background var(--transition-fast), border-color var(--transition-fast), opacity var(--transition-fast);
}
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-color);
}
.btn-ghost:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.btn-primary {
  background: var(--primary); color: #fff;
  border-color: var(--primary);
}
.btn-primary:hover:not(:disabled) { background: var(--primary-hover); border-color: var(--primary-hover); }

.dialog-enter-active, .dialog-leave-active { transition: opacity 0.2s ease; }
.dialog-enter-from, .dialog-leave-to { opacity: 0; }
.dialog-enter-active .bot-modal, .dialog-leave-active .bot-modal {
  transition: transform 0.2s ease;
}
.dialog-enter-from .bot-modal, .dialog-leave-to .bot-modal {
  transform: scale(0.96);
}
</style>
