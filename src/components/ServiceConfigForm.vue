<template>
  <!-- 单个服务的 API 配置 + 模型管理(供 ApiSettings 的三个服务标签复用) -->
  <div>
    <!-- 使用全局配置开关 -->
    <div class="global-switch-row">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium">使用全局配置</div>
          <div class="text-xs text-[var(--text-secondary)] mt-0.5">
            开启时此服务使用「全局默认」的渠道、Base URL 和 API Key；关闭后可单独设置
          </div>
        </div>
        <n-switch v-model:value="useGlobal" size="small" />
      </div>
    </div>

    <!-- 关闭全局配置时: 显示独立配置表单 -->
    <template v-if="!useGlobal">
      <!-- 当前生效配置摘要 -->
      <div class="config-summary">
        <div class="summary-row">
          <span class="summary-label">当前生效渠道</span>
          <n-tag size="small" :type="tagType">{{ effectiveConfig.provider }}</n-tag>
        </div>
        <div class="summary-row">
          <span class="summary-label">当前生效 Base URL</span>
          <span class="summary-value">{{ effectiveConfig.baseUrl || '（无）' }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">当前生效 API Key</span>
          <span class="summary-value">{{ effectiveConfig.apiKey ? '••••' + effectiveConfig.apiKey.slice(-4) : '（无）' }}</span>
        </div>
      </div>

      <!-- 独立配置表单 -->
      <n-form label-placement="left" label-width="80">
        <n-form-item label="渠道">
          <n-select
            :value="form.provider"
            :options="providerOptions"
            placeholder="选择 API 渠道"
            @update:value="onFieldChange('provider', $event)"
          />
        </n-form-item>
        <n-form-item label="Base URL">
          <n-input
            :value="form.baseUrl"
            :placeholder="baseUrlPlaceholder"
            :disabled="isAliyun"
            @update:value="onFieldChange('baseUrl', $event)"
          />
          <template #feedback v-if="isAliyun">
            <span class="text-xs text-[var(--text-secondary)]">阿里云万相使用本地代理，无需手动配置</span>
          </template>
        </n-form-item>
        <n-form-item label="API Key">
          <n-input
            :value="form.apiKey"
            type="password"
            show-password-on="click"
            :placeholder="apiKeyPlaceholder"
            @update:value="onFieldChange('apiKey', $event)"
          />
        </n-form-item>
      </n-form>
    </template>

    <!-- 端点路径预览 -->
    <div class="endpoint-list">
      <div class="text-xs text-[var(--text-secondary)] mb-2">端点路径</div>
      <div v-for="(ep, epKey) in serviceEndpoints" :key="epKey" class="endpoint-item">
        <span class="endpoint-label">{{ ep.label }}</span>
        <n-tag size="small" :type="tagType" class="endpoint-tag">{{ ep.path }}</n-tag>
      </div>
    </div>

    <!-- 模型管理 -->
    <div class="model-section">
      <div class="model-header">
        <span class="text-sm font-medium">模型列表</span>
        <n-tag size="tiny" :type="tagType">{{ modelList.length }} 个</n-tag>
      </div>
      <div class="model-input-row">
        <n-input
          v-model:value="newModel"
          :placeholder="modelPlaceholder"
          size="small"
          @keyup.enter="handleAddModel"
        />
        <n-button size="small" type="primary" @click="handleAddModel" :disabled="!newModel.trim()">
          添加
        </n-button>
      </div>
      <div class="model-tags">
        <n-tag
          v-for="model in modelList"
          :key="model.key"
          size="small"
          :closable="model.isCustom"
          :type="model.isCustom ? tagType : 'default'"
          @close="handleRemoveModel(model.key)"
        >
          {{ model.label }}
        </n-tag>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * ServiceConfigForm | 单服务 API 配置 + 模型管理子组件
 * 供 ApiSettings 的问答/图片/视频三个标签页复用
 * - 「使用全局配置」开关(默认开启): 开启 = 回退全局; 关闭 = 展示独立配置表单
 * - 模型管理: 添加/删除自定义模型
 */
import { computed, ref, watch } from 'vue'
import { NAlert, NForm, NFormItem, NInput, NSelect, NTag, NSwitch, NButton } from 'naive-ui'
import { useModelStore } from '../stores/pinia'
import { getProviderConfig, getDefaultBaseUrl } from '../config/providers'

const props = defineProps({
  serviceKey: { type: String, required: true },
  serviceLabel: { type: String, default: '' },
  tagType: { type: String, default: 'default' },
  providerOptions: { type: Array, default: () => [] },
  form: { type: Object, required: true }
})

const emit = defineEmits(['updateForm'])

const modelStore = useModelStore()

// ---- 使用全局配置开关 ----
// 默认开启(使用全局), 关闭后显示独立配置表单
const useGlobal = ref(true)

// 初始化: 若已有独立覆盖则自动关闭(保持兼容)
watch(() => props.form, (f) => {
  const hasOverride = !!(f.provider || f.baseUrl || f.apiKey)
  if (hasOverride && useGlobal.value) {
    useGlobal.value = false
  }
}, { immediate: true })

// 开关切回「使用全局」时, 清空独立配置(通过 emit 通知父组件)
watch(useGlobal, (val) => {
  if (val) {
    emit('updateForm', { provider: '', baseUrl: '', apiKey: '' })
  }
})

// ---- 当前生效配置摘要 ----
const effectiveConfig = computed(() => modelStore.getServiceConfig(props.serviceKey))

// ---- 表单状态 ----
const isAliyun = computed(() => props.form.provider === 'aliyun')

const baseUrlPlaceholder = computed(() => {
  if (isAliyun.value) return 'https://dashscope.aliyuncs.com/api/v1'
  const g = effectiveConfig.value
  return g.baseUrl || '使用全局默认'
})

const apiKeyPlaceholder = computed(() => {
  const g = effectiveConfig.value
  return g.apiKey ? '••••（使用全局默认）' : '使用全局默认'
})

// 端点路径(按该服务生效的 provider)
const serviceEndpoints = computed(() => {
  const cfg = effectiveConfig.value.providerConfig || {}
  const eps = cfg.endpoints || {}
  const map = {
    chat: [
      { label: '问答', path: eps.chat || '/chat/completions' }
    ],
    image: [
      { label: '生图', path: eps.image || '/images/generations' },
      { label: '查询', path: eps.imageQuery || eps.image || '/images/generations' }
    ],
    video: [
      { label: '生成', path: eps.video || '/videos' },
      { label: '查询', path: eps.videoQuery || eps.video || '/videos' }
    ]
  }
  return map[props.serviceKey] || []
})

// ---- 表单字段变更 ----
const onFieldChange = (field, value) => {
  emit('updateForm', { ...props.form, [field]: value || '' })
}

// 切换渠道时自动填入默认 baseUrl
watch(() => props.form.provider, (newProvider) => {
  if (!newProvider) return
  if (props.form.baseUrl) return
  if (newProvider === 'aliyun') {
    emit('updateForm', { ...props.form, baseUrl: getDefaultBaseUrl('aliyun') })
  } else {
    const cfg = getProviderConfig(newProvider)
    if (cfg.defaultBaseUrl) {
      emit('updateForm', { ...props.form, baseUrl: cfg.defaultBaseUrl })
    }
  }
})

// ---- 模型管理 ----
const newModel = ref('')

const modelListMap = {
  chat: () => modelStore.allChatModels,
  image: () => modelStore.allImageModels,
  video: () => modelStore.allVideoModels
}
const modelList = computed(modelListMap[props.serviceKey] || (() => []))

const modelPlaceholderMap = {
  chat: '如 gpt-4o、deepseek-chat',
  image: '如 dall-e-3、wanx2.1-t2i-turbo',
  video: '如 sora-2、wan2.1-t2v-plus'
}
const modelPlaceholder = computed(() => modelPlaceholderMap[props.serviceKey] || '输入模型名称')

const addModelMap = {
  chat: (name) => modelStore.addCustomChatModel(name),
  image: (name) => modelStore.addCustomImageModel(name),
  video: (name) => modelStore.addCustomVideoModel(name)
}
const removeModelMap = {
  chat: (key) => modelStore.removeCustomChatModel(key),
  image: (key) => modelStore.removeCustomImageModel(key),
  video: (key) => modelStore.removeCustomVideoModel(key)
}

const handleAddModel = () => {
  const name = newModel.value.trim()
  if (!name) return
  addModelMap[props.serviceKey]?.(name)
  newModel.value = ''
}

const handleRemoveModel = (key) => {
  removeModelMap[props.serviceKey]?.(key)
}
</script>

<style scoped>
.global-switch-row {
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  margin-bottom: 16px;
}

.config-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 6px;
  margin-bottom: 16px;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.summary-label {
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.summary-value {
  font-size: 12px;
  font-family: monospace;
  color: var(--text-secondary, #666);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.endpoint-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 6px;
  margin-bottom: 16px;
}

.endpoint-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.endpoint-label {
  font-size: 13px;
  color: var(--text-secondary, #666);
  min-width: 50px;
}

.endpoint-tag {
  font-family: monospace;
  font-size: 12px;
}

.model-section {
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
}

.model-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.model-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.model-input-row .n-input {
  flex: 1;
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
</style>
