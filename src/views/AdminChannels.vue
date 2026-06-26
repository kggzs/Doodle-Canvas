<template>
  <AdminShell>
    <n-tabs v-model:value="activeType" class="mb-4" type="segment" animated>
      <n-tab-pane v-for="item in typeOptions" :key="item.value" :name="item.value" :tab="item.label" />
    </n-tabs>

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
            <n-form-item label="渠道用途">
              <n-select v-model:value="form.model_type" :options="typeOptions" />
            </n-form-item>
          </div>
          <n-form-item label="Base URL">
            <n-input v-model:value="form.api_base_url" :placeholder="apiBaseUrlPlaceholder" />
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
import { computed, h, onMounted, reactive, ref, watch } from 'vue'
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
import { adminChannelApi } from '@/api/backend'
import { getProviderConfig } from '@/config/providers'
import { useModelStore } from '@/stores/pinia'

const providerOptions = [
  { label: 'OpenAI 兼容', value: 'openai' },
  { label: '阿里云万相', value: 'aliyun' },
  { label: '豆包', value: 'doubao' },
  { label: '阶跃星辰', value: 'stepfun' },
  { label: 'Agnes AI', value: 'agnes' },
  { label: '腾讯混元', value: 'hunyuan' },
  { label: '自定义', value: 'custom' }
]
const providerDefaultBaseUrls = {
  aliyun: getProviderConfig('aliyun').defaultBaseUrl,
  doubao: getProviderConfig('doubao').defaultBaseUrl,
  stepfun: getProviderConfig('stepfun').defaultBaseUrl,
  agnes: getProviderConfig('agnes').defaultBaseUrl,
  hunyuan: getProviderConfig('hunyuan').defaultBaseUrl
}
const endpointKeysByType = {
  chat: ['chat'],
  image: ['image', 'imageEdit', 'imageLite', 'imageQuery'],
  video: ['video', 'videoQuery']
}
const typeOptions = [
  { label: '问答模型', value: 'chat' },
  { label: '图片生成模型', value: 'image' },
  { label: '视频生成模型', value: 'video' }
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
const modelStore = useModelStore()
const activeType = ref('chat')

const filters = reactive({
  keyword: '',
  provider_type: null,
  is_active: null
})

const form = reactive({
  name: '',
  provider_type: 'openai',
  model_type: 'chat',
  api_base_url: '',
  api_key: '',
  is_active: true,
  priority: 0,
  weight: 1,
  timeout_ms: 60000
})

const apiBaseUrlPlaceholder = computed(() => providerDefaultBaseUrls[form.provider_type] || 'https://api.example.com')

function providerLabel(value) {
  return providerOptions.find(item => item.value === value)?.label || value
}

function typeLabel(value) {
  return typeOptions.find(item => item.value === value)?.label || value
}

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function isKnownProviderDefaultBaseUrl(value) {
  const normalized = normalizeBaseUrl(value)
  if (!normalized) return false
  return Object.values(providerDefaultBaseUrls).some(defaultBaseUrl => normalizeBaseUrl(defaultBaseUrl) === normalized)
}

function applyProviderDefaultBaseUrl() {
  const defaultBaseUrl = providerDefaultBaseUrls[form.provider_type]
  if (!defaultBaseUrl) {
    if (isKnownProviderDefaultBaseUrl(form.api_base_url)) {
      form.api_base_url = ''
    }
    return
  }
  if (!form.api_base_url || isKnownProviderDefaultBaseUrl(form.api_base_url)) {
    form.api_base_url = defaultBaseUrl
  }
}

function normalizeApiPath(value) {
  const path = String(value || '').trim()
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path.replace(/\/+$/, '')
  return path.startsWith('/') ? path : `/${path}`
}

function providerDefaultEndpoints(providerType, modelType = form.model_type) {
  if (providerType === 'custom') return {}
  const endpoints = getProviderConfig(providerType).endpoints || {}
  return Object.fromEntries(
    (endpointKeysByType[modelType] || [])
      .map(key => [key, endpoints[key]])
      .filter(([, value]) => value && value !== '暂不支持')
  )
}

function isKnownProviderDefaultEndpoint(value) {
  const normalized = normalizeApiPath(value)
  if (!normalized) return false
  return providerOptions.some((provider) =>
    Object.values(providerDefaultEndpoints(provider.value, form.model_type))
      .some(endpoint => normalizeApiPath(endpoint) === normalized)
  )
}

function parseConfigTextSilently() {
  if (!configText.value.trim()) return {}
  try {
    return JSON.parse(configText.value)
  } catch {
    return null
  }
}

function applyProviderDefaultConfig() {
  const defaultEndpoints = providerDefaultEndpoints(form.provider_type)
  const current = parseConfigTextSilently()
  if (!current) return

  const nextEndpoints = { ...(current.endpoints || {}) }
  if (Object.keys(defaultEndpoints).length) {
    for (const [key, endpoint] of Object.entries(defaultEndpoints)) {
      if (!nextEndpoints[key] || isKnownProviderDefaultEndpoint(nextEndpoints[key])) {
        nextEndpoints[key] = endpoint
      }
    }
  } else {
    for (const key of Object.keys(nextEndpoints)) {
      if (isKnownProviderDefaultEndpoint(nextEndpoints[key])) {
        delete nextEndpoints[key]
      }
    }
  }

  const nextConfig = { ...current }
  if (Object.keys(nextEndpoints).length) {
    nextConfig.endpoints = nextEndpoints
  } else {
    delete nextConfig.endpoints
  }

  const nextText = Object.keys(nextConfig).length ? JSON.stringify(nextConfig, null, 2) : ''
  if (nextText !== configText.value) {
    configText.value = nextText
  }
}

function applyProviderDefaults() {
  applyProviderDefaultBaseUrl()
  applyProviderDefaultConfig()
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
  {
    title: '用途',
    key: 'modelType',
    width: 120,
    render(row) {
      return h(NTag, { size: 'small' }, { default: () => typeLabel(row.modelType || row.model_type) })
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
      model_type: activeType.value,
      is_active: filters.is_active ?? undefined
    })
    channels.value = data.items || []
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(formatApiError(err, '加载渠道失败'))
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
    model_type: activeType.value,
    api_base_url: '',
    api_key: '',
    is_active: true,
    priority: 0,
    weight: 1,
    timeout_ms: 60000
  })
  configText.value = ''
  applyProviderDefaults()
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
    model_type: row.modelType || row.model_type || activeType.value,
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

