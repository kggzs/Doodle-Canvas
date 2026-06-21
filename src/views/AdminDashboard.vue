<template>
  <AdminShell>
    <section class="dashboard-hero mb-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-5">
      <div>
        <p class="text-sm text-[var(--text-secondary)]">Doodle-Canvas Admin Console</p>
        <h1 class="mt-1 text-2xl font-semibold">运营仪表盘</h1>
        <p class="mt-2 text-sm text-[var(--text-secondary)]">模型、生成、金币与存储状态汇总</p>
      </div>
      <div class="hero-actions">
        <div class="health-pill">
          <span class="health-dot"></span>
          {{ formatNumber(overview?.models?.active) }} 个模型在线
        </div>
        <div class="health-pill">
          {{ formatNumber(overview?.models?.active_channels) }} 条渠道可用
        </div>
        <n-button size="small" type="primary" :loading="loading" @click="loadDashboard">刷新</n-button>
      </div>
    </section>

    <section class="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="item in summaryItems"
        :key="item.label"
        class="metric-card rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4"
        :style="{ '--card-accent': item.accent }"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-sm text-[var(--text-secondary)]">{{ item.label }}</div>
            <div class="mt-2 text-2xl font-semibold">{{ item.value }}</div>
          </div>
          <span class="metric-chip">{{ item.badge }}</span>
        </div>
        <div class="mt-3 text-xs text-[var(--text-secondary)]">{{ item.extra }}</div>
        <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
          <div class="h-full rounded-full" :style="{ width: `${item.progress}%`, background: item.accent }"></div>
        </div>
      </div>
    </section>

    <section class="mb-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div class="admin-panel rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="font-semibold">今日生成状态</h2>
          <n-tag size="small" :type="todayFailureRate > 0 ? 'warning' : 'success'">成功率 {{ formatPercent(overview?.generations?.success_rate_today) }}</n-tag>
        </div>
        <div class="space-y-3">
          <div v-for="item in statusItems" :key="item.label">
            <div class="mb-1 flex items-center justify-between text-sm">
              <span class="text-[var(--text-secondary)]">{{ item.label }}</span>
              <span class="font-medium">{{ formatNumber(item.value) }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
              <div class="h-full rounded-full" :style="{ width: `${item.percent}%`, background: item.color }"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="admin-panel overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div class="flex items-center justify-between border-b border-[var(--border-color)] p-4">
          <div>
            <h2 class="font-semibold">近 7 天趋势</h2>
            <p class="mt-1 text-xs text-[var(--text-secondary)]">生成、失败与金币消耗走势</p>
          </div>
        </div>
        <n-data-table
          :columns="trendColumns"
          :data="trendItems"
          :loading="loading"
          :pagination="false"
          size="small"
          striped
        />
      </div>
    </section>

    <section class="mb-4 grid gap-4 lg:grid-cols-3">
      <div class="admin-panel rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 lg:col-span-1">
        <h2 class="font-semibold">存储分布</h2>
        <div class="mt-4 space-y-3">
          <div v-for="item in storageItems" :key="item.label" class="rounded-md bg-[var(--bg-tertiary)] p-3">
            <div class="flex items-center justify-between text-sm">
              <span>{{ item.label }}</span>
              <span class="font-medium">{{ item.size }}</span>
            </div>
            <div class="mt-1 text-xs text-[var(--text-secondary)]">{{ item.count }} 个文件</div>
          </div>
        </div>
      </div>

      <div class="admin-panel overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] lg:col-span-2">
        <div class="border-b border-[var(--border-color)] p-4">
          <h2 class="font-semibold">模型使用统计</h2>
          <p class="mt-1 text-xs text-[var(--text-secondary)]">按生成记录汇总，显示成功、失败和平均耗时</p>
        </div>
        <n-data-table
          :columns="modelColumns"
          :data="modelStats"
          :loading="loading"
          :pagination="false"
          size="small"
          striped
        />
      </div>
    </section>
  </AdminShell>
</template>

<script setup>
import { computed, h, onMounted, ref } from 'vue'
import { NButton, NDataTable, NTag } from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminDashboardApi } from '@/api/backend'

