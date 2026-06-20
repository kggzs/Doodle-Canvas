<template>
  <AdminShell>
    <section class="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 md:flex-row md:items-center">
      <div>
        <h1 class="text-lg font-semibold">{{ typeMeta.title }}</h1>
        <p class="mt-1 text-sm text-[var(--text-secondary)]">{{ typeMeta.description }}</p>
      </div>
      <div class="flex-1"></div>
      <n-input v-model:value="filters.keyword" class="md:max-w-xs" placeholder="搜索模型名称" clearable @keydown.enter="loadRows" />
      <n-select v-model:value="filters.is_active" class="md:max-w-[150px]" :options="activeOptions" placeholder="状态" clearable />
      <n-button :loading="loading" @click="loadRows">刷新</n-button>
      <n-button type="primary" @click="openCreate">新增{{ typeMeta.shortName }}</n-button>
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
          @update:page="loadRows"
          @update:page-size="handlePageSizeChange"
        />
      </div>
    </section>

    <n-drawer v-model:show="drawerVisible" width="760">
      <n-drawer-content :title="drawerTitle" closable>
        <n-form :model="form" label-placement="top">
          <div class="grid gap-3 md:grid-cols-2">
            <n-form-item label="用户显示模型名称">
              <n-input v-model:value="form.display_name" :disabled="channelOnlyMode" placeholder="例如：千问 Turbo / Doubao Seedream" />
            </n-form-item>
            <n-form-item label="调用模型名称">
              <n-input v-model:value="form.model_key" :disabled="channelOnlyMode" placeholder="例如：qwen-plus / doubao-seedream-3-0-t2i" />
            </n-form-item>
            <n-form-item label="渠道名称">
              <n-input v-model:value="form.channel_name" placeholder="例如：千问主线路" />
            </n-form-item>
            <n-form-item label="Provider">
              <n-select v-model:value="form.provider_type" :options="providerOptions" />
            </n-form-item>
            <n-form-item label="API 地址">
              <n-input
                v-model:value="form.api_base_url"
                :placeholder="apiBaseUrlPlaceholder"
                :input-props="inputProps.apiBaseUrl"
              />
            </n-form-item>
            <n-form-item label="API 路径">
              <n-input
                v-model:value="form.api_path"
                :placeholder="apiPathPlaceholder"
                :input-props="inputProps.apiPath"
              />
            </n-form-item>
            <n-form-item label="API Key">
              <n-input
                v-model:value="form.api_key"
                type="password"
                show-password-on="click"
                :placeholder="editingId ? '留空则不修改' : '请输入 API Key'"
                :input-props="inputProps.apiKey"
              />
            </n-form-item>
            <n-form-item label="每次消耗积分">
              <n-input-number v-model:value="form.fixed_amount" :min="typeMeta.minFixedAmount" :step="0.1" />
            </n-form-item>
            <n-form-item label="启用模型">
              <n-switch v-model:value="form.is_active" />
            </n-form-item>
            <n-form-item label="启用计费">
              <n-switch v-model:value="form.billing_active" />
            </n-form-item>
          </div>

          <n-form-item label="默认参数 JSON">
            <n-input
              v-model:value="defaultParamsText"
              type="textarea"
              :disabled="channelOnlyMode"
              :autosize="{ minRows: 4, maxRows: 8 }"
              :placeholder="typeMeta.defaultParamsPlaceholder"
            />
          </n-form-item>
        </n-form>

        <template #footer>
          <div class="flex justify-end gap-2">
            <n-button @click="drawerVisible = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="saveAll">保存</n-button>
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
  NTag
} from 'naive-ui'
import AdminShell from '@/components/AdminShell.vue'
import { adminBillingApi, adminChannelApi, adminModelApi } from '@/api/backend'
import { getProviderConfig } from '@/config/providers'
import { useModelStore } from '@/stores/pinia'

const props = defineProps({
  modelType: {
    type: String,
    required: true
  }
})

