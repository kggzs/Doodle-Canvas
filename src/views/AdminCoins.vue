<template>
  <AdminShell>
    <section class="mb-4 grid gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:grid-cols-[1fr_150px_150px_auto]">
      <n-input v-model:value="filters.keyword" placeholder="搜索原因、引用类型或引用 ID" clearable @keydown.enter="loadTransactions" />
      <n-select v-model:value="filters.type" :options="typeOptionsWithAll" placeholder="类型" clearable />
      <n-select v-model:value="filters.direction" :options="directionOptionsWithAll" placeholder="方向" clearable />
      <n-button type="primary" :loading="loading" @click="loadTransactions">查询</n-button>
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <n-data-table
        :columns="columns"
        :data="transactions"
        :loading="loading"
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
  </AdminShell>
</template>

<script setup>
import { h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NDataTable,
  NInput,
  NPagination,
  NSelect,
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminCoinApi } from '@/api/backend'

const loading = ref(false)
const transactions = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const filters = reactive({
  keyword: '',
  type: null,
  direction: null
})

const typeOptions = [
  { label: '充值', value: 'recharge' },
  { label: '赠送', value: 'gift' },
  { label: '消费', value: 'consume' },
  { label: '退款', value: 'refund' },
  { label: '调整', value: 'adjust' },
  { label: '冻结', value: 'freeze' },
  { label: '解冻', value: 'unfreeze' },
  { label: '过期', value: 'expire' }
]
const directionOptions = [
  { label: '入账', value: 'in' },
  { label: '出账', value: 'out' }
]
const typeOptionsWithAll = [{ label: '全部类型', value: null }, ...typeOptions]
const directionOptionsWithAll = [{ label: '全部方向', value: null }, ...directionOptions]

function optionLabel(options, value) {
  return options.find(item => item.value === value)?.label || value || '-'
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function formatCoins(value) {
  return Number(value || 0).toFixed(2)
}

const columns = [
  {
    title: '用户',
    key: 'user',
    minWidth: 180,
    render(row) {
      return row.user ? `${row.user.username} / ${row.user.email}` : row.userId
    }
  },
  {
    title: '类型',
    key: 'type',
    width: 100,
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
      return formatCoins(row.amount)
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
  { title: '原因', key: 'reason', minWidth: 180 },
  { title: '操作人', key: 'operatorId', minWidth: 160 },
  {
    title: '时间',
    key: 'createdAt',
    width: 180,
    render(row) {
      return formatDateTime(row.createdAt)
    }
  }
]

async function loadTransactions() {
  loading.value = true
  try {
    const data = await adminCoinApi.transactions({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      type: filters.type || undefined,
      direction: filters.direction || undefined
    })
    transactions.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载金币流水失败')
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadTransactions()
}

onMounted(loadTransactions)
</script>