const loading = ref(false)
const overview = ref(null)
const trendItems = ref([])
const modelStats = ref([])

function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatCoins(value) {
  return Number(value || 0).toFixed(2)
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function formatDuration(value) {
  const ms = Number(value || 0)
  if (!ms) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${(seconds / 60).toFixed(1)}min`
}

function formatBytes(value) {
  const bytes = Number(value || 0)
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)))
}

function typeLabel(value) {
  const labels = { image: '图片', video: '视频', chat: '问答' }
  return labels[value] || value || '-'
}

function modelSuccessRate(row) {
  const total = Number(row.total || 0)
  if (!total) return 0
  return Math.round((Number(row.completed_count || 0) / total) * 1000) / 10
}

const summaryItems = computed(() => {
  const data = overview.value || {}
  return [
    {
      label: '用户总览',
      value: formatNumber(data.users?.total),
      badge: `活跃 ${formatPercent(data.users?.active_rate)}`,
      extra: `活跃 ${formatNumber(data.users?.active)} / 今日新增 ${formatNumber(data.users?.new_today)} / 停用 ${formatNumber(data.users?.inactive)}`,
      progress: clampPercent(data.users?.active_rate),
      accent: '#22c55e'
    },
    {
      label: '今日生成',
      value: formatNumber(data.generations?.today),
      badge: `${Number(data.generations?.change_percent || 0) >= 0 ? '+' : ''}${formatPercent(data.generations?.change_percent)}`,
      extra: `累计 ${formatNumber(data.generations?.total)} / 成功 ${formatNumber(data.generations?.completed_today)} / 失败 ${formatNumber(data.generations?.failed_today)}`,
      progress: clampPercent(data.generations?.success_rate_today),
      accent: '#06b6d4'
    },
    {
      label: '今日金币',
      value: formatCoins(data.coins?.consumed_today),
      badge: `净 ${formatCoins(data.coins?.net_today)}`,
      extra: `入账 ${formatCoins(data.coins?.income_today)} / 退款 ${formatCoins(data.coins?.refunded_today)}`,
      progress: clampPercent(Math.min(Number(data.coins?.consumed_today || 0), 100)),
      accent: '#8b5cf6'
    },
    {
      label: '模型渠道',
      value: formatNumber(data.models?.active),
      badge: `${formatNumber(data.models?.circuit_open_channels)} 熔断`,
      extra: `渠道 ${formatNumber(data.models?.active_channels)} / 绑定 ${formatNumber(data.models?.active_bindings)} / 未处理错误 ${formatNumber(data.errors?.unresolved)}`,
      progress: data.models?.active_channels ? clampPercent(100 - (Number(data.models?.circuit_open_channels || 0) / Number(data.models?.active_channels || 1)) * 100) : 0,
      accent: '#f59e0b'
    }
  ]
})

const statusItems = computed(() => {
  const gen = overview.value?.generations || {}
  const total = Number(gen.today || 0) || 1
  return [
    { label: '成功完成', value: gen.completed_today, color: '#22c55e' },
    { label: '处理中', value: gen.processing_today, color: '#06b6d4' },
    { label: '等待中', value: gen.pending_today, color: '#8b5cf6' },
    { label: '失败', value: gen.failed_today, color: '#ef4444' },
    { label: '取消', value: gen.cancelled_today, color: '#94a3b8' }
  ].map(item => ({
    ...item,
    percent: clampPercent((Number(item.value || 0) / total) * 100)
  }))
})

const todayFailureRate = computed(() => {
  const gen = overview.value?.generations || {}
  const total = Number(gen.today || 0)
  return total ? (Number(gen.failed_today || 0) / total) * 100 : 0
})

const storageItems = computed(() => {
  const storage = overview.value?.files?.storage || {}
  return [
    { label: '图片文件', size: formatBytes(storage.image_size), count: formatNumber(storage.image_count) },
    { label: '视频文件', size: formatBytes(storage.video_size), count: formatNumber(storage.video_count) },
    { label: '其他文件', size: formatBytes(storage.other_size), count: formatNumber(storage.other_count) }
  ]
})

const maxTrendGenerations = computed(() => Math.max(...trendItems.value.map(item => Number(item.generations || 0)), 1))

function renderMiniBar(value, max, color) {
  const percent = clampPercent((Number(value || 0) / max) * 100)
  return h('div', { class: 'trend-cell' }, [
    h('span', { class: 'tabular-nums' }, formatNumber(value)),
    h('div', { class: 'trend-track' }, [
      h('div', { class: 'trend-bar', style: { width: `${percent}%`, background: color } })
    ])
  ])
}

const trendColumns = [
  { title: '日期', key: 'date', width: 120 },
  { title: '新增用户', key: 'new_users', width: 110 },
  {
    title: '生成数',
    key: 'generations',
    minWidth: 150,
    render(row) {
      return renderMiniBar(row.generations, maxTrendGenerations.value, '#06b6d4')
    }
  },
  {
    title: '成功/失败',
    key: 'status',
    width: 130,
    render(row) {
      return `${formatNumber(row.completed_generations)} / ${formatNumber(row.failed_generations)}`
    }
  },
  {
    title: '消费金币',
    key: 'consumed_coins',
    width: 120,
    render(row) {
      return formatCoins(row.consumed_coins)
    }
  }
]

const modelColumns = [
  {
    title: '模型',
    key: 'model',
    minWidth: 220,
    render(row) {
      return row.model?.displayName || row.model?.modelKey || row.model_id || '-'
    }
  },
  {
    title: '类型',
    key: 'type',
    width: 90,
    render(row) {
      return h(NTag, { size: 'small' }, { default: () => typeLabel(row.model?.modelType) })
    }
  },
  { title: '生成数', key: 'total', width: 100 },
  { title: '成功', key: 'completed_count', width: 90 },
  { title: '失败', key: 'failed_count', width: 90 },
  {
    title: '成功率',
    key: 'successRate',
    width: 100,
    render(row) {
      return formatPercent(modelSuccessRate(row))
    }
  },
  {
    title: '平均耗时',
    key: 'avg_duration_ms',
    width: 110,
    render(row) {
      return formatDuration(row.avg_duration_ms)
    }
  },
  {
    title: '消费金币',
    key: 'cost_amount',
    width: 120,
    render(row) {
      return formatCoins(row.cost_amount)
    }
  }
]

async function loadDashboard() {
  loading.value = true
  try {
    const [overviewData, trendData, modelData] = await Promise.all([
      adminDashboardApi.overview(),
      adminDashboardApi.trend(),
      adminDashboardApi.modelStats()
    ])
    overview.value = overviewData
    trendItems.value = trendData.items || []
    modelStats.value = modelData.items || []
  } catch (err) {
    window.$message?.error(err?.message || '加载仪表盘失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)
</script>

<style scoped>
.dashboard-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background:
    linear-gradient(135deg, rgba(34, 197, 94, 0.13), transparent 46%),
    linear-gradient(315deg, rgba(6, 182, 212, 0.12), transparent 44%),
    var(--bg-secondary);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.health-pill,
.metric-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 5px 10px;
}

.health-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--accent-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-color) 18%, transparent);
}

.metric-card {
  position: relative;
  overflow: hidden;
}

.metric-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--card-accent);
}

.metric-chip {
  color: var(--text-primary);
}

:deep(.trend-cell) {
  display: grid;
  grid-template-columns: 52px 1fr;
  align-items: center;
  gap: 10px;
}

:deep(.trend-track) {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-tertiary);
}

:deep(.trend-bar) {
  height: 100%;
  border-radius: inherit;
}

@media (max-width: 768px) {
  .dashboard-hero {
    align-items: flex-start;
    flex-direction: column;
  }

  .hero-actions {
    justify-content: flex-start;
  }
}
</style>
