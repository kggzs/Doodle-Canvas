<template>
  <AdminShell>
    <section class="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:flex-row md:items-center">
      <n-input v-model:value="filters.keyword" class="md:max-w-xs" placeholder="搜索模型标识或名称" clearable @keydown.enter="loadModels" />
      <n-select v-model:value="filters.type" class="md:max-w-[160px]" :options="typeOptionsWithAll" placeholder="模型类型" clearable />
      <n-select v-model:value="filters.is_active" class="md:max-w-[160px]" :options="activeOptionsWithAll" placeholder="状态" clearable />
      <div class="flex-1"></div>
      <n-button :loading="loading" @click="loadModels">刷新</n-button>
      <n-button type="primary" @click="openCreate">新增模型</n-button>
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <n-data-table
        :columns="columns"
        :data="models"
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
          @update:page="loadModels"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </section>

    <n-drawer v-model:show="drawerVisible" width="680">
      <n-drawer-content :title="editingId ? '编辑模型' : '新增模型'" closable>
        <n-tabs type="line" animated>
          <n-tab-pane name="base" tab="基础配置">
            <n-form :model="form" label-placement="top">
              <div class="grid grid-cols-2 gap-3">
                <n-form-item label="模型标识">
                  <n-input v-model:value="form.model_key" placeholder="gpt-4o / wan2.7-image-pro" />
                </n-form-item>
                <n-form-item label="展示名称">
                  <n-input v-model:value="form.display_name" placeholder="GPT-4o" />
                </n-form-item>
                <n-form-item label="模型类型">
                  <n-select v-model:value="form.model_type" :options="typeOptions" />
                </n-form-item>
                <n-form-item label="排序">
                  <n-input-number v-model:value="form.sort_order" :min="0" />
                </n-form-item>
                <n-form-item label="启用">
                  <n-switch v-model:value="form.is_active" />
                </n-form-item>
              </div>
              <n-form-item label="描述">
                <n-input v-model:value="form.description" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
              </n-form-item>
              <n-form-item label="默认参数 JSON">
                <n-input v-model:value="defaultParamsText" type="textarea" :autosize="{ minRows: 5, maxRows: 10 }" placeholder='{"temperature":0.7,"max_tokens":4096}' />
              </n-form-item>
              <n-form-item label="参数限制 JSON">
                <n-input v-model:value="maxParamsText" type="textarea" :autosize="{ minRows: 4, maxRows: 8 }" placeholder='{"max_tokens":8192}' />
              </n-form-item>
            </n-form>
          </n-tab-pane>

          <n-tab-pane name="bindings" tab="渠道绑定" :disabled="!editingId">
            <div class="mb-3 rounded-md border border-[var(--border-color)] p-3">
              <div class="grid gap-3 md:grid-cols-[1fr_120px_170px_100px_auto]">
                <n-select v-model:value="bindingForm.channel_id" :options="channelOptions" placeholder="选择渠道" filterable />
                <n-input-number v-model:value="bindingForm.rotation_weight" :min="1" :max="10" placeholder="权重" />
                <n-select v-model:value="bindingForm.rotation_strategy" :options="rotationOptions" />
                <n-switch v-model:value="bindingForm.is_active" />
                <n-button type="primary" :disabled="!bindingForm.channel_id" @click="addBinding">添加绑定</n-button>
              </div>
            </div>

            <n-data-table
              :columns="bindingColumns"
              :data="bindings"
              :loading="bindingLoading"
              :pagination="false"
              :row-key="row => row.id"
              size="small"
            />
          </n-tab-pane>
        </n-tabs>

        <template #footer>
          <div class="flex justify-end gap-2">
            <n-button @click="drawerVisible = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="saveModel">保存</n-button>
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
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NPagination,
  NPopconfirm,
  NSelect,
  NSwitch,
  NTabPane,
  NTabs,
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminChannelApi, adminModelApi } from '@/api/backend'