function formatApiError(err, fallback) {
  const firstFieldError = Array.isArray(err?.errors) ? err.errors[0] : null
  return firstFieldError?.msg || err?.message || fallback
}

async function refreshPublicModels() {
  try {
    await modelStore.loadPublicModels()
  } catch {
    // 渠道管理保存成功即可，公开模型缓存失败时由用户侧页面下次进入重拉。
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
    await refreshPublicModels()
  } catch (err) {
    window.$message?.error(formatApiError(err, '保存渠道失败'))
  } finally {
    saving.value = false
  }
}

async function testChannel(row) {
  try {
    const result = await adminChannelApi.test(row.id)
    window.$message?.[result.ok ? 'success' : 'warning'](`${result.message} (${result.latencyMs}ms)`)
  } catch (err) {
    window.$message?.error(formatApiError(err, '渠道测试失败'))
  }
}

async function deleteChannel(row) {
  try {
    await adminChannelApi.remove(row.id)
    window.$message?.success('渠道已删除')
    await loadChannels()
    await refreshPublicModels()
  } catch (err) {
    window.$message?.error(formatApiError(err, '删除失败'))
  }
}

watch(activeType, () => {
  page.value = 1
  loadChannels()
})

watch(() => form.provider_type, () => {
  applyProviderDefaults()
})

watch(() => form.model_type, () => {
  applyProviderDefaultConfig()
})

onMounted(loadChannels)
</script>
