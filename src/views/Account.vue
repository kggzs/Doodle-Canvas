<template>
  <div class="h-screen overflow-y-auto bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <AppHeader>
      <template #left>
        <button class="flex items-center gap-2" @click="router.push('/projects')">
          <img src="../assets/logo.png" alt="Doodle Canvas" class="h-9 w-9" />
          <span class="font-semibold">用户中心</span>
        </button>
      </template>
    </AppHeader>

    <main class="mx-auto max-w-6xl px-4 py-8">
      <section class="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 class="text-2xl font-semibold">我的账号</h1>
          <p class="mt-1 text-sm text-[var(--text-secondary)]">{{ currentUser?.email || '-' }}</p>
        </div>
        <div class="flex gap-2">
          <n-button secondary @click="router.push('/projects')">我的画布</n-button>
          <n-button type="primary" :loading="loading" @click="loadAccount">刷新</n-button>
        </div>
      </section>

      <section class="mb-4 grid gap-3 md:grid-cols-4">
        <div
          v-for="item in balanceCards"
          :key="item.label"
          class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4"
        >
          <div class="text-sm text-[var(--text-secondary)]">{{ item.label }}</div>
          <div class="mt-2 text-2xl font-semibold">{{ item.value }}</div>
          <div class="mt-1 text-xs text-[var(--text-secondary)]">{{ item.extra }}</div>
        </div>
      </section>

      <section class="mb-4 grid gap-4 md:grid-cols-[300px_1fr]">
        <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
          <h2 class="mb-3 font-semibold">账号信息</h2>
          <dl class="space-y-3 text-sm">
            <div>
              <dt class="text-[var(--text-secondary)]">用户名</dt>
              <dd class="mt-1">{{ currentUser?.username || '-' }}</dd>
            </div>
            <div>
              <dt class="text-[var(--text-secondary)]">邮箱</dt>
              <dd class="mt-1 break-all">{{ currentUser?.email || '-' }}</dd>
            </div>
            <div>
              <dt class="text-[var(--text-secondary)]">账号状态</dt>
              <dd class="mt-1">{{ statusLabel(currentUser?.status) }}</dd>
            </div>
            <div>
              <dt class="text-[var(--text-secondary)]">用户组</dt>
              <dd class="mt-1">{{ groupNames }}</dd>
            </div>
          </dl>
        </div>

        <div class="rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
          <h2 class="mb-3 font-semibold">积分汇总</h2>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="item in summaryItems" :key="item.label" class="rounded-md bg-[var(--bg-tertiary)] p-3">
              <div class="text-xs text-[var(--text-secondary)]">{{ item.label }}</div>
              <div class="mt-1 text-lg font-semibold">{{ item.value }}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="mb-4 grid gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:grid-cols-[160px_160px_auto]">
        <n-select v-model:value="filters.type" :options="typeOptionsWithAll" placeholder="类型" clearable />
        <n-select v-model:value="filters.direction" :options="directionOptionsWithAll" placeholder="方向" clearable />
        <n-button type="primary" :loading="transactionsLoading" @click="handleSearch">查询</n-button>
      </section>

      <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div class="border-b border-[var(--border-color)] p-4">
          <h2 class="font-semibold">积分使用记录</h2>
        </div>
        <n-data-table
          :columns="columns"
          :data="transactions"
          :loading="transactionsLoading"
          :pagination="false"
          :row-key="row => row.id"
          size="small"
          striped
        />
        <div class="flex justify-end border-t border-[var(--border-color)] p-3">
          <n-pagination
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="total"
            :page-sizes="[10, 20, 50, 100]"
            show-size-picker
            @update:page="loadTransactions"
            @update:page-size="handlePageSizeChange"
          />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NDataTable, NPagination, NSelect, NTag } from 'naive-ui'
import AppHeader from '@/components/AppHeader.vue'
import { coinApi } from '@/api/backend'
import { currentUser, fetchProfile } from '@/stores/auth'

const router = useRouter()
const loading = ref(false)
const transactionsLoading = ref(false)
const balance = ref(null)
const summary = ref({})
const transactions = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const filters = reactive({
  type: null,
  direction: null
})

const typeOptions = [
  { label: '充值', value: 'recharge' },
  { label: '充值赠送', value: 'recharge_bonus' },
  { label: '卡密兑换', value: 'redeem' },
  { label: '赠送', value: 'gift' },
  { label: '注册赠送', value: 'register_gift' },
  { label: '消费', value: 'consume' },
  { label: '退款', value: 'refund' },
  { label: '管理员增加', value: 'adjust_add' },
  { label: '管理员扣减', value: 'adjust_deduct' },
  { label: '冻结', value: 'freeze' },
  { label: '解冻', value: 'unfreeze' },
  { label: '没收', value: 'forfeit' },
  { label: '过期', value: 'expire' },
  { label: '转入', value: 'transfer_in' },
  { label: '转出', value: 'transfer_out' },
  { label: '冲正', value: 'rollback' }
]
const directionOptions = [
  { label: '入账', value: 'in' },
  { label: '出账', value: 'out' }
]
const typeOptionsWithAll = [{ label: '全部类型', value: null }, ...typeOptions]
const directionOptionsWithAll = [{ label: '全部方向', value: null }, ...directionOptions]