const typeOptions = [
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '问答', value: 'chat' }
]
const typeOptionsWithAll = [{ label: '全部类型', value: null }, ...typeOptions]
const activeOptionsWithAll = [
  { label: '全部状态', value: null },
  { label: '启用', value: true },
  { label: '停用', value: false }
]
const rotationOptions = [
  { label: '轮询', value: 'round_robin' },
  { label: '加权随机', value: 'weighted_random' },
  { label: '优先级', value: 'priority' },
  { label: '故障转移', value: 'failover' }
]

const models = ref([])
const channels = ref([])
const channelOptions = ref([])
const bindings = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const saving = ref(false)
const bindingLoading = ref(false)
const drawerVisible = ref(false)
const editingId = ref('')
const defaultParamsText = ref('')
const maxParamsText = ref('')

const filters = reactive({
  keyword: '',
  type: null,
  is_active: null
})

const form = reactive({
  model_key: '',
  display_name: '',
  model_type: 'chat',
  is_active: true,
  sort_order: 0,
  description: ''
})

const bindingForm = reactive({
  channel_id: null,
  rotation_weight: 1,
  rotation_strategy: 'round_robin',
  is_active: true
})

function typeLabel(value) {
  return typeOptions.find(item => item.value === value)?.label || value
}

function rotationLabel(value) {
  return rotationOptions.find(item => item.value === value)?.label || value
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

const columns = [
  { title: '模型标识', key: 'modelKey', minWidth: 190, ellipsis: { tooltip: true } },
  { title: '展示名称', key: 'displayName', minWidth: 160 },
  {
    title: '类型',
    key: 'modelType',
    width: 90,
    render(row) {
      return h(NTag, { size: 'small' }, { default: () => typeLabel(row.modelType) })
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
  { title: '排序', key: 'sortOrder', width: 80 },
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
    width: 230,
    fixed: 'right',
    render(row) {
      return h('div', { class: 'flex gap-2' }, [
        h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
        h(NButton, { size: 'small', type: row.isActive ? 'warning' : 'success', onClick: () => toggleStatus(row) }, { default: () => row.isActive ? '停用' : '启用' }),
        h(NPopconfirm, { onPositiveClick: () => deleteModel(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => '删除' }),
          default: () => '确定删除该模型？绑定关系会一并删除。'
        })
      ])
    }
  }
]

const bindingColumns = [
  {
    title: '渠道',
    key: 'channel',
    minWidth: 180,
    render(row) {
      return row.channel?.name || row.channelId
    }
  },
  {
    title: 'Provider',
    key: 'provider',
    width: 110,
    render(row) {
      return row.channel?.providerType || '-'
    }
  },
  { title: '权重', key: 'rotationWeight', width: 80 },
  {
    title: '策略',
    key: 'rotationStrategy',
    width: 120,
    render(row) {
      return rotationLabel(row.rotationStrategy)
    }
  },
  {
    title: '状态',
    key: 'isActive',
    width: 80,
    render(row) {
      return h(NTag, { size: 'small', type: row.isActive ? 'success' : 'warning' }, { default: () => row.isActive ? '启用' : '停用' })
    }
  },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    render(row) {
      return h('div', { class: 'flex gap-2' }, [
        h(NButton, { size: 'small', onClick: () => toggleBinding(row) }, { default: () => row.isActive ? '停用' : '启用' }),
        h(NPopconfirm, { onPositiveClick: () => removeBinding(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => '移除' }),
          default: () => '确定移除此渠道绑定？'
        })
      ])
    }
  }
]

async function loadModels() {
  loading.value = true
  try {
    const data = await adminModelApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      type: filters.type || undefined,
      is_active: filters.is_active ?? undefined
    })
    models.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载模型失败')
  } finally {
    loading.value = false
  }
}

async function loadChannels() {
  const data = await adminChannelApi.list({ pageSize: 100, is_active: true })
  channels.value = data.items || []
  channelOptions.value = channels.value.map(item => ({
    label: `${item.name} (${item.providerType})`,
    value: item.id
  }))
}

