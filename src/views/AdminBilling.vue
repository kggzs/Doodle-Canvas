<template>
  <AdminShell>
    <section class="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:flex-row md:items-center">
      <n-select v-model:value="filters.model_id" class="md:max-w-sm" :options="modelOptionsWithAll" placeholder="模型" filterable clearable />
      <div class="flex-1"></div>
      <n-button :loading="loading" @click="loadRules">刷新</n-button>
      <n-button type="primary" @click="openCreate">新增规则</n-button>
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <n-data-table
        :columns="columns"
        :data="rules"
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
          @update:page="loadRules"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </section>

    <n-drawer v-model:show="drawerVisible" width="620">
      <n-drawer-content :title="editingId ? '编辑计费规则' : '新增计费规则'" closable>
        <n-form :model="form" label-placement="top">
          <n-form-item label="模型">
            <n-select v-model:value="form.model_id" :options="modelOptions" placeholder="选择模型" filterable :disabled="!!editingId" />
          </n-form-item>
          <div class="grid gap-3 md:grid-cols-2">
            <n-form-item label="固定金额">
              <n-input-number v-model:value="form.fixed_amount" :min="0" :step="0.1" />
            </n-form-item>
            <n-form-item label="启用">
              <n-switch v-model:value="form.is_active" />
            </n-form-item>
          </div>
        </n-form>

        <template #footer>
          <div class="flex justify-end gap-2">
            <n-button @click="drawerVisible = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="saveRule">保存</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </AdminShell>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref } from 'vue'
import {
  NButton,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInputNumber,
  NPagination,
  NPopconfirm,
  NSelect,
  NSwitch,
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminBillingApi, adminModelApi } from '@/api/backend'

const loading = ref(false)
const saving = ref(false)
const rules = ref([])
const models = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const drawerVisible = ref(false)
const editingId = ref('')

const filters = reactive({
  model_id: null
})

const form = reactive({
  model_id: null,
  fixed_amount: 0,
  is_active: true
})

const modelOptions = computed(() => models.value.map(item => ({
  label: `${item.displayName || item.modelKey} (${item.modelKey})`,
  value: item.id
})))
const modelOptionsWithAll = computed(() => [{ label: '全部模型', value: null }, ...modelOptions.value])

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function formatCoins(value) {
  return Number(value || 0).toFixed(2)
}

const columns = [
  {
    title: '模型',
    key: 'model',
    minWidth: 220,
    render(row) {
      return row.model?.displayName || row.model?.modelKey || row.modelId
    }
  },
  {
    title: '固定金额',
    key: 'fixedAmount',
    width: 120,
    render(row) {
      return formatCoins(row.fixedAmount)
    }
  },
  {
    title: '状态',
    key: 'isActive',
    width: 90,
    render(row) {
      return h(NTag, { size: 'small', type: row.isActive ? 'success' : 'warning' }, { default: () => row.isActive ? '启用' : '停用' })
    }
  },
  {
    title: '更新时间',
    key: 'updatedAt',
    width: 180,
    render(row) {
      return formatDateTime(row.updatedAt)
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    fixed: 'right',
    render(row) {
      return h('div', { class: 'flex gap-2' }, [
        h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
        h(NPopconfirm, { onPositiveClick: () => removeRule(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => '删除' }),
          default: () => '确定删除该计费规则？'
        })
      ])
    }
  }
]

async function loadModels() {
  const data = await adminModelApi.list({ pageSize: 100 })
  models.value = data.items || []
}

async function loadRules() {
  loading.value = true
  try {
    const data = await adminBillingApi.rules({
      page: page.value,
      pageSize: pageSize.value,
      model_id: filters.model_id || undefined
    })
    rules.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载计费规则失败')
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadRules()
}

function resetForm() {
  Object.assign(form, {
    model_id: null,
    fixed_amount: 0,
    is_active: true
  })
}

function openCreate() {
  editingId.value = ''
  resetForm()
  drawerVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  Object.assign(form, {
    model_id: row.modelId,
    fixed_amount: Number(row.fixedAmount || 0),
    is_active: !!row.isActive
  })
  drawerVisible.value = true
}

async function saveRule() {
  if (!form.model_id) {
    window.$message?.warning('请选择模型')
    return
  }

  const payload = {
    model_id: form.model_id,
    rule_type: 'fixed',
    fixed_amount: form.fixed_amount || 0,
    is_active: form.is_active
  }

  saving.value = true
  try {
    if (editingId.value) {
      await adminBillingApi.updateRule(editingId.value, payload)
      window.$message?.success('计费规则已更新')
    } else {
      await adminBillingApi.createRule(payload)
      window.$message?.success('计费规则已保存')
    }
    drawerVisible.value = false
    await loadRules()
  } catch (err) {
    window.$message?.error(err?.message || '保存计费规则失败')
  } finally {
    saving.value = false
  }
}

async function removeRule(row) {
  try {
    await adminBillingApi.removeRule(row.id)
    window.$message?.success('计费规则已删除')
    await loadRules()
  } catch (err) {
    window.$message?.error(err?.message || '删除计费规则失败')
  }
}

onMounted(async () => {
  await loadModels()
  await loadRules()
})
</script>
