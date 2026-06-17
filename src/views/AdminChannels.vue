<template>
  <AdminShell>
    <section class="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:flex-row md:items-center">
      <n-input v-model:value="filters.keyword" class="md:max-w-xs" placeholder="搜索渠道名称" clearable @keydown.enter="loadChannels" />
      <n-select v-model:value="filters.provider_type" class="md:max-w-[180px]" :options="providerOptionsWithAll" placeholder="Provider" clearable />
      <n-select v-model:value="filters.is_active" class="md:max-w-[160px]" :options="activeOptionsWithAll" placeholder="状态" clearable />
      <div class="flex-1"></div>
      <n-button :loading="loading" @click="loadChannels">刷新</n-button>
      <n-button type="primary" @click="openCreate">新增渠道</n-button>
    </section>

    <section class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
      <n-data-table
        :columns="columns"
        :data="channels"
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
          @update:page="loadChannels"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </section>

    <n-drawer v-model:show="drawerVisible" width="560">
      <n-drawer-content :title="editingId ? '编辑渠道' : '新增渠道'" closable>
        <n-form :model="form" label-placement="top">
          <div class="grid grid-cols-2 gap-3">
            <n-form-item label="渠道名称">
              <n-input v-model:value="form.name" placeholder="OpenAI 主线路" />
            </n-form-item>
            <n-form-item label="Provider">
              <n-select v-model:value="form.provider_type" :options="providerOptions" />
            </n-form-item>
          </div>
          <n-form-item label="Base URL">
            <n-input v-model:value="form.api_base_url" placeholder="https://api.openai.com" />
          </n-form-item>
          <n-form-item label="API Key">
            <n-input v-model:value="form.api_key" type="password" show-password-on="click" :placeholder="editingId ? '留空则不修改' : '请输入 API Key'" />
          </n-form-item>
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <n-form-item label="启用">
              <n-switch v-model:value="form.is_active" />
            </n-form-item>
            <n-form-item label="优先级">
              <n-input-number v-model:value="form.priority" :min="0" />
            </n-form-item>
            <n-form-item label="权重">
              <n-input-number v-model:value="form.weight" :min="1" :max="100" />
            </n-form-item>
            <n-form-item label="超时(ms)">
              <n-input-number v-model:value="form.timeout_ms" :min="1000" :step="1000" />
            </n-form-item>
          </div>
          <n-form-item label="渠道配置 JSON">
            <n-input v-model:value="configText" type="textarea" :autosize="{ minRows: 5, maxRows: 10 }" placeholder='{"endpoints":{"chat":"/v1/chat/completions"}}' />
          </n-form-item>
        </n-form>
        <template #footer>
          <div class="flex justify-end gap-2">
            <n-button @click="drawerVisible = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="saveChannel">保存</n-button>
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
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminChannelApi } from '@/api/backend'

const providerOptions = [
  { label: 'OpenAI 兼容', value: 'openai' },
  { label: '阿里云万相', value: 'aliyun' },
  { label: '豆包', value: 'doubao' },
  { label: '自定义', value: 'custom' }
]
const providerOptionsWithAll = [{ label: '全部 Provider', value: null }, ...providerOptions]
const activeOptionsWithAll = [
  { label: '全部状态', value: null },
  { label: '启用', value: true },
  { label: '停用', value: false }
]

const channels = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const saving = ref(false)
const drawerVisible = ref(false)
const editingId = ref('')
const configText = ref('')

const filters = reactive({
  keyword: '',
  provider_type: null,
  is_active: null
})

const form = reactive({
  name: '',
  provider_type: 'openai',
  api_base_url: '',
  api_key: '',
  is_active: true,
  priority: 0,
  weight: 1,
  timeout_ms: 60000
})

