<template>
  <AdminShell>
    <section class="mb-4 grid gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:grid-cols-[1fr_140px_140px_140px_auto]">
      <n-input v-model:value="filters.keyword" placeholder="搜索提示词或错误信息" clearable @keydown.enter="loadRecords" />
      <n-select v-model:value="filters.type" :options="typeOptionsWithAll" placeholder="类型" clearable />
      <n-select v-model:value="filters.status" :options="statusOptionsWithAll" placeholder="状态" clearable />
      <n-select v-model:value="filters.review_status" :options="reviewOptionsWithAll" placeholder="审核" clearable />
      <n-button type="primary" :loading="loading" @click="loadRecords">查询</n-button>
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <n-data-table
        :columns="columns"
        :data="records"
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
          @update:page="loadRecords"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </section>

    <n-drawer v-model:show="detailVisible" width="720">
      <n-drawer-content title="生成记录详情" closable>
        <div v-if="selectedRecord" class="space-y-4 text-sm">
          <section class="grid gap-3 md:grid-cols-2">
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">用户</div>
              <div class="mt-1">{{ selectedRecord.user?.username || '-' }} / {{ selectedRecord.user?.email || '-' }}</div>
            </div>
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">模型</div>
              <div class="mt-1">{{ selectedRecord.model?.displayName || selectedRecord.model?.modelKey || '-' }}</div>
            </div>
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">项目</div>
              <div class="mt-1">{{ selectedRecord.project?.name || '-' }}</div>
            </div>
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">状态</div>
              <div class="mt-1">{{ optionLabel(statusOptions, selectedRecord.status) }} / {{ optionLabel(reviewOptions, selectedRecord.reviewStatus) }}</div>
            </div>
            <div class="rounded-md border border-[var(--border-color)] p-3">
              <div class="text-[var(--text-secondary)]">费用</div>
              <div class="mt-1">{{ formatCoins(selectedRecord.costAmount) }} 金币</div>
            </div>
          </section>

          <section>
            <h3 class="mb-2 font-medium">提示词</h3>
            <pre class="max-h-40 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3 whitespace-pre-wrap">{{ selectedRecord.promptText || '-' }}</pre>
          </section>

          <section v-if="selectedRecord.errorMessage">
            <h3 class="mb-2 font-medium">错误信息</h3>
            <pre class="max-h-32 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3 whitespace-pre-wrap">{{ selectedRecord.errorMessage }}</pre>
          </section>

          <section>
            <h3 class="mb-2 font-medium">输入参数</h3>
            <pre class="max-h-56 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3">{{ stringifyJson(selectedRecord.inputParams) }}</pre>
          </section>

          <section>
            <h3 class="mb-2 font-medium">生成结果</h3>
            <pre class="max-h-56 overflow-auto rounded-md bg-[var(--bg-tertiary)] p-3">{{ stringifyJson(selectedRecord.result) }}</pre>
          </section>

          <section>
            <h3 class="mb-2 font-medium">关联文件</h3>
            <div class="space-y-2">
              <div
                v-for="file in selectedRecord.files || []"
                :key="file.id"
                class="flex items-center justify-between gap-3 rounded-md border border-[var(--border-color)] p-2"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <img
                    v-if="isImageFile(file)"
                    :src="file.fileUrl"
                    :alt="file.fileName || file.storagePath"
                    class="h-14 w-20 rounded border border-[var(--border-color)] object-cover"
                  />
                  <span class="truncate">{{ file.fileName || file.storagePath }}</span>
                </div>
                <a class="text-[var(--accent-color)] hover:underline" :href="file.fileUrl" target="_blank" rel="noreferrer">打开</a>
              </div>
              <n-empty v-if="!(selectedRecord.files || []).length" size="small" description="暂无文件" />
            </div>
          </section>

          <section v-if="resultMediaItems(selectedRecord).length">
            <h3 class="mb-2 font-medium">结果预览</h3>
            <div class="grid gap-3 md:grid-cols-2">
              <a
                v-for="item in resultMediaItems(selectedRecord)"
                :key="item.url"
                :href="item.url"
                target="_blank"
                rel="noreferrer"
                class="overflow-hidden rounded-md border border-[var(--border-color)]"
              >
                <img
                  v-if="item.kind === 'image'"
                  :src="item.url"
                  :alt="item.label"
                  class="h-44 w-full object-cover"
                />
                <div v-else class="flex h-28 items-center justify-center text-[var(--accent-color)]">打开视频</div>
                <div class="truncate border-t border-[var(--border-color)] px-3 py-2 text-xs text-[var(--text-secondary)]">{{ item.label }}</div>
              </a>
            </div>
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
  NEmpty,
  NInput,
  NPagination,
  NSelect,
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminRecordApi } from '@/api/backend'

