<template>
  <!-- API Settings Modal | API 设置弹窗 -->
  <n-modal v-model:show="showModal" preset="card" title="API 设置" style="width: 640px;">
    <n-tabs type="line" animated>
      <!-- 标签1: 全局默认（排第一） -->
      <n-tab-pane name="global" tab="全局默认">
        <n-alert type="info" class="mb-4" :show-icon="true">
          全局默认配置作为所有服务的兜底。单独服务未配置时自动回退此处。
        </n-alert>
        <n-form label-placement="left" label-width="80">
          <n-form-item label="渠道">
            <n-select
              v-model:value="globalForm.provider"
              :options="providerOptions"
              placeholder="选择 API 渠道"
            />
          </n-form-item>
          <n-form-item label="Base URL">
            <n-input
              v-model:value="globalForm.baseUrl"
              :placeholder="globalBaseUrlPlaceholder"
              :disabled="isGlobalAliyun"
            />
            <template #feedback v-if="isGlobalAliyun">
              <span class="text-xs text-[var(--text-secondary)]">阿里云万相使用本地代理，无需手动配置</span>
            </template>
          </n-form-item>
          <n-form-item label="API Key">
            <n-input
              v-model:value="globalForm.apiKey"
              type="password"
              show-password-on="click"
              placeholder="请输入 API Key"
            />
          </n-form-item>
        </n-form>
        <!-- 端点预览 -->
        <div class="endpoint-list">
          <div class="text-xs text-[var(--text-secondary)] mb-2">端点路径预览</div>
          <div class="endpoint-item">
            <span class="endpoint-label">问答</span>
            <n-tag size="small" type="info" class="endpoint-tag">{{ globalEndpoints.chat }}</n-tag>
          </div>
          <div class="endpoint-item">
            <span class="endpoint-label">生图</span>
            <n-tag size="small" type="success" class="endpoint-tag">{{ globalEndpoints.image }}</n-tag>
          </div>
          <div class="endpoint-item">
            <span class="endpoint-label">视频生成</span>
            <n-tag size="small" type="warning" class="endpoint-tag">{{ globalEndpoints.video }}</n-tag>
          </div>
          <div class="endpoint-item">
            <span class="endpoint-label">视频查询</span>
            <n-tag size="small" type="warning" class="endpoint-tag">{{ globalEndpoints.videoQuery }}</n-tag>
          </div>
        </div>
      </n-tab-pane>

      <!-- 标签2: 问答模型 -->
      <n-tab-pane name="chat" tab="问答模型">
        <ServiceConfigForm
          service-key="chat"
          service-label="问答服务"
          tag-type="info"
          :provider-options="providerOptions"
          :form="serviceForms.chat"
          @update-form="serviceForms.chat = $event"
        />
      </n-tab-pane>

      <!-- 标签3: 图片模型 -->
      <n-tab-pane name="image" tab="图片模型">
        <ServiceConfigForm
          service-key="image"
          service-label="图片服务"
          tag-type="success"
          :provider-options="providerOptions"
          :form="serviceForms.image"
          @update-form="serviceForms.image = $event"
        />
      </n-tab-pane>

      <!-- 标签4: 视频模型 -->
      <n-tab-pane name="video" tab="视频模型">
        <ServiceConfigForm
          service-key="video"
          service-label="视频服务"
          tag-type="warning"
          :provider-options="providerOptions"
          :form="serviceForms.video"
          @update-form="serviceForms.video = $event"
        />
      </n-tab-pane>
    </n-tabs>

    <template #footer>
      <div class="flex justify-between items-center">
        <n-button @click="handleClearCache" type="warning" size="small" tertiary>
          清理缓存
        </n-button>
        <div class="flex gap-2">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="handleSave">保存</n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
/**
 * API Settings Component | API 设置组件
 * 四标签页: 全局默认 / 问答模型 / 图片模型 / 视频模型
 * 每个服务标签内含「使用全局配置」开关(默认开) + 独立配置表单 + 模型管理
 * 关闭「使用全局配置」后可单独设置渠道/Base URL/API Key; 开启则自动回退全局
 */
import { ref, reactive, watch, computed, defineAsyncComponent } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, NAlert, NTag, NTabs, NTabPane, NSelect } from 'naive-ui'
import { useModelStore } from '../stores/pinia'
import { getProviderConfig, getDefaultBaseUrl } from '../config/providers'

// 异步子组件: 服务配置 + 模型管理表单
const ServiceConfigForm = defineAsyncComponent(() => import('./ServiceConfigForm.vue'))

