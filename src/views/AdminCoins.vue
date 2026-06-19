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

    <n-drawer v-model:show="detailVisible" width="760">
      <n-drawer-content title="金币流水详情" closable>
        <div v-if="selectedTransaction" class="space-y-4 text-sm">
          <section class="grid gap-3 md:grid-cols-2">
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">用户</div>
              <div class="mt-1">{{ selectedTransaction.user?.username || '-' }} / {{ selectedTransaction.user?.email || '-' }}</div>
            </div>
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">流水号</div>
              <div class="mt-1 break-all">{{ selectedTransaction.txNo || selectedTransaction.id }}</div>
            </div>
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">变动</div>
              <div class="mt-1">{{ optionLabel(typeOptions, selectedTransaction.type) }} / {{ optionLabel(directionOptions, selectedTransaction.direction) }} / {{ formatCoins(selectedTransaction.amount) }} 金币</div>
            </div>
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">余额</div>
              <div class="mt-1">{{ formatCoins(selectedTransaction.balanceBefore) }} -> {{ formatCoins(selectedTransaction.balanceAfter) }}</div>
            </div>
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">项目</div>
              <div class="mt-1">{{ projectName(selectedTransaction) }}</div>
            </div>
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">模型</div>
              <div class="mt-1">{{ modelName(selectedTransaction) }}</div>
            </div>
          </section>

          <section>
            <h3 class="mb-2 font-medium">说明</h3>
            <pre class="max-h-28 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3 whitespace-pre-wrap">{{ selectedTransaction.description || selectedTransaction.reason || '-' }}</pre>
          </section>

          <section v-if="promptText(selectedTransaction)">
            <h3 class="mb-2 font-medium">提示词</h3>
            <pre class="max-h-36 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3 whitespace-pre-wrap">{{ promptText(selectedTransaction) }}</pre>
          </section>

          <section>
            <h3 class="mb-2 font-medium">生成记录</h3>
            <pre class="max-h-36 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3 whitespace-pre-wrap">{{ generationSummary(selectedTransaction) }}</pre>
          </section>

          <section>
            <h3 class="mb-2 font-medium">计费快照</h3>
            <pre class="max-h-56 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3">{{ stringifyJson(selectedTransaction.costSnapshot) }}</pre>
          </section>

          <section>
            <h3 class="mb-2 font-medium">元数据</h3>
            <pre class="max-h-56 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3">{{ stringifyJson(selectedTransaction.metadata) }}</pre>
          </section>
        </div>
      </n-drawer-content>
    </n-drawer>
  </AdminShell>
</template>

<script setup>
import { h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NDataTable,
  NDrawer,
  NDrawerContent,
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
const detailVisible = ref(false)
const selectedTransaction = ref(null)

const filters = reactive({
  keyword: '',
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

function projectName(row) {
  return row?.generation?.project?.name || row?.metadata?.project_name || '-'
}

function modelName(row) {
  return row?.generation?.model?.displayName
    || row?.generation?.model?.modelKey
    || row?.metadata?.model_display_name
    || row?.metadata?.model_key
    || '-'
}

function generationId(row) {
  return row?.generation?.id || row?.metadata?.generation_id || (row?.refType === 'generation' ? row?.refId : null)
}

function promptText(row) {
  return row?.generation?.promptText || row?.metadata?.prompt || ''
}

function generationSummary(row) {
  const generation = row?.generation
  if (!generation) return generationId(row) || '-'
  return [
    `记录 ID: ${generation.id}`,
    `状态: ${generation.status}`,
    `类型: ${generation.type}`,
    `渠道: ${generation.channel?.name || '-'}`,
    `文件数: ${(generation.files || []).length}`
  ].join('\n')
}

function stringifyJson(value) {
  if (value === null || value === undefined || value === '') return '-'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function openDetail(row) {
  selectedTransaction.value = row
  detailVisible.value = true
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
  {
    title: '业务详情',
    key: 'business',
    minWidth: 260,
    render(row) {
      const lines = [
        `项目：${projectName(row)}`,
        `模型：${modelName(row)}`
      ]
      const id = generationId(row)
      if (id) lines.push(`记录：${id}`)
      return h('div', { class: 'space-y-1 text-xs leading-5' }, lines.map(line => h('div', { class: 'truncate' }, line)))
    }
  },
  {
    title: '说明',
    key: 'reason',
    minWidth: 220,
    ellipsis: { tooltip: true },
    render(row) {
      return row.description || row.reason || '-'
    }
  },
  { title: '操作人', key: 'operatorId', minWidth: 160 },
  {
    title: '时间',
    key: 'createdAt',
    width: 180,
    render(row) {
      return formatDateTime(row.createdAt)
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    fixed: 'right',
    render(row) {
      return h(NButton, { size: 'small', onClick: () => openDetail(row) }, { default: () => '详情' })
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