const TYPE_META = {
  chat: {
    title: '问答模型配置',
    shortName: '问答模型',
    description: '配置问答模型的 API 地址、路径、调用模型名称、前台显示名称和计费规则。',
    endpointKey: 'chat',
    minFixedAmount: 0,
    pathPlaceholder: '/v1/chat/completions 或 /compatible-mode/v1/chat/completions',
    defaultParamsPlaceholder: '{"temperature":0.7,"max_tokens":4096}'
  },
  image: {
    title: '图片生成模型配置',
    shortName: '图片生成模型',
    description: '配置图片生成模型的渠道、调用路径、模型名称和每次生成消耗积分。',
    endpointKey: 'image',
    minFixedAmount: 1,
    pathPlaceholder: '/v1/images/generations 或 /api/v3/images/generations',
    defaultParamsPlaceholder: '{"size":"1024x1024","quality":"standard"}'
  },
  video: {
    title: '视频生成模型配置',
    shortName: '视频生成模型',
    description: '配置视频模型的 API 地址、任务路径、调用模型名称和计费规则。',
    endpointKey: 'video',
    minFixedAmount: 0,
    pathPlaceholder: '/v1/videos 或 /services/aigc/video-generation/video-synthesis',
    defaultParamsPlaceholder: '{"ratio":"16:9","duration":5,"resolution":"720P"}'
  }
}

const typeMeta = computed(() => TYPE_META[props.modelType] || TYPE_META.chat)
const modelStore = useModelStore()

const providerOptions = [
  { label: 'OpenAI 兼容', value: 'openai' },
  { label: '阿里云/千问', value: 'aliyun' },
  { label: '豆包', value: 'doubao' },
  { label: '阶跃星辰', value: 'stepfun' },
  { label: 'Agnes AI', value: 'agnes' },
  { label: '自定义', value: 'custom' }
]
const providerDefaultBaseUrls = {
  aliyun: getProviderConfig('aliyun').defaultBaseUrl,
  doubao: getProviderConfig('doubao').defaultBaseUrl,
  stepfun: getProviderConfig('stepfun').defaultBaseUrl,
  agnes: getProviderConfig('agnes').defaultBaseUrl
}
const providerDefaultApiPathTypes = ['openai', 'aliyun', 'doubao', 'stepfun', 'agnes']
const activeOptions = [
  { label: '全部状态', value: null },
  { label: '启用', value: true },
  { label: '停用', value: false }
]

const loading = ref(false)
const saving = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const drawerVisible = ref(false)
const editingId = ref('')
const editingChannelId = ref('')
const editingBillingId = ref('')
const editingChannelConfig = ref({})
const channelOnlyMode = ref(false)
const defaultParamsText = ref('')

const filters = reactive({
  keyword: '',
  is_active: null
})

const form = reactive({
  display_name: '',
  model_key: '',
  channel_name: '',
  provider_type: 'openai',
  api_base_url: '',
  api_path: '',
  api_key: '',
  fixed_amount: 1,
  is_active: true,
  billing_active: true
})

const inputProps = {
  apiBaseUrl: {
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    name: 'model-api-base-url'
  },
  apiPath: {
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    name: 'model-api-endpoint-path'
  },
  apiKey: {
    autocomplete: 'new-password',
    autocapitalize: 'off',
    spellcheck: 'false',
    name: 'model-provider-api-key'
  }
}

const drawerTitle = computed(() => {
  if (channelOnlyMode.value) return `新增${typeMeta.value.shortName}线路`
  return editingId.value ? `编辑${typeMeta.value.shortName}` : `新增${typeMeta.value.shortName}`
})
const apiBaseUrlPlaceholder = computed(() => providerDefaultBaseUrls[form.provider_type] || 'https://api.example.com')
const apiPathPlaceholder = computed(() => providerDefaultApiPath(form.provider_type) || typeMeta.value.pathPlaceholder)

function providerLabel(value) {
  return providerOptions.find(item => item.value === value)?.label || value || '-'
}

function formatCoins(value) {
  return Number(value || 0).toFixed(2)
}

function effectiveFixedAmount(value) {
  const amount = Number(value ?? typeMeta.value.minFixedAmount ?? 0)
  if (props.modelType === 'image' && amount <= 0) return 1
  return amount
}

