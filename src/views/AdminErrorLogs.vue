<template>
  <AdminShell>
    <section class="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:flex-row md:items-center">
      <div>
        <h1 class="text-lg font-semibold">错误日志</h1>
        <p class="mt-1 text-sm text-[var(--text-secondary)]">记录接口错误、上游异常、超时和用户侧隐藏的详细错误信息。</p>
      </div>
      <div class="flex-1"></div>
      <n-input v-model:value="filters.keyword" class="md:max-w-xs" placeholder="搜索 request_id / 路径 / 内容" clearable @keydown.enter="loadLogs" />
      <n-select v-model:value="filters.level" class="md:max-w-[130px]" :options="levelOptions" placeholder="级别" clearable />
      <n-select v-model:value="filters.scope" class="md:max-w-[150px]" :options="scopeOptions" placeholder="来源" clearable />
      <n-button :loading="loading" @click="loadLogs">刷新</n-button>
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <n-data-table
        :columns="columns"
        :data="rows"
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
          @update:page="loadLogs"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </section>

    <n-drawer v-model:show="drawerVisible" width="760">
      <n-drawer-content title="错误详情" closable>
        <div v-if="selectedLog" class="space-y-4 text-sm">
          <div class="grid gap-3 md:grid-cols-2">
            <div><span class="text-[var(--text-secondary)]">请求 ID：</span>{{ selectedLog.requestId || '-' }}</div>
            <div><span class="text-[var(--text-secondary)]">时间：</span>{{ formatDate(selectedLog.createdAt) }}</div>
            <div><span class="text-[var(--text-secondary)]">级别：</span>{{ selectedLog.level }}</div>
            <div><span class="text-[var(--text-secondary)]">来源：</span>{{ scopeLabel(selectedLog.scope) }}</div>
            <div><span class="text-[var(--text-secondary)]">状态码：</span>{{ selectedLog.httpStatus || '-' }}</div>
            <div><span class="text-[var(--text-secondary)]">业务码：</span>{{ selectedLog.code || '-' }}</div>
            <div class="md:col-span-2"><span class="text-[var(--text-secondary)]">路径：</span>{{ selectedLog.method || '' }} {{ selectedLog.path || '-' }}</div>
            <div class="md:col-span-2"><span class="text-[var(--text-secondary)]">用户：</span>{{ selectedLog.userId || '-' }}</div>
          </div>

          <div>
            <div class="mb-1 font-medium">用户提示</div>
            <pre class="log-box">{{ selectedLog.publicMessage || '-' }}</pre>
          </div>
          <div>
            <div class="mb-1 font-medium">原始错误</div>
            <pre class="log-box">{{ selectedLog.message || '-' }}</pre>
          </div>
          <div>
            <div class="mb-1 font-medium">详情</div>
            <pre class="log-box">{{ stringify(selectedLog.details) }}</pre>
          </div>
          <div v-if="selectedLog.stack">
            <div class="mb-1 font-medium">堆栈</div>
            <pre class="log-box max-h-80 overflow-auto">{{ selectedLog.stack }}</pre>
          </div>
        </div>
        <template #footer>
          <div class="flex justify-end gap-2">
            <n-button @click="drawerVisible = false">关闭</n-button>
            <n-button v-if="selectedLog && !selectedLog.isResolved" type="primary" :loading="resolving" @click="resolveSelected">标记处理</n-button>
          </div>
        </template>
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
import { adminErrorLogApi } from '@/api/backend'

const loading = ref(false)
const resolving = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const drawerVisible = ref(false)
const selectedLog = ref(null)

const filters = reactive({
  keyword: '',
  level: null,
  scope: null
})

const levelOptions = [
  { label: '错误', value: 'error' },
  { label: '警告', value: 'warn' },
  { label: '信息', value: 'info' }
]

const scopeOptions = [
  { label: '用户接口', value: 'user_api' },
  { label: '管理接口', value: 'admin_api' }
]

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function scopeLabel(value) {
  return scopeOptions.find(item => item.value === value)?.label || value || '-'
}

function stringify(value) {
  if (!value) return '-'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const columns = [
  {
    title: '级别',
    key: 'level',
    width: 90,
    render(row) {
      const type = row.level === 'error' ? 'error' : row.level === 'warn' ? 'warning' : 'info'
      return h(NTag, { size: 'small', type }, { default: () => row.level })
    }
  },
  { title: '时间', key: 'createdAt', width: 170, render: row => formatDate(row.createdAt) },
  { title: '来源', key: 'scope', width: 100, render: row => scopeLabel(row.scope) },
  { title: '状态', key: 'httpStatus', width: 80, render: row => row.httpStatus || '-' },
  { title: '路径', key: 'path', minWidth: 240, ellipsis: { tooltip: true }, render: row => `${row.method || ''} ${row.path || '-'}` },
  { title: '用户提示', key: 'publicMessage', minWidth: 190, ellipsis: { tooltip: true }, render: row => row.publicMessage || '-' },
  { title: '原始错误', key: 'message', minWidth: 240, ellipsis: { tooltip: true } },
  {
    title: '处理',
    key: 'isResolved',
    width: 90,
    render(row) {
      return h(NTag, { size: 'small', type: row.isResolved ? 'success' : 'warning' }, { default: () => row.isResolved ? '已处理' : '待处理' })
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 110,
    fixed: 'right',
    render(row) {
      return h(NButton, { size: 'small', onClick: () => openDetail(row) }, { default: () => '查看' })
    }
  }
]

async function loadLogs() {
  loading.value = true
  try {
    const data = await adminErrorLogApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      level: filters.level || undefined,
      scope: filters.scope || undefined
    })
    rows.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载错误日志失败')
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadLogs()
}

async function openDetail(row) {
  try {
    const data = await adminErrorLogApi.detail(row.id)
    selectedLog.value = data.log || row
    drawerVisible.value = true
  } catch (err) {
    window.$message?.error(err?.message || '加载错误详情失败')
  }
}

async function resolveSelected() {
  if (!selectedLog.value) return
  resolving.value = true
  try {
    const data = await adminErrorLogApi.resolve(selectedLog.value.id)
    selectedLog.value = data.log
    window.$message?.success('已标记处理')
    await loadLogs()
  } catch (err) {
    window.$message?.error(err?.message || '标记失败')
  } finally {
    resolving.value = false
  }
}

onMounted(loadLogs)
</script>

<style scoped>
.log-box {
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-tertiary);
  padding: 10px;
  font-size: 12px;
  line-height: 1.5;
}
</style>
