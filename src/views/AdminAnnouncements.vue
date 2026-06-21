<template>
  <AdminShell>
    <section class="mb-4 grid gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:grid-cols-[1fr_160px_auto_auto]">
      <n-input v-model:value="filters.keyword" placeholder="搜索标题或内容" clearable @keydown.enter="loadAnnouncements" />
      <n-select v-model:value="filters.status" :options="statusOptionsWithAll" placeholder="状态" clearable />
      <n-button type="primary" :loading="loading" @click="loadAnnouncements">查询</n-button>
      <n-button type="success" @click="openEditor()">新增公告</n-button>
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <n-data-table
        :columns="columns"
        :data="announcements"
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
          @update:page="loadAnnouncements"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </section>

    <n-modal v-model:show="editorVisible" preset="card" class="max-w-2xl" :title="editingId ? '编辑公告' : '新增公告'">
      <n-form :model="form" label-placement="top">
        <n-form-item label="标题">
          <n-input v-model:value="form.title" maxlength="200" show-count />
        </n-form-item>
        <div class="grid gap-3 md:grid-cols-2">
          <n-form-item label="状态">
            <n-select v-model:value="form.status" :options="statusOptions" />
          </n-form-item>
          <n-form-item label="优先级">
            <n-input-number v-model:value="form.priority" class="w-full" />
          </n-form-item>
        </div>
        <n-form-item label="内容">
          <n-input v-model:value="form.content" type="textarea" :autosize="{ minRows: 8, maxRows: 16 }" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <n-button @click="editorVisible = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="saveAnnouncement">保存</n-button>
        </div>
      </template>
    </n-modal>
  </AdminShell>
</template>

<script setup>
import { h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPagination,
  NPopconfirm,
  NSelect,
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminAnnouncementApi } from '@/api/backend'

const loading = ref(false)
const saving = ref(false)
const announcements = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const editorVisible = ref(false)
const editingId = ref(null)

const filters = reactive({
  keyword: '',
  status: null
})

const form = reactive({
  title: '',
  content: '',
  status: 'draft',
  priority: 0
})

const statusOptions = [
  { label: '草稿', value: 'draft' },
  { label: '已发布', value: 'published' },
  { label: '已归档', value: 'archived' }
]
const statusOptionsWithAll = [{ label: '全部状态', value: null }, ...statusOptions]

function statusLabel(value) {
  return statusOptions.find(item => item.value === value)?.label || value || '-'
}

function statusType(value) {
  if (value === 'published') return 'success'
  if (value === 'archived') return 'default'
  return 'warning'
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

const columns = [
  { title: '标题', key: 'title', minWidth: 220, ellipsis: { tooltip: true } },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render(row) {
      return h(NTag, { size: 'small', type: statusType(row.status) }, { default: () => statusLabel(row.status) })
    }
  },
  { title: '优先级', key: 'priority', width: 90 },
  {
    title: '发布时间',
    key: 'publishedAt',
    width: 180,
    render(row) {
      return formatDateTime(row.publishedAt)
    }
  },
  {
    title: '创建人',
    key: 'creator',
    width: 130,
    render(row) {
      return row.creator?.username || '-'
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    fixed: 'right',
    render(row) {
      return h('div', { class: 'flex gap-2' }, [
        h(NButton, { size: 'small', onClick: () => openEditor(row) }, { default: () => '编辑' }),
        h(NPopconfirm, { onPositiveClick: () => removeAnnouncement(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => '删除' }),
          default: () => '确定删除该公告？'
        })
      ])
    }
  }
]

function openEditor(row = null) {
  editingId.value = row?.id || null
  Object.assign(form, {
    title: row?.title || '',
    content: row?.content || '',
    status: row?.status || 'draft',
    priority: Number(row?.priority || 0)
  })
  editorVisible.value = true
}

async function loadAnnouncements() {
  loading.value = true
  try {
    const data = await adminAnnouncementApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      status: filters.status || undefined
    })
    announcements.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载公告失败')
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadAnnouncements()
}

async function saveAnnouncement() {
  if (!form.title.trim() || !form.content.trim()) {
    window.$message?.warning('请填写公告标题和内容')
    return
  }
  saving.value = true
  try {
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      status: form.status,
      priority: form.priority
    }
    if (editingId.value) {
      await adminAnnouncementApi.update(editingId.value, payload)
      window.$message?.success('公告已更新')
    } else {
      await adminAnnouncementApi.create(payload)
      window.$message?.success('公告已创建')
    }
    editorVisible.value = false
    await loadAnnouncements()
  } catch (err) {
    window.$message?.error(err?.message || '保存公告失败')
  } finally {
    saving.value = false
  }
}

async function removeAnnouncement(row) {
  try {
    await adminAnnouncementApi.remove(row.id)
    window.$message?.success('公告已删除')
    await loadAnnouncements()
  } catch (err) {
    window.$message?.error(err?.message || '删除公告失败')
  }
}

onMounted(loadAnnouncements)
</script>