// Props
const props = defineProps({
  show: { type: Boolean, default: false }
})

// Emits
const emit = defineEmits(['update:show', 'saved'])

// Model Store
const modelStore = useModelStore()

// 渠道下拉选项
const providerOptions = modelStore.providerList.map(p => ({
  label: p.label,
  value: p.key
}))

// ---- 全局默认表单 ----
const globalForm = reactive({
  provider: modelStore.currentProvider,
  apiKey: '',
  baseUrl: ''
})

const isGlobalAliyun = computed(() => globalForm.provider === 'aliyun')

const globalBaseUrlPlaceholder = computed(() => {
  if (isGlobalAliyun.value) return 'https://dashscope.aliyuncs.com/api/v1'
  return 'https://api.openai.com/v1'
})

// 全局端点路径
const globalEndpoints = computed(() => {
  const config = getProviderConfig(globalForm.provider)
  return config.endpoints || {
    chat: '/chat/completions',
    image: '/v1/images/generations',
    video: '/v1/videos',
    videoQuery: '/v1/videos/{taskId}'
  }
})

// 切换全局渠道时, 自动更新 apiKey/baseUrl
const syncGlobalForm = () => {
  globalForm.provider = modelStore.currentProvider
  globalForm.apiKey = modelStore.apiKeysByProvider[modelStore.currentProvider] || ''
  if (modelStore.currentProvider === 'aliyun') {
    globalForm.baseUrl = getDefaultBaseUrl('aliyun')
  } else {
    const cfg = getProviderConfig(modelStore.currentProvider)
    globalForm.baseUrl = modelStore.baseUrlsByProvider[modelStore.currentProvider] || cfg.defaultBaseUrl || ''
  }
}

watch(() => globalForm.provider, () => {
  const p = globalForm.provider
  globalForm.apiKey = modelStore.apiKeysByProvider[p] || ''
  if (p === 'aliyun') {
    globalForm.baseUrl = getDefaultBaseUrl('aliyun')
  } else {
    const cfg = getProviderConfig(p)
    globalForm.baseUrl = modelStore.baseUrlsByProvider[p] || cfg.defaultBaseUrl || ''
  }
})

// ---- 按服务表单 ----
const serviceForms = reactive({
  chat: { provider: '', baseUrl: '', apiKey: '' },
  image: { provider: '', baseUrl: '', apiKey: '' },
  video: { provider: '', baseUrl: '', apiKey: '' }
})

const syncServiceForms = () => {
  for (const svc of modelStore.SERVICE_TYPES) {
    serviceForms[svc].provider = modelStore.serviceProviders[svc] || ''
    serviceForms[svc].baseUrl = modelStore.serviceBaseUrls[svc] || ''
    serviceForms[svc].apiKey = modelStore.serviceApiKeys[svc] || ''
  }
}

// ---- Modal ----
const showModal = ref(props.show)

watch(() => props.show, (val) => {
  showModal.value = val
  if (val) {
    syncGlobalForm()
    syncServiceForms()
  }
})

watch(showModal, (val) => {
  emit('update:show', val)
})

// ---- 保存 ----
const handleSave = () => {
  // 1. 保存全局默认
  if (globalForm.provider) modelStore.setProvider(globalForm.provider)
  if (globalForm.apiKey) modelStore.setApiKeyByProvider(globalForm.provider, globalForm.apiKey)
  if (globalForm.baseUrl) modelStore.setBaseUrlByProvider(globalForm.provider, globalForm.baseUrl)

  // 2. 保存各服务独立配置
  for (const svc of modelStore.SERVICE_TYPES) {
    modelStore.setServiceProvider(svc, serviceForms[svc].provider)
    modelStore.setServiceBaseUrl(svc, serviceForms[svc].baseUrl)
    modelStore.setServiceApiKey(svc, serviceForms[svc].apiKey)
  }

  showModal.value = false
  emit('saved')
}

// ---- 清理缓存 ----
const handleClearCache = () => {
  modelStore.clearConfigCache()
  syncGlobalForm()
  syncServiceForms()
  window.$message?.success('缓存已清理')
}
</script>

<style scoped>
.endpoint-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 6px;
}

.endpoint-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.endpoint-label {
  font-size: 13px;
  color: var(--text-secondary, #666);
  min-width: 70px;
}

.endpoint-tag {
  font-family: monospace;
  font-size: 12px;
}
</style>
