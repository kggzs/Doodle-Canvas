<template>
  <AdminShell>
    <section class="mb-4 grid gap-3 md:grid-cols-4">
      <div
        v-for="item in summaryItems"
        :key="item.label"
        class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4"
      >
        <div class="text-sm text-[var(--text-secondary)]">{{ item.label }}</div>
        <div class="mt-2 text-2xl font-semibold">{{ item.value }}</div>
        <div class="mt-1 text-xs text-[var(--text-secondary)]">{{ item.extra }}</div>
      </div>
    </section>

    <section class="mb-4 overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div class="flex items-center justify-between border-b border-[var(--border-color)] p-4">
        <h2 class="font-semibold">近 7 天趋势</h2>
        <n-button size="small" :loading="loading" @click="loadDashboard">刷新</n-button>
      </div>
      <n-data-table
        :columns="trendColumns"
        :data="trendItems"
        :loading="loading"
        :pagination="false"
        size="small"
        striped
      />
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <div class="border-b border-[var(--border-color)] p-4">
        <h2 class="font-semibold">模型使用统计</h2>
      </div>
      <n-data-table
        :columns="modelColumns"
        :data="modelStats"
        :loading="loading"
        :pagination="false"
        size="small"
        striped
      />
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

function typeLabel(value) {
  const labels = { image: '图片', video: '视频', chat: '问答' }
  return labels[value] || value || '-'
}

const summaryItems = computed(() => {
  const data = overview.value || {}
  return [
    {
      label: '用户',
      value: formatNumber(data.users?.total),
      extra: `活跃 ${formatNumber(data.users?.active)} / 今日新增 ${formatNumber(data.users?.new_today)}`
    },
    {
      label: '生成',
      value: formatNumber(data.generations?.total),
      extra: `今日 ${formatNumber(data.generations?.today)} / 失败 ${formatNumber(data.generations?.failed_today)}`
    },
    {
      label: '金币',
      value: formatCoins(data.coins?.consumed_today),
      extra: `今日入账 ${formatCoins(data.coins?.income_today)}`
    },
    {
      label: '文件',
      value: formatNumber(data.files?.active),
      extra: `已删除 ${formatNumber(data.files?.deleted)}`
    }
  ]
})

const trendColumns = [
  { title: '日期', key: 'date', width: 130 },
  { title: '新增用户', key: 'new_users', width: 120 },
  { title: '生成数', key: 'generations', width: 120 },
  { title: '失败数', key: 'failed_generations', width: 120 },
  {
    title: '消费金币',
    key: 'consumed_coins',
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
  { title: '生成数', key: 'total', width: 120 },
  {
    title: '消费金币',
    key: 'cost_amount',
    width: 130,
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
