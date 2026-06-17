<template>
  <!-- App Header | 应用头部 -->
  <header class="flex items-center justify-between px-4 md:px-8 py-4 border-b border-[var(--border-color)]">
    <!-- Left slot | 左侧插槽 -->
    <div class="flex items-center gap-2">
      <slot name="left">
        <!-- Default: empty or logo -->
      </slot>
    </div>
    
    <!-- Right section | 右侧区域 -->
    <div class="flex items-center gap-4">
      <!-- Center slot | 中间插槽 -->
      <slot name="center"></slot>
      
      <!-- GitHub link | GitHub 链接 -->
      <a 
        :href="githubUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-[var(--text-primary)] hover:text-[var(--accent-color)]"
        title="GitHub"
      >
        <n-icon :size="20"><LogoGithub /></n-icon>
      </a>

      <button
        v-if="isAdmin"
        @click="router.push('/admin/users')"
        class="hidden px-2 py-1 text-sm rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors md:block"
      >
        管理
      </button>

      <button
        v-if="!isLoggedIn"
        @click="router.push('/login')"
        class="px-2 py-1 text-sm rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        登录
      </button>

      <n-dropdown v-else :options="userOptions" @select="handleUserAction" placement="bottom-end">
        <button class="px-2 py-1 text-sm rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
          {{ currentUser?.username || '账号' }}
        </button>
      </n-dropdown>
      
      <!-- Theme toggle | 主题切换 -->
      <button 
        @click="toggleTheme"
        class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <n-icon :size="20">
          <SunnyOutline v-if="isDark" />
          <MoonOutline v-else />
        </n-icon>
      </button>
      
      <!-- Right slot | 右侧插槽 -->
      <slot name="right"></slot>
    </div>
  </header>
</template>

<script setup>
/**
 * App Header component | 应用头部组件
 * Reusable header with slots for customization
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NDropdown, NIcon } from 'naive-ui'
import { 
  SunnyOutline, 
  MoonOutline,
  LogoGithub
} from '@vicons/ionicons5'
import { isDark, toggleTheme } from '../stores/theme'
import { currentUser, isAdmin, isLoggedIn, logout } from '../stores/auth'

const router = useRouter()

const userOptions = computed(() => [
  ...(isAdmin.value ? [{ label: '用户管理', key: 'admin' }] : []),
  { label: '退出登录', key: 'logout' }
])

async function handleUserAction(key) {
  if (key === 'admin') {
    router.push('/admin/users')
    return
  }
  if (key === 'logout') {
    await logout()
    window.$message?.success('已退出登录')
    router.push('/login')
  }
}

// Props | 属性
defineProps({
  githubUrl: {
    type: String,
    default: 'https://github.com/kggzs/Doodle-Canvas'
  }
})
</script>
