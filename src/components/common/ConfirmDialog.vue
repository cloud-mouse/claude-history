<template>
  <Teleport to="body">
    <transition name="dialog">
      <div v-if="show" class="confirm-overlay" :style="overlayStyle" @click.self="handleCancel">
        <div class="confirm-dialog" role="dialog" aria-modal="true">
          <div class="confirm-icon" :class="type">
            <svg v-if="type === 'danger'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <h3 class="confirm-title">{{ title }}</h3>
          <p class="confirm-message">{{ message }}</p>
          <div class="confirm-actions">
            <button class="btn btn-cancel" @click="handleCancel">取消</button>
            <button class="btn" :class="type === 'danger' ? 'btn-danger' : 'btn-primary'" @click="handleConfirm">
              {{ type === 'danger' ? '删除' : '确定' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '确认'
  },
  message: {
    type: String,
    default: '确定要继续吗？'
  },
  type: {
    type: String,
    default: 'warning',
    validator: (value) => ['warning', 'danger'].includes(value)
  },
  // Stacking tier for the overlay. Defaults to 9999 (sits above SettingsModal
  // 1000); pass a higher value when rendering on top of another modal that
  // also teleports to <body> (e.g. BotEditModal at 10010) so this dialog isn't
  // covered by the parent modal's overlay.
  zIndex: {
    type: [Number, String],
    default: 9999
  }
});

// Only apply an inline z-index when a non-default value is passed, so the
// existing 9999 callers keep relying on the stylesheet and nothing changes.
const overlayStyle = props.zIndex !== 9999 ? { zIndex: String(props.zIndex) } : null;

const emit = defineEmits(['confirm', 'cancel']);

function handleConfirm() {
  emit('confirm');
}

function handleCancel() {
  emit('cancel');
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.confirm-dialog {
  background: var(--bg-secondary);
  border-radius: var(--radius-xl);
  padding: 32px;
  max-width: 400px;
  width: 90%;
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: all 0.25s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .confirm-dialog,
.dialog-leave-to .confirm-dialog {
  transform: scale(0.95) translateY(10px);
}

.confirm-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  margin: 0 auto 20px;
}

.confirm-icon.warning {
  background: var(--warning-bg);
  color: var(--warning);
}

.confirm-icon.danger {
  background: var(--danger-bg);
  color: var(--danger);
}

.confirm-title {
  font-family: var(--font-display);
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
}

.confirm-message {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0 0 28px 0;
  line-height: 1.6;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.btn {
  padding: 10px 28px;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
}

.btn-cancel {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-cancel:hover {
  background-color: var(--surface-hover);
}

.btn-primary {
  background: var(--primary);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.btn-danger {
  background: var(--danger);
  color: white;
}

.btn-danger:hover {
  opacity: 0.9;
}
</style>
