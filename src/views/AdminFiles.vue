<template>
  <AdminShell>
    <section class="mb-4 grid gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:grid-cols-[1fr_170px_150px_auto]">
      <n-input v-model:value="filters.keyword" placeholder="搜索文件名、路径或 URL" clearable @keydown.enter="loadFiles" />
      <n-select v-model:value="filters.type" :options="typeOptionsWithAll" placeholder="类型" clearable />
      <n-select v-model:value="filters.status" :options="statusOptionsWithAll" placeholder="状态" clearable />
      <n-button type="primary" :loading="loading" @click="loadFiles">查询</n-button>
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <n-data-table
        :columns="columns"
        :data="files"
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
          @update:page="loadFiles"
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
  NPopconfirm,
  NSelect,
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminFileApi } from '@/api/backend'

const loading = ref(false)
const files = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const filters = reactive({
  keyword: '',
  type: null,
  status: null
})

const typeOptions = [
  { label: '上传', value: 'upload' },
  { label: '生成图片', value: 'generated_image' },
  { label: '生成视频', value: 'generated_video' },
  { label: '缩略图', value: 'thumbnail' }
]
const statusOptions = [
  { label: '正常', value: 'active' },
  { label: '已删除', value: 'deleted' },
  { label: '隔离', value: 'quarantined' }
]
const typeOptionsWithAll = [{ label: '全部类型', value: null }, ...typeOptions]
const statusOptionsWithAll = [{ label: '全部状态', value: null }, ...statusOptions]

function optionLabel(options, value) {
  return options.find(item => item.value === value)?.label || value || '-'
}

function typeTagType(value) {
  const map = {
    upload: 'default',
    generated_image: 'success',
    generated_video: 'info',
    thumbnail: 'warning'
  }
  return map[value] || 'default'
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function formatSize(value) {
  const size = Number(value || 0)
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

function isImage(row) {
  return String(row.mimeType || '').startsWith('image/') || row.type === 'generated_image' || row.type === 'thumbnail'
}

const columns = [
  {
    title: '预览',
    key: 'preview',
    width: 92,
    render(row) {
      if (row.status !== 'active' || !row.fileUrl) return '-'
      if (isImage(row)) {
        return h('a', { href: row.fileUrl, target: '_blank', rel: 'noreferrer' }, [
          h('img', {
            src: row.fileUrl,
            alt: row.fileName || row.storagePath,
            class: 'h-12 w-16 rounded object-cover border border-[var(--border-color)]'
          })
        ])
      }
      return h('a', {
        class: 'text-[var(--accent-color)] hover:underline',
        href: row.fileUrl,
        target: '_blank',
        rel: 'noreferrer'
      }, row.type === 'generated_video' ? '视频' : '打开')
    }
  },
  {
    title: '文件',
    key: 'fileName',
    minWidth: 220,
    ellipsis: { tooltip: true },
    render(row) {
      return row.fileName || row.storagePath
    }
  },
  {
    title: '类型',
    key: 'type',
    width: 110,
    render(row) {
      return h(NTag, { size: 'small', type: typeTagType(row.type) }, { default: () => optionLabel(typeOptions, row.type) })
    }
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      const type = row.status === 'active' ? 'success' : row.status === 'deleted' ? 'warning' : 'error'
      return h(NTag, { size: 'small', type }, { default: () => optionLabel(statusOptions, row.status) })
    }
  },
  {
    title: '大小',
    key: 'fileSize',
    width: 110,
    render(row) {
      return formatSize(row.fileSize)
    }
  },
  {
    title: '尺寸',
    key: 'dimensions',
    width: 110,
    render(row) {
      return row.width && row.height ? `${row.width}x${row.height}` : '-'
    }
  },
  {
    title: '用户',
    key: 'user',
    minWidth: 180,
    render(row) {
      return row.user ? `${row.user.username} / ${row.user.email}` : row.userId
    }
  },
  {
    title: '项目',
    key: 'project',
    minWidth: 160,
    render(row) {
      return row.generation?.project?.name || '-'
    }
  },
  {
    title: '生成记录',
    key: 'generation',
    minWidth: 190,
    ellipsis: { tooltip: true },
    render(row) {
      const record = row.generation
      if (!record) return '-'
      const modelName = record.model?.displayName || record.model?.modelKey || record.type
      return `${modelName} / ${record.status}`
    }
  },
  {
    title: '路径',
    key: 'storagePath',
    minWidth: 220,
    ellipsis: { tooltip: true }
  },
  {
    title: '创建时间',
    key: 'createdAt',
    width: 180,
    render(row) {
      return formatDateTime(row.createdAt)
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    fixed: 'right',
    render(row) {
      const actions = [
        h('a', {
          class: 'text-[var(--accent-color)] hover:underline',
          href: row.fileUrl,
          target: '_blank',
          rel: 'noreferrer'
        }, '打开')
      ]
      if (row.status === 'deleted') {
        actions.push(h(NPopconfirm, { onPositiveClick: () => restoreFile(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'success' }, { default: () => '恢复' }),
          default: () => '确定恢复该文件？'
        }))
      }
      return h('div', { class: 'flex items-center gap-2' }, actions)
    }
  }
]

async function loadFiles() {
  loading.value = true
  try {
    const data = await adminFileApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      type: filters.type || undefined,
      status: filters.status || undefined
    })
    files.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载文件失败')
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadFiles()
}

async function restoreFile(row) {
  try {
    await adminFileApi.restore(row.id)
    window.$message?.success('文件已恢复')
    await loadFiles()
  } catch (err) {
    window.$message?.error(err?.message || '恢复文件失败')
  }
}

onMounted(loadFiles)
</script>
