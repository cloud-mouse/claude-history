<template>
  <Teleport to="body">
    <transition name="modal">
      <div v-if="show" class="stats-overlay" @click.self="$emit('close')">
        <div class="stats-modal">
          <div class="modal-header">
            <h2>📊 使用统计</h2>
            <button class="close-btn" @click="$emit('close')">&times;</button>
          </div>

          <div class="modal-body">
            <div v-if="statsStore.loading && !statsStore.data" class="state-msg">加载中…</div>
            <div v-else-if="statsStore.error" class="state-msg error">{{ statsStore.error }}</div>
            <template v-else-if="statsStore.data">
              <div class="summary-cards">
                <div class="summary-card">
                  <div class="summary-value">{{ formatNum(totals.conversations) }}</div>
                  <div class="summary-label">会话</div>
                </div>
                <div class="summary-card primary">
                  <div class="summary-value">{{ formatTokens(totalTokens) }}</div>
                  <div class="summary-label">总 Token</div>
                </div>
                <div class="summary-card">
                  <div class="summary-value">{{ formatNum(totals.assistant_turns) }}</div>
                  <div class="summary-label">助手轮次</div>
                </div>
                <div class="summary-card">
                  <div class="summary-value">${{ (totals.last_cost_total || 0).toFixed(4) }}</div>
                  <div class="summary-label">实时成本</div>
                </div>
              </div>

              <div class="token-breakdown">
                <span><i>输入</i> {{ formatTokens(totals.input_tokens) }}</span>
                <span><i>输出</i> {{ formatTokens(totals.output_tokens) }}</span>
                <span><i>缓存读</i> {{ formatTokens(totals.cache_read_tokens) }}</span>
                <span><i>缓存写</i> {{ formatTokens(totals.cache_creation_tokens) }}</span>
              </div>
              <p class="cost-note">ℹ️ 美元成本仅来自飞书远程实时会话；历史本地会话未保存美元（仅 token），后台会逐步回填。</p>

              <h3>按项目</h3>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr><th>项目</th><th>会话</th><th>输入</th><th>输出</th><th>缓存读</th><th>轮次</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in statsStore.data.byProject" :key="p.project_id">
                      <td class="proj-name" :title="p.project_path">{{ p.project_name }}</td>
                      <td>{{ p.conversations }}</td>
                      <td>{{ formatTokens(p.input_tokens) }}</td>
                      <td>{{ formatTokens(p.output_tokens) }}</td>
                      <td>{{ formatTokens(p.cache_read_tokens) }}</td>
                      <td>{{ p.assistant_turns }}</td>
                    </tr>
                    <tr v-if="!statsStore.data.byProject.length"><td colspan="6" class="empty">暂无数据（后台回填中，点刷新）</td></tr>
                  </tbody>
                </table>
              </div>

              <h3>最近 30 天 Token 消耗</h3>
              <div class="day-chart">
                <div v-for="d in dayChart" :key="d.day" class="day-row">
                  <span class="day-label">{{ d.day.slice(5) }}</span>
                  <div class="day-bar-track">
                    <div class="day-bar" :style="{ width: d.pct + '%' }" :title="`${d.day}: ${formatTokens(d.tokens)}`"></div>
                  </div>
                  <span class="day-val">{{ formatTokens(d.tokens) }}</span>
                </div>
                <div v-if="!dayChart.length" class="empty">暂无数据</div>
              </div>

              <h3>模型使用</h3>
              <div class="model-list">
                <span v-for="m in statsStore.data.byModel" :key="m.model" class="model-chip">
                  {{ shortModel(m.model) }} <em>×{{ m.conversations }}</em>
                </span>
                <span v-if="!statsStore.data.byModel.length" class="empty">暂无数据</span>
              </div>
            </template>

            <button class="refresh-btn" @click="statsStore.loadOverview()" :disabled="statsStore.loading">
              {{ statsStore.loading ? '加载中…' : '↻ 刷新' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useStatsStore } from '../../stores/stats';

const props = defineProps({ show: Boolean });
defineEmits(['close']);

const statsStore = useStatsStore();

watch(() => props.show, (v) => { if (v) statsStore.loadOverview(); });

const totals = computed(() => statsStore.data?.totals || {});
const totalTokens = computed(() =>
  (totals.value.input_tokens || 0) + (totals.value.output_tokens || 0));

const dayChart = computed(() => {
  const days = statsStore.data?.byDay || [];
  const max = Math.max(1, ...days.map(d => (d.input_tokens || 0) + (d.output_tokens || 0)));
  return days.map(d => {
    const t = (d.input_tokens || 0) + (d.output_tokens || 0);
    return { day: d.day, tokens: t, pct: Math.round(t / max * 100) };
  });
});

function formatNum(n) {
  n = Number(n) || 0;
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
function formatTokens(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
function shortModel(m) {
  return String(m || '').replace(/^claude-/, '').replace(/-\d{8}$/, '');
}
</script>

<style scoped>
.stats-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.stats-modal {
  background: var(--bg-primary, #1e1e1e); color: var(--text-primary, #e0e0e0);
  border-radius: 12px; width: 680px; max-width: 92vw; max-height: 85vh;
  overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--border-color, #333);
  position: sticky; top: 0; background: var(--bg-primary, #1e1e1e); z-index: 2;
}
.modal-header h2 { font-size: 16px; font-weight: 600; margin: 0; }
.close-btn {
  background: none; border: none; font-size: 22px; cursor: pointer;
  color: var(--text-secondary, #888); padding: 0 4px; line-height: 1;
}
.close-btn:hover { color: var(--text-primary, #e0e0e0); }
.modal-body { padding: 20px; }

.state-msg { padding: 40px 0; text-align: center; color: var(--text-muted, #888); }
.state-msg.error { color: var(--color-error, #ff6666); }

.summary-cards {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px;
}
.summary-card {
  padding: 12px; border-radius: 8px; background: var(--bg-secondary, #252525);
  text-align: center; border: 1px solid var(--border-color, #333);
}
.summary-card.primary { border-color: var(--primary, #4a9eff); }
.summary-value { font-size: 20px; font-weight: 700; }
.summary-card.primary .summary-value { color: var(--primary, #4a9eff); }
.summary-label { font-size: 11px; color: var(--text-muted, #888); margin-top: 4px; }

.token-breakdown {
  display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12px;
  color: var(--text-secondary, #aaa); margin-bottom: 8px;
}
.token-breakdown i { font-style: normal; color: var(--text-muted, #777); margin-right: 4px; }
.cost-note { font-size: 11px; color: var(--text-muted, #888); margin: 0 0 16px; line-height: 1.5; }

h3 { font-size: 13px; margin: 18px 0 8px; color: var(--text-secondary, #ccc); }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 6px 8px; text-align: right; border-bottom: 1px solid var(--border-light, #2a2a2a); }
th { color: var(--text-muted, #888); font-weight: 600; text-align: right; }
th:first-child, td:first-child { text-align: left; }
.proj-name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
tbody tr:hover { background: var(--bg-tertiary, #2d2d2d); }
.empty { color: var(--text-muted, #777); text-align: center; padding: 16px; }

.day-chart { display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; }
.day-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.day-label { width: 38px; color: var(--text-muted, #888); flex-shrink: 0; }
.day-bar-track { flex: 1; height: 12px; background: var(--bg-tertiary, #2d2d2d); border-radius: 6px; overflow: hidden; }
.day-bar { height: 100%; background: var(--primary, #4a9eff); border-radius: 6px; min-width: 2px; transition: width 0.3s; }
.day-val { width: 44px; text-align: right; color: var(--text-secondary, #aaa); flex-shrink: 0; }

.model-list { display: flex; flex-wrap: wrap; gap: 6px; }
.model-chip {
  font-size: 12px; padding: 4px 10px; border-radius: 12px;
  background: var(--bg-tertiary, #2d2d2d); border: 1px solid var(--border-color, #333);
  font-family: var(--font-mono, monospace);
}
.model-chip em { font-style: normal; color: var(--text-muted, #888); margin-left: 4px; }

.refresh-btn {
  margin-top: 20px; padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border-color, #333);
  background: var(--bg-secondary, #252525); color: var(--text-primary, #e0e0e0);
  font-size: 13px; cursor: pointer; transition: all 0.2s;
}
.refresh-btn:hover:not(:disabled) { border-color: var(--primary, #4a9eff); color: var(--primary, #4a9eff); }
.refresh-btn:disabled { opacity: 0.5; cursor: not allowed; }

.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
