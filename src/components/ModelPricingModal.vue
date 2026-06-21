<template>
  <n-modal :show="show" preset="card" class="max-w-4xl" title="模型价格" @update:show="emit('update:show', $event)">
    <div class="mb-3 flex items-center justify-between text-sm text-[var(--text-secondary)]">
      <span>价格单位：积分 / 次</span>
      <span v-if="pricingGroup">当前用户组：{{ pricingGroup.name }} × {{ formatNumber(pricingGroup.cost_multiplier) }}</span>
    </div>
    <n-data-table
      :columns="columns"
      :data="items"
      :loading="loading"
      :pagination="false"
      size="small"
      striped
    />
    <n-empty v-if="!loading && !items.length" class="py-8" description="暂无模型价格" />
  </n-modal>
</template>

<script setup>
import { computed, h, ref, watch } from 'vue'
import { NDataTable, NEmpty, NModal, NTag } from 'naive-ui'
import { billingApi } from '@/api/backend'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show'])

const loading = ref(false)
const items = ref([])
const pricingGroup = ref(null)

function typeLabel(value) {
  const labels = { image: '图片', video: '视频', chat: '问答' }
  return labels[value] || value || '-'
}

function typeTagType(value) {
  const types = { chat: 'info', image: 'success', video: 'warning' }
  return types[value] || 'default'
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2)
}

const columns = computed(() => [
  {
    title: '模型',
    key: 'display_name',
    minWidth: 220,
    render(row) {
      return row.display_name || row.model_key || '-'
    }
  },
  {
    title: '类型',
    key: 'model_type',
    width: 90,
    render(row) {
      return h(NTag, { size: 'small', type: typeTagType(row.model_type) }, { default: () => typeLabel(row.model_type) })
    }
  },
  {
    title: '基础价格',
    key: 'base_amount',
    width: 120,
    render(row) {
      return formatNumber(row.base_amount)
    }
  },
  {
    title: '当前价格',
    key: 'final_cost',
    width: 120,
    render(row) {
      return formatNumber(row.final_cost)
    }
  }
])

async function loadPricing() {
  loading.value = true
  try {
    const data = await billingApi.pricing()
    items.value = data.items || []
    pricingGroup.value = data.group || null
  } catch (err) {
    window.$message?.error(err?.message || '加载模型价格失败')
  } finally {
    loading.value = false
  }
}

watch(() => props.show, (visible) => {
  if (visible) loadPricing()
})
</script>
