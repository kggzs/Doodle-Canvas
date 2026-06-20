<template>
  <AdminShell>
    <section class="mb-4 grid gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:grid-cols-[1fr_150px_auto_auto]">
      <n-input v-model:value="filters.keyword" placeholder="搜索名称或编码" clearable @keydown.enter="loadGroups" />
      <n-select v-model:value="filters.is_active" :options="activeOptionsWithAll" placeholder="状态" clearable />
      <n-button :loading="loading" @click="loadGroups">查询</n-button>
      <n-button type="primary" @click="openCreate">新建用户组</n-button>
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <n-data-table
        :columns="columns"
        :data="groups"
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
          @update:page="loadGroups"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </section>

    <n-drawer v-model:show="drawerVisible" width="560">
      <n-drawer-content :title="editingId ? '编辑用户组' : '新建用户组'" closable>
        <n-form :model="form" label-placement="top">
          <div class="grid grid-cols-2 gap-3">
            <n-form-item label="名称">
              <n-input v-model:value="form.name" />
            </n-form-item>
            <n-form-item label="编码">
              <n-input v-model:value="form.code" :disabled="!!editingId" />
            </n-form-item>
            <n-form-item label="模型价格倍率">
              <n-input-number v-model:value="form.cost_multiplier" :min="0" :step="0.01" />
            </n-form-item>
            <n-form-item label="优先级">
              <n-input-number v-model:value="form.priority" :min="0" :step="1" />
            </n-form-item>
            <n-form-item label="每日生成限制">
              <n-input-number v-model:value="form.daily_generate_limit" :min="0" :step="1" />
            </n-form-item>
            <n-form-item label="徽章颜色">
              <n-color-picker v-model:value="form.badge_color" :show-alpha="false" />
            </n-form-item>
            <n-form-item label="默认组">
              <n-switch v-model:value="form.is_default" />
            </n-form-item>
            <n-form-item label="启用">
              <n-switch v-model:value="form.is_active" />
            </n-form-item>
          </div>
          <n-form-item label="描述">
            <n-input v-model:value="form.description" type="textarea" />
          </n-form-item>
        </n-form>
        <div class="flex justify-end gap-2">
          <n-button @click="drawerVisible = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="saveGroup">保存</n-button>
        </div>
      </n-drawer-content>
    </n-drawer>
  </AdminShell>
</template>

<script setup>
import { h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NColorPicker,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NPagination,
  NPopconfirm,
  NSelect,
  NSwitch,
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminUserGroupApi } from '@/api/backend'

const loading = ref(false)
const saving = ref(false)
const drawerVisible = ref(false)
const groups = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const editingId = ref('')

const filters = reactive({
  keyword: '',
  is_active: null
})

const form = reactive(defaultForm())

const activeOptions = [
  { label: '启用', value: true },
  { label: '停用', value: false }
]
const activeOptionsWithAll = [{ label: '全部状态', value: null }, ...activeOptions]

function defaultForm() {
  return {
    name: '',
    code: '',
    description: '',
    is_default: false,
    cost_multiplier: 1,
    daily_generate_limit: 0,
    priority: 0,
    badge_color: '#18a058',
    is_active: true
  }
}

function resetForm(row = null) {
  Object.assign(form, row ? {
    name: row.name,
    code: row.code,
    description: row.description || '',
    is_default: !!row.isDefault,
    cost_multiplier: Number(row.costMultiplier ?? 1),
    daily_generate_limit: Number(row.dailyGenerateLimit ?? 0),
    priority: Number(row.priority ?? 0),
    badge_color: row.badgeColor || '#18a058',
    is_active: !!row.isActive
  } : defaultForm())
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2)
}

function formatApiError(err, fallback) {
  const firstFieldError = Array.isArray(err?.errors) ? err.errors[0] : null
  return firstFieldError?.msg || err?.message || fallback
}

const columns = [
  { title: '名称', key: 'name', minWidth: 130 },
  { title: '编码', key: 'code', minWidth: 120 },
  {
    title: '状态',
    key: 'isActive',
    width: 110,
    render(row) {
      return h('div', { class: 'flex gap-1' }, [
        h(NTag, { size: 'small', type: row.isActive ? 'success' : 'default' }, { default: () => row.isActive ? '启用' : '停用' }),
        row.isDefault ? h(NTag, { size: 'small', type: 'info' }, { default: () => '默认' }) : null
      ])
    }
  },
  { title: '成员数', key: 'memberCount', width: 90 },
  {
    title: '计费',
    key: 'billing',
    minWidth: 210,
    render(row) {
      return `模型价格 x ${formatNumber(row.costMultiplier)}`
    }
  },
  {
    title: '限额',
    key: 'limits',
    minWidth: 140,
    render(row) {
      return `日生成 ${row.dailyGenerateLimit || 0}`
    }
  },
  { title: '优先级', key: 'priority', width: 90 },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    fixed: 'right',
    render(row) {
      return h('div', { class: 'flex gap-2' }, [
        h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
        h(NPopconfirm, { onPositiveClick: () => deleteGroup(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true, disabled: row.isSystem || row.isDefault }, { default: () => '删除' }),
          default: () => '确定删除该用户组？'
        })
      ])
    }
  }
]

async function loadGroups() {
  loading.value = true
  try {
    const data = await adminUserGroupApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      is_active: filters.is_active === null ? undefined : filters.is_active
    })
    groups.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(formatApiError(err, '加载用户组失败'))
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadGroups()
}

function openCreate() {
  editingId.value = ''
  resetForm()
  drawerVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  resetForm(row)
  drawerVisible.value = true
}

async function saveGroup() {
  saving.value = true
  try {
    if (editingId.value) {
      await adminUserGroupApi.update(editingId.value, { ...form })
    } else {
      await adminUserGroupApi.create({ ...form })
    }
    window.$message?.success('已保存')
    drawerVisible.value = false
    await loadGroups()
  } catch (err) {
    window.$message?.error(formatApiError(err, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function deleteGroup(row) {
  try {
    await adminUserGroupApi.remove(row.id)
    window.$message?.success('已删除')
    await loadGroups()
  } catch (err) {
    window.$message?.error(formatApiError(err, '删除失败'))
  }
}

onMounted(loadGroups)
</script>