const loading = ref(false)
const records = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const detailVisible = ref(false)
const selectedRecord = ref(null)

const filters = reactive({
  keyword: '',
  type: null,
  status: null,
  review_status: null
})

const typeOptions = [
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '问答', value: 'chat' }
]
const statusOptions = [
  { label: '排队中', value: 'pending' },
  { label: '处理中', value: 'processing' },
  { label: '已完成', value: 'completed' },
  { label: '失败', value: 'failed' },
  { label: '已取消', value: 'cancelled' }
]
const reviewOptions = [
  { label: '待审', value: 'pending' },
  { label: '通过', value: 'pass' },
  { label: '复审', value: 'review' },
  { label: '拒绝', value: 'reject' },
  { label: '隐藏', value: 'hidden' }
]
const typeOptionsWithAll = [{ label: '全部类型', value: null }, ...typeOptions]
const statusOptionsWithAll = [{ label: '全部状态', value: null }, ...statusOptions]
const reviewOptionsWithAll = [{ label: '全部审核', value: null }, ...reviewOptions]

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

function stringifyJson(value) {
  if (value === null || value === undefined || value === '') return '-'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const columns = [
  {
    title: '用户',
    key: 'user',
    minWidth: 190,
    render(row) {
      return row.user ? `${row.user.username} / ${row.user.email}` : row.userId
    }
  },
  {
    title: '类型',
    key: 'type',
    width: 90,
    render(row) {
      return h(NTag, { size: 'small' }, { default: () => optionLabel(typeOptions, row.type) })
    }
  },
  {
    title: '模型',
    key: 'model',
    minWidth: 170,
    render(row) {
      return row.model?.displayName || row.model?.modelKey || row.modelId
    }
  },
  {
    title: '项目',
    key: 'project',
    minWidth: 150,
    render(row) {
      return row.project?.name || '-'
    }
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      const type = row.status === 'completed' ? 'success' : row.status === 'failed' ? 'error' : 'warning'
      return h(NTag, { size: 'small', type }, { default: () => optionLabel(statusOptions, row.status) })
    }
  },
  {
    title: '审核',
    key: 'reviewStatus',
    width: 100,
    render(row) {
      const type = row.reviewStatus === 'pass' ? 'success' : row.reviewStatus === 'reject' ? 'error' : 'default'
      return h(NTag, { size: 'small', type }, { default: () => optionLabel(reviewOptions, row.reviewStatus) })
    }
  },
  {
    title: '费用',
    key: 'costAmount',
    width: 100,
    render(row) {
      return formatCoins(row.costAmount)
    }
  },
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
      return h(NButton, { size: 'small', onClick: () => openDetail(row.id) }, { default: () => '详情' })
    }
  }
]

function isImageFile(file) {
  return String(file?.mimeType || '').startsWith('image/') || file?.type === 'generated_image' || file?.type === 'thumbnail'
}

function resultMediaItems(record) {
  const result = record?.result || {}
  const items = []
  const images = Array.isArray(result.images) ? result.images : []
  for (const image of images) {
    if (image?.url) {
      items.push({
        kind: 'image',
        url: image.url,
        label: image.revisedPrompt || image.file_id || '生成图片'
      })
    }
  }
  const videoUrl = result.url || result.video_url || result.videoUrl
  if (videoUrl) {
    items.push({
      kind: 'video',
      url: videoUrl,
      label: '生成视频'
    })
  }
  return items
}

async function loadRecords() {
  loading.value = true
  try {
    const data = await adminRecordApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      type: filters.type || undefined,
      status: filters.status || undefined,
      review_status: filters.review_status || undefined
    })
    records.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载生成记录失败')
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadRecords()
}

async function openDetail(id) {
  try {
    const data = await adminRecordApi.detail(id)
    selectedRecord.value = data.record
    detailVisible.value = true
  } catch (err) {
    window.$message?.error(err?.message || '加载记录详情失败')
  }
}

onMounted(loadRecords)
</script>