const groupNames = computed(() => {
  const groups = currentUser.value?.userGroups || []
  if (!groups.length) return '-'
  return groups.map(group => group.name).filter(Boolean).join('、') || '-'
})

const balanceCards = computed(() => [
  {
    label: '可用积分',
    value: formatCoins(balance.value?.balance),
    extra: `冻结 ${formatCoins(balance.value?.coinsFrozen)}`
  },
  {
    label: '累计消费',
    value: formatCoins(balance.value?.totalConsumed),
    extra: `退款 ${formatCoins(balance.value?.totalRefunded)}`
  },
  {
    label: '累计获赠',
    value: formatCoins(balance.value?.totalGifted),
    extra: `充值 ${formatCoins(balance.value?.totalRecharged)}`
  },
  {
    label: '最近变动',
    value: formatDateTime(balance.value?.lastTransactionAt, '-'),
    extra: '积分流水实时记录'
  }
])

const summaryItems = computed(() => [
  { label: '充值入账', value: formatCoins(summary.value.recharge) },
  { label: '赠送积分', value: formatCoins(summary.value.gift) },
  { label: '生成消费', value: formatCoins(summary.value.consume) },
  { label: '失败退款', value: formatCoins(summary.value.refund) },
  { label: '人工调整', value: formatSignedCoins(summary.value.adjust) },
  { label: '冻结积分', value: formatCoins(summary.value.frozen) }
])

function optionLabel(options, value) {
  return options.find(item => item.value === value)?.label || value || '-'
}

function formatCoins(value) {
  return Number(value || 0).toFixed(2)
}

function formatSignedCoins(value) {
  const amount = Number(value || 0)
  if (amount > 0) return `+${amount.toFixed(2)}`
  return amount.toFixed(2)
}

function formatDateTime(value, fallback = '') {
  if (!value) return fallback
  return new Date(value).toLocaleString('zh-CN')
}

function statusLabel(value) {
  const labels = {
    active: '正常',
    pending_email: '待邮箱验证',
    disabled: '已禁用',
    banned: '已封禁'
  }
  return labels[value] || value || '-'
}

function businessLabel(row) {
  const projectName = row?.generation?.project?.name || row?.metadata?.project_name || ''
  const modelName = row?.generation?.model?.displayName
    || row?.generation?.model?.modelKey
    || row?.metadata?.model_display_name
    || row?.metadata?.model_key
    || ''
  return [projectName, modelName].filter(Boolean).join(' / ') || '-'
}

const columns = [
  {
    title: '时间',
    key: 'createdAt',
    minWidth: 160,
    render(row) {
      return formatDateTime(row.createdAt, '-')
    }
  },
  {
    title: '类型',
    key: 'type',
    width: 110,
    render(row) {
      return h(NTag, { size: 'small' }, { default: () => optionLabel(typeOptions, row.type) })
    }
  },
  {
    title: '方向',
    key: 'direction',
    width: 90,
    render(row) {
      return h(NTag, { size: 'small', type: row.direction === 'in' ? 'success' : 'warning' }, { default: () => optionLabel(directionOptions, row.direction) })
    }
  },
  {
    title: '金额',
    key: 'amount',
    width: 110,
    render(row) {
      const sign = row.direction === 'in' ? '+' : '-'
      return `${sign}${formatCoins(row.amount)}`
    }
  },
  {
    title: '变动后余额',
    key: 'balanceAfter',
    width: 130,
    render(row) {
      return formatCoins(row.balanceAfter)
    }
  },
  {
    title: '业务',
    key: 'business',
    minWidth: 180,
    ellipsis: { tooltip: true },
    render(row) {
      return businessLabel(row)
    }
  },
  {
    title: '说明',
    key: 'description',
    minWidth: 220,
    ellipsis: { tooltip: true },
    render(row) {
      return row.description || row.reason || '-'
    }
  }
]

async function loadSummary() {
  const data = await coinApi.summary()
  balance.value = data.balance || null
  summary.value = data.summary || {}
  window.dispatchEvent(new Event('doodle-balance-refresh'))
}

async function loadTransactions() {
  transactionsLoading.value = true
  try {
    const data = await coinApi.transactions({
      page: page.value,
      pageSize: pageSize.value,
      type: filters.type || undefined,
      direction: filters.direction || undefined
    })
    transactions.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载积分记录失败')
  } finally {
    transactionsLoading.value = false
  }
}

async function loadAccount() {
  loading.value = true
  try {
    await Promise.all([
      fetchProfile(),
      loadSummary(),
      loadTransactions()
    ])
  } catch (err) {
    window.$message?.error(err?.message || '加载用户中心失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  loadTransactions()
}

function handlePageSizeChange() {
  page.value = 1
  loadTransactions()
}

onMounted(loadAccount)
</script>
