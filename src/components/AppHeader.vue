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
    <div class="flex items-center gap-3">
      <!-- Center slot | 中间插槽 -->
      <slot name="center"></slot>

      <template v-if="showAuthNav">
        <button
          v-if="isLoggedIn"
          @click="router.push('/projects')"
          class="hidden px-2 py-1 text-sm rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors md:block"
        >
          我的画布
        </button>

        <button
          v-if="isLoggedIn"
          @click="router.push('/account')"
          class="hidden rounded-md border border-[var(--border-color)] px-2 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-color)] hover:text-[var(--text-primary)] sm:inline-flex"
        >
          积分 {{ balanceText }}
        </button>

        <template v-if="!isLoggedIn">
          <button
            @click="router.push(loginPath)"
            class="px-2 py-1 text-sm rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            登录
          </button>
          <button
            @click="router.push('/register')"
            class="hidden px-2 py-1 text-sm rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors sm:block"
          >
            注册
          </button>
        </template>

        <n-dropdown v-else :options="userOptions" @select="handleUserAction" placement="bottom-end">
          <button class="px-2 py-1 text-sm rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
            {{ currentUser?.username || '账号' }}
          </button>
        </n-dropdown>
      </template>

      <!-- Right slot | 右侧插槽 -->
      <slot name="right"></slot>

      <div class="flex items-center gap-1">
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

        <!-- Theme toggle | 主题切换 -->
        <button
          @click="toggleTheme"
          class="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          title="切换主题"
        >
          <n-icon :size="20">
            <SunnyOutline v-if="isDark" />
            <MoonOutline v-else />
          </n-icon>
        </button>
      </div>
    </div>
  </header>
</template>

<script setup>
/**
 * App Header component | 应用头部组件
 * Reusable header with slots for customization
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NDropdown, NIcon } from 'naive-ui'
import { 
  SunnyOutline, 
  MoonOutline,
  LogoGithub
} from '@vicons/ionicons5'
import { isDark, toggleTheme } from '../stores/theme'
import { currentUser, isLoggedIn, logout } from '../stores/auth'
import { coinApi } from '@/api/backend'

const BALANCE_CACHE_KEY = 'doodle-balance-cache'
const BALANCE_CACHE_TTL_MS = 30 * 1000
const router = useRouter()
const balance = ref(null)
const balanceLoading = ref(false)
const balanceRefreshPending = ref(false)

const props = defineProps({
  githubUrl: {
    type: String,
    default: 'https://github.com/kggzs/Doodle-Canvas'
  },
  showAuthNav: {
    type: Boolean,
    default: true
  },
  loginPath: {
    type: String,
    default: '/login'
  }
})

const balanceText = computed(() => {
  if (balanceLoading.value && balance.value === null) return '...'
  const value = Number(balance.value || 0)
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
})

const userOptions = computed(() => [
  { label: '用户中心', key: 'account' },
  { label: '我的画布', key: 'projects' },
  { type: 'divider', key: 'divider' },
  { label: '退出登录', key: 'logout' }
])

async function handleUserAction(key) {
  if (key === 'account') {
    router.push('/account')
    return
  }
  if (key === 'projects') {
    router.push('/projects')
    return
  }
  if (key === 'logout') {
    await logout()
    balance.value = null
    window.$message?.success('已退出登录')
    router.push(props.loginPath)
  }
}

function readCachedBalance() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(BALANCE_CACHE_KEY) || 'null')
    if (!cached || Date.now() - Number(cached.fetchedAt || 0) > BALANCE_CACHE_TTL_MS) return false
    balance.value = cached.balance
    return true
  } catch {
    return false
  }
}

function writeCachedBalance(value) {
  try {
    sessionStorage.setItem(BALANCE_CACHE_KEY, JSON.stringify({
      balance: value,
      fetchedAt: Date.now()
    }))
  } catch {
    // ignore storage quota/private mode failures
  }
}

async function loadBalance({ force = false } = {}) {
  if (!props.showAuthNav || !isLoggedIn.value) return
  if (!force && readCachedBalance()) return
  if (balanceLoading.value) {
    balanceRefreshPending.value = true
    return
  }
  balanceLoading.value = true
  try {
    const data = await coinApi.balance()
    balance.value = data?.balance?.balance ?? data?.balance ?? 0
    writeCachedBalance(balance.value)
  } catch {
    balance.value = null
  } finally {
    balanceLoading.value = false
    if (balanceRefreshPending.value) {
      balanceRefreshPending.value = false
      loadBalance({ force: true })
    }
  }
}

watch(isLoggedIn, (loggedIn) => {
  if (loggedIn && props.showAuthNav) loadBalance({ force: true })
  else balance.value = null
})

function handleBalanceRefresh() {
  loadBalance({ force: true })
}

onMounted(() => {
  loadBalance()
  window.addEventListener('doodle-balance-refresh', handleBalanceRefresh)
})

onBeforeUnmount(() => {
  window.removeEventListener('doodle-balance-refresh', handleBalanceRefresh)
})

</script>