function endpointFromChannel(channel) {
  const config = channel?.config || {}
  const endpoints = config.endpoints || {}
  return endpoints[typeMeta.value.endpointKey] || ''
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

function formatApiError(err, fallback) {
  const firstFieldError = Array.isArray(err?.errors) ? err.errors[0] : null
  return firstFieldError?.msg || err?.message || fallback
}

function normalizeApiPath(value) {
  const path = String(value || '').trim()
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return path.startsWith('/') ? path : `/${path}`
}

function providerDefaultApiPath(providerType) {
  if (!providerDefaultApiPathTypes.includes(providerType)) return ''
  const endpoint = getProviderConfig(providerType).endpoints?.[typeMeta.value.endpointKey] || ''
  return endpoint && endpoint !== '暂不支持' ? endpoint : ''
}

function isKnownProviderDefaultApiPath(value) {
  const normalized = normalizeApiPath(value)
  if (!normalized) return false
  return providerOptions.some((provider) => {
    const endpoint = providerDefaultApiPath(provider.value)
    return endpoint && normalizeApiPath(endpoint) === normalized
  })
}

function applyProviderDefaultApiPath() {
  const defaultApiPath = providerDefaultApiPath(form.provider_type)
  if (!defaultApiPath) {
    if (isKnownProviderDefaultApiPath(form.api_path)) {
      form.api_path = ''
    }
    return
  }
  if (!form.api_path || isKnownProviderDefaultApiPath(form.api_path)) {
    form.api_path = defaultApiPath
  }
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

function applyProviderDefaults() {
  applyProviderDefaultBaseUrl()
  applyProviderDefaultApiPath()
}

function isValidApiPath(value) {
  const path = String(value || '').trim()
  if (!path) return false
  if (/^https?:\/\//i.test(path)) return true
  if (path.includes('@') || /\s/.test(path)) return false
  return /^\/?[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]+$/.test(path)
}

function stringifyJson(value) {
  if (!value) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

async function enrichModel(model) {
  const [bindingsData, billingData] = await Promise.all([
    adminModelApi.bindings(model.id).catch(() => ({ items: [] })),
    adminBillingApi.rules({ model_id: model.id, pageSize: 1 }).catch(() => ({ items: [] }))
  ])
  const binding = (bindingsData.items || []).find(item => item.channel?.modelType === props.modelType) || (bindingsData.items || [])[0] || null
  const billing = (billingData.items || [])[0] || null
  const typedBindings = (bindingsData.items || []).filter(item => item.channel?.modelType === props.modelType)
  return {
    ...model,
    bindings: typedBindings,
    binding,
    channel: binding?.channel || null,
    billing
  }
}

const columns = computed(() => [
  { title: '用户显示名称', key: 'displayName', minWidth: 180 },
  { title: '调用模型名称', key: 'modelKey', minWidth: 190, ellipsis: { tooltip: true } },
  {
    title: 'Provider',
    key: 'provider',
    width: 120,
    render(row) {
      return h(NTag, { size: 'small' }, { default: () => providerLabel(row.channel?.providerType) })
    }
  },
  { title: 'API 地址', key: 'apiBaseUrl', minWidth: 220, render: row => row.channel?.apiBaseUrl || '-' },
  { title: 'API 路径', key: 'apiPath', minWidth: 240, ellipsis: { tooltip: true }, render: row => endpointFromChannel(row.channel) || '-' },
  {
    title: '密钥状态',
    key: 'apiKeyStatus',
    width: 110,
    render(row) {
      const configured = row.channel?.apiKeyConfigured
      const valid = row.channel?.apiKeyValid
      if (!configured) {
        return h(NTag, { size: 'small', type: 'error' }, { default: () => '未保存' })
      }
      return h(
        NTag,
        { size: 'small', type: valid ? 'success' : 'error' },
        { default: () => valid ? '可解密' : '需重存' }
      )
    }
  },
  {
    title: '渠道数',
    key: 'channelCount',
    width: 90,
    render(row) {
      return `${row.bindings?.length || 0}`
    }
  },
  {
    title: '消耗积分',
    key: 'fixedAmount',
    width: 110,
    render(row) {
      return formatCoins(effectiveFixedAmount(row.billing?.fixedAmount))
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
    title: '操作',
    key: 'actions',
    width: 300,
    fixed: 'right',
    render(row) {
      return h('div', { class: 'flex gap-2' }, [
        h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => '编辑' }),
        h(NButton, { size: 'small', onClick: () => openAddChannel(row) }, { default: () => '新增线路' }),
        h(NButton, { size: 'small', type: row.isActive ? 'warning' : 'success', onClick: () => toggleStatus(row) }, { default: () => row.isActive ? '停用' : '启用' }),
        h(NPopconfirm, { onPositiveClick: () => deleteModel(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => '删除' }),
          default: () => '确定删除该模型？渠道不会自动删除，但绑定会被移除。'
        })
      ])
    }
  }
])

async function loadRows() {
  loading.value = true
  try {
    const data = await adminModelApi.list({
      page: page.value,
      pageSize: pageSize.value,
      type: props.modelType,
      keyword: filters.keyword || undefined,
      is_active: filters.is_active ?? undefined
    })
    rows.value = await Promise.all((data.items || []).map(enrichModel))
    total.value = data.total || 0
  } catch (err) {
    window.$message?.error(formatApiError(err, '加载模型配置失败'))
  } finally {
    loading.value = false
  }
}

function handlePageSizeChange() {
  page.value = 1
  loadRows()
}

function resetForm() {
  editingId.value = ''
  editingChannelId.value = ''
  editingBillingId.value = ''
  editingChannelConfig.value = {}
  channelOnlyMode.value = false
  Object.assign(form, {
    display_name: '',
    model_key: '',
    channel_name: '',
    provider_type: 'openai',
    api_base_url: '',
    api_path: '',
    api_key: '',
    fixed_amount: typeMeta.value.minFixedAmount,
    is_active: true,
    billing_active: true
  })
  applyProviderDefaults()
  defaultParamsText.value = ''
}

function openCreate() {
  resetForm()
  drawerVisible.value = true
}

function openEdit(row) {
  resetForm()
  editingId.value = row.id
  editingChannelId.value = row.channel?.id || ''
  editingBillingId.value = row.billing?.id || ''
  editingChannelConfig.value = row.channel?.config || {}
  Object.assign(form, {
    display_name: row.displayName || '',
    model_key: row.modelKey || '',
    channel_name: row.channel?.name || `${row.displayName || row.modelKey}渠道`,
    provider_type: row.channel?.providerType || 'openai',
    api_base_url: row.channel?.apiBaseUrl || '',
    api_path: endpointFromChannel(row.channel),
    api_key: '',
    fixed_amount: effectiveFixedAmount(row.billing?.fixedAmount),
    is_active: !!row.isActive,
    billing_active: row.billing ? !!row.billing.isActive : true
  })
  defaultParamsText.value = stringifyJson(row.defaultParams)
  drawerVisible.value = true
}

function openAddChannel(row) {
  resetForm()
  channelOnlyMode.value = true
  editingId.value = row.id
  editingBillingId.value = row.billing?.id || ''
  Object.assign(form, {
    display_name: row.displayName || '',
    model_key: row.modelKey || '',
    channel_name: `${row.displayName || row.modelKey}线路${(row.bindings?.length || 0) + 1}`,
    provider_type: 'openai',
    api_base_url: '',
    api_path: '',
    api_key: '',
    fixed_amount: effectiveFixedAmount(row.billing?.fixedAmount),
    is_active: true,
    billing_active: row.billing ? !!row.billing.isActive : true
  })
  applyProviderDefaults()
  defaultParamsText.value = stringifyJson(row.defaultParams)
  drawerVisible.value = true
}

function buildChannelConfig() {
  const current = editingChannelConfig.value || {}
  const endpoints = {
    ...(current.endpoints || {}),
    [typeMeta.value.endpointKey]: normalizeApiPath(form.api_path)
  }
  const imageEditEndpoint = getProviderConfig(form.provider_type).endpoints?.imageEdit
  if (props.modelType === 'image' && imageEditEndpoint && imageEditEndpoint !== '暂不支持' && !endpoints.imageEdit) {
    endpoints.imageEdit = imageEditEndpoint
  }
  return {
    ...current,
    endpoints
  }
}

function buildChannelPayload(config) {
  return {
    name: form.channel_name,
    provider_type: form.provider_type,
    model_type: props.modelType,
    api_base_url: form.api_base_url,
    api_key: form.api_key,
    is_active: form.is_active,
    priority: 0,
    weight: 1,
    timeout_ms: 60000,
    config
  }
}

async function saveChannel(config) {
  const payload = buildChannelPayload(config)
  if (editingChannelId.value) {
    if (!payload.api_key) delete payload.api_key
    return adminChannelApi.update(editingChannelId.value, payload)
  }
  return adminChannelApi.create(payload)
}

async function saveModel(channelId, defaultParams) {
  const payload = {
    model_key: form.model_key,
    display_name: form.display_name,
    model_type: props.modelType,
    is_active: form.is_active,
    default_params: defaultParams,
    max_params: null,
    sort_order: 0,
    description: null
  }
  if (editingId.value) {
    if (!channelOnlyMode.value) {
      await adminModelApi.update(editingId.value, payload)
    }
    if (!editingChannelId.value && channelId) {
      await adminModelApi.addBinding(editingId.value, {
        channel_id: channelId,
        rotation_weight: 1,
        rotation_strategy: 'round_robin',
        is_active: true
      })
    }
    return { id: editingId.value }
  }
  return adminModelApi.create({
    ...payload,
    channel_id: channelId,
    rotation_weight: 1,
    rotation_strategy: 'round_robin'
  })
}

async function saveBilling(modelId) {
  const payload = {
    model_id: modelId,
    rule_type: 'fixed',
    fixed_amount: effectiveFixedAmount(form.fixed_amount),
    is_active: form.billing_active
  }
  if (editingBillingId.value) return adminBillingApi.updateRule(editingBillingId.value, payload)
  return adminBillingApi.createRule(payload)
}

async function saveAll() {
  if (!form.display_name || !form.model_key || !form.channel_name || !form.api_base_url || !form.api_path) {
    window.$message?.warning('请填写显示名称、调用模型名称、渠道名称、API 地址和 API 路径')
    return
  }
  if (!isValidApiPath(form.api_path)) {
    window.$message?.warning('API 路径必须是以 / 开头的接口路径或完整 URL，不能填写邮箱、空格等内容')
    return
  }
  if (!editingChannelId.value && !form.api_key) {
    window.$message?.warning('新增配置必须填写 API Key')
    return
  }
  if (Number(form.fixed_amount || 0) < typeMeta.value.minFixedAmount) {
    window.$message?.warning(`${typeMeta.value.shortName}每次消耗积分不能小于 ${typeMeta.value.minFixedAmount}`)
    return
  }
  const defaultParams = parseJsonText(defaultParamsText.value, '默认参数')
  if (defaultParams === undefined) return

  const channelConfig = buildChannelConfig()

  saving.value = true
  try {
    const channel = await saveChannel(channelConfig)
    const model = await saveModel(channel.id, defaultParams)
    await saveBilling(model.id)
    window.$message?.success('模型配置已保存')
    drawerVisible.value = false
    await loadRows()
    await modelStore.loadPublicModels()
  } catch (err) {
    window.$message?.error(formatApiError(err, '保存模型配置失败'))
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row) {
  try {
    await adminModelApi.setStatus(row.id, !row.isActive)
    window.$message?.success('模型状态已更新')
    await loadRows()
    await modelStore.loadPublicModels()
  } catch (err) {
    window.$message?.error(formatApiError(err, '更新状态失败'))
  }
}

async function deleteModel(row) {
  try {
    await adminModelApi.remove(row.id)
    window.$message?.success('模型已删除')
    await loadRows()
    await modelStore.loadPublicModels()
  } catch (err) {
    window.$message?.error(formatApiError(err, '删除模型失败'))
  }
}

watch(() => props.modelType, () => {
  page.value = 1
  resetForm()
  loadRows()
})

watch(() => form.provider_type, () => {
  applyProviderDefaults()
})

onMounted(loadRows)
</script>