function handlePageSizeChange() {
  page.value = 1
  loadModels()
}

function resetForm() {
  Object.assign(form, {
    model_key: '',
    display_name: '',
    model_type: 'chat',
    is_active: true,
    sort_order: 0,
    description: ''
  })
  defaultParamsText.value = ''
  maxParamsText.value = ''
  bindings.value = []
}

function openCreate() {
  editingId.value = ''
  resetForm()
  drawerVisible.value = true
}

async function openEdit(row) {
  editingId.value = row.id
  Object.assign(form, {
    model_key: row.modelKey,
    display_name: row.displayName,
    model_type: row.modelType,
    is_active: !!row.isActive,
    sort_order: row.sortOrder || 0,
    description: row.description || ''
  })
  defaultParamsText.value = row.defaultParams ? JSON.stringify(row.defaultParams, null, 2) : ''
  maxParamsText.value = row.maxParams ? JSON.stringify(row.maxParams, null, 2) : ''
  drawerVisible.value = true
  await loadBindings(row.id)
}

function parseJsonText(text, label) {
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    window.$message?.error(`${label} JSON 格式不正确`)
    return undefined
  }
}

async function saveModel() {
  const defaultParams = parseJsonText(defaultParamsText.value, '默认参数')
  if (defaultParams === undefined) return
  const maxParams = parseJsonText(maxParamsText.value, '参数限制')
  if (maxParams === undefined) return
  if (!form.model_key || !form.display_name || !form.model_type) {
    window.$message?.warning('请填写模型标识、展示名称和类型')
    return
  }

  saving.value = true
  try {
    const payload = {
      ...form,
      default_params: defaultParams,
      max_params: maxParams
    }
    if (editingId.value) {
      await adminModelApi.update(editingId.value, payload)
      window.$message?.success('模型已更新')
    } else {
      const created = await adminModelApi.create(payload)
      editingId.value = created.id
      window.$message?.success('模型已创建')
    }
    await loadModels()
  } catch (err) {
    window.$message?.error(err?.message || '保存模型失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row) {
  try {
    await adminModelApi.setStatus(row.id, !row.isActive)
    window.$message?.success('模型状态已更新')
    loadModels()
  } catch (err) {
    window.$message?.error(err?.message || '操作失败')
  }
}

async function deleteModel(row) {
  try {
    await adminModelApi.remove(row.id)
    window.$message?.success('模型已删除')
    loadModels()
  } catch (err) {
    window.$message?.error(err?.message || '删除失败')
  }
}

async function loadBindings(modelId = editingId.value) {
  if (!modelId) return
  bindingLoading.value = true
  try {
    const data = await adminModelApi.bindings(modelId)
    bindings.value = data.items || []
  } catch (err) {
    window.$message?.error(err?.message || '加载绑定失败')
  } finally {
    bindingLoading.value = false
  }
}

async function addBinding() {
  if (!editingId.value || !bindingForm.channel_id) return
  try {
    await adminModelApi.addBinding(editingId.value, { ...bindingForm })
    window.$message?.success('渠道已绑定')
    bindingForm.channel_id = null
    await loadBindings()
  } catch (err) {
    window.$message?.error(err?.message || '绑定失败')
  }
}

async function toggleBinding(row) {
  try {
    await adminModelApi.updateBinding(editingId.value, row.id, { is_active: !row.isActive })
    await loadBindings()
  } catch (err) {
    window.$message?.error(err?.message || '更新绑定失败')
  }
}

async function removeBinding(row) {
  try {
    await adminModelApi.removeBinding(editingId.value, row.id)
    window.$message?.success('绑定已移除')
    await loadBindings()
  } catch (err) {
    window.$message?.error(err?.message || '移除绑定失败')
  }
}

onMounted(async () => {
  await Promise.all([loadModels(), loadChannels()])
})
</script>
