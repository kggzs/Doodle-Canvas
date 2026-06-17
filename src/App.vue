<script setup>
/**
 * Root App component | 根组件
 * Provides naive-ui config and router view
 */
import { computed, h, defineComponent, onMounted } from 'vue'
import { NConfigProvider, NMessageProvider, NDialogProvider, NLoadingBarProvider, darkTheme, useMessage, useDialog } from 'naive-ui'
import { isDark } from './stores/theme'
import { useModelStore } from './stores/pinia'

// Naive UI theme based on dark mode | 基于深色模式的 Naive UI 主题
const theme = computed(() => isDark.value ? darkTheme : null)
const modelStore = useModelStore()

onMounted(() => {
  modelStore.loadPublicModels().catch(() => {})
})

// Global theme overrides | 全局主题覆盖
const themeOverrides = {
  common: {
    borderRadius: '12px',
    borderRadiusSmall: '8px'
  },
  Dialog: {
    borderRadius: '16px',
    padding: '24px'
  },
  Modal: {
    borderRadius: '16px',
    padding: '24px'
  },
  Card: {
    borderRadius: '16px',
    padding: '24px'
  },
  Button: {
    borderRadiusMedium: '10px',
    borderRadiusSmall: '8px',
    borderRadiusLarge: '12px',
    heightMedium: '36px',
    paddingMedium: '0 16px'
  },
  Input: {
    borderRadius: '10px',
    heightMedium: '36px'
  }
}

/**
 * Global API bridge | 全局 API 桥接组件
 * 在 Naive UI provider 内部调用 useMessage/useDialog，
 * 挂载到 window 上，供非组件代码（stores/utils 等）使用。
 */
const GlobalApiBridge = defineComponent({
  name: 'GlobalApiBridge',
  setup() {
    window.$message = useMessage()
    window.$dialog = useDialog()
    return () => null
  }
})
</script>

<template>
  <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
    <n-loading-bar-provider>
      <n-message-provider>
        <n-dialog-provider>
          <global-api-bridge />
          <router-view />
        </n-dialog-provider>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<style>
/* Global app styles handled in style.css */
</style>
