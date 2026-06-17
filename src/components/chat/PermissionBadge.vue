<template>
  <div class="permission-badge">
    <span class="permission-label">Permission: {{ modeText }}</span>
    <span :class="['permission-status', granted ? 'granted' : 'revoked']">
      {{ granted ? '✓ Granted' : '✗ Revoked' }}
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  mode: {
    type: String,
    default: 'default'
  },
  granted: {
    type: Boolean,
    default: false
  }
});

const modeText = computed(() => {
  const modes = {
    'bypassPermissions': 'Bypass Permissions',
    'allowAll': 'Allow All',
    'deny': 'Deny',
    'prompt': 'Prompt',
    'default': 'Default'
  };
  return modes[props.mode] || props.mode;
});
</script>

<style scoped>
.permission-badge {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background-color: var(--bg-secondary);
  border-radius: var(--radius-card);
  font-size: var(--font-size-sm);
  margin: 8px 0;
}

.permission-label {
  color: var(--text-primary);
  font-weight: 500;
}

.permission-status {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.permission-status.granted {
  background-color: var(--success-bg);
  color: var(--success);
}

.permission-status.revoked {
  background-color: var(--danger-bg);
  color: var(--danger);
}
</style>