function providerLabel(value) {
  return providerOptions.find(item => item.value === value)?.label || value
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

const columns = [
  { title: '名称', key: 'name', minWidth: 160 },
  {
    title: 'Provider',
    key: 'providerType',
    width: 130,
    render(row) {
      return h(NTag, { size: 'small' }, { default: () => providerLabel(row.providerType) })
    }
  },
  { title: 'Base URL', key: 'apiBaseUrl', minWidth: 260, ellipsis: { tooltip: true } },
  {
    title: '状态',
    key: 'isActive',
    width: 90,
    render(row) {
      return h(NTag, { size: 'small', type: row.isActive ? 'success' : 'warning' }, { default: () => row.isActive ? '启用' : '停用' })
    }
  },
  { title: '优先级', key: 'priority', width: 80 },
  { title: '权重', key: 'weight', width: 70 },
  {
    title: '熔断',
    key: 'circuitOpen',
    width: 80,
    render(row) {
      return h(NTag, { size: 'small', type: row.circuitOpen ? 'error' : 'success' }, { default: () => row.circuitOpen ? '打开' : '正常' })
    }
  },
  {
    title: '请求/成功/失败',
    key: 'stats',
    width: 140,
    render(row) {
      return `${row.totalRequests || 0}/${row.successCount || 0}/${row.failCount || 0}`
    }
  },
  {
    title: '最后使用',
    key: 'lastUsedAt',
    width: 170,
    render(row) {
      return formatDateTime(row.lastUsedAt)
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
        h(NButton, { size: 'small', onClick: () => testChannel(row) }, { default: () => '测试' }),
        h(NPopconfirm, { onPositiveClick: () => deleteChannel(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => '删除' }),
          default: () => '确定删除该渠道？已绑定模型会同步移除绑定关系。'
        })
      ])
    }
  }
]

async function loadChannels() {
  loading.value = true
  try {
    const data = await adminChannelApi.list({
      page: page.value,
      pageSize: pageSize.value,
      keyword: filters.keyword || undefined,
      provider_type: filters.provider_type || undefined,
      is_active: filters.is_active ?? undefined
    })
    channels.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(err?.message || '加载渠道失败')
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadChannels()
}

function resetForm() {
  Object.assign(form, {
    name: '',
    provider_type: 'openai',
    api_base_url: '',
    api_key: '',
    is_active: true,
    priority: 0,
    weight: 1,
    timeout_ms: 60000
  })
  configText.value = ''
}

function openCreate() {
  editingId.value = ''
  resetForm()
  drawerVisible.value = true
}

function openEdit(row) {
  editingId.value = row.id
  Object.assign(form, {
    name: row.name,
    provider_type: row.providerType,
    api_base_url: row.apiBaseUrl,
    api_key: '',
    is_active: !!row.isActive,
    priority: row.priority || 0,
    weight: row.weight || 1,
    timeout_ms: row.timeoutMs || 60000
  })
  configText.value = row.config ? JSON.stringify(row.config, null, 2) : ''
  drawerVisible.value = true
}

function parseConfig() {
  if (!configText.value.trim()) return null
  try {
    return JSON.parse(configText.value)
  } catch {
    window.$message?.error('渠道配置 JSON 格式不正确')
    return undefined
  }
}

async function saveChannel() {
  const config = parseConfig()
  if (config === undefined) return
  if (!form.name || !form.provider_type || !form.api_base_url) {
    window.$message?.warning('请填写渠道名称、Provider 和 Base URL')
    return
  }
  if (!editingId.value && !form.api_key) {
    window.$message?.warning('新增渠道必须填写 API Key')
    return
  }

  saving.value = true
  try {
    const payload = { ...form, config }
    if (editingId.value && !payload.api_key) delete payload.api_key
    if (editingId.value) {
      await adminChannelApi.update(editingId.value, payload)
      window.$message?.success('渠道已更新')
    } else {
      await adminChannelApi.create(payload)
      window.$message?.success('渠道已创建')
    }
    drawerVisible.value = false
    await loadChannels()
  } catch (err) {
    window.$message?.error(err?.message || '保存渠道失败')
  } finally {
    saving.value = false
  }
}

async function testChannel(row) {
  try {
    const result = await adminChannelApi.test(row.id)
    window.$message?.[result.ok ? 'success' : 'warning'](`${result.message} (${result.latencyMs}ms)`)
  } catch (err) {
    window.$message?.error(err?.message || '渠道测试失败')
  }
}

async function deleteChannel(row) {
  try {
    await adminChannelApi.remove(row.id)
    window.$message?.success('渠道已删除')
    loadChannels()
  } catch (err) {
    window.$message?.error(err?.message || '删除失败')
  }
}

onMounted(loadChannels)
</script>
