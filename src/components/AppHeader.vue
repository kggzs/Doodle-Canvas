<template>
  <!-- App Header | 应用头部 -->
  <header class="flex min-h-[64px] items-center justify-between gap-3 border-b border-[var(--border-color)] px-3 py-3 sm:px-4 md:px-8 md:py-4">
    <!-- Left slot | 左侧插槽 -->
    <div class="flex min-w-0 flex-1 items-center gap-2">
      <slot name="left">
        <button
          class="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-[var(--bg-tertiary)]"
          @click="router.push(isLoggedIn ? '/projects' : '/')"
        >
          <img :src="logoSmall" alt="Doodle Canvas" class="h-9 w-9 shrink-0" decoding="async" />
          <span class="truncate font-semibold text-[var(--text-primary)]">万能涂鸦画布</span>
        </button>
      </slot>
    </div>
    
    <!-- Right section | 右侧区域 -->
    <div class="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
      <!-- Center slot | 中间插槽 -->
      <slot name="center"></slot>

      <template v-if="showAuthNav">
        <AnnouncementBanner />

        <button
          v-if="isLoggedIn && showProjectsLink"
          @click="router.push('/projects')"
          class="hidden rounded-lg px-2 py-1 text-sm transition-colors hover:bg-[var(--bg-tertiary)] md:inline-flex"
        >
          我的画布
        </button>

        <button
          v-if="isLoggedIn"
          @click="pricingVisible = true"
          class="hidden rounded-md border border-[var(--border-color)] px-2 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-color)] hover:text-[var(--text-primary)] md:inline-flex"
        >
          模型价格
        </button>

        <button
          v-if="isLoggedIn"
          @click="router.push({ path: '/account', query: { view: 'transactions' } })"
          class="hidden rounded-md border border-[var(--border-color)] px-2 py-1 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-color)] hover:text-[var(--text-primary)] md:inline-flex"
          title="点击查看积分使用记录"
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
            class="hidden rounded-lg px-2 py-1 text-sm transition-colors hover:bg-[var(--bg-tertiary)] sm:inline-flex"
          >
            注册
          </button>
        </template>

        <n-dropdown v-else :options="userOptions" @select="handleUserAction" placement="bottom-end">
          <button class="hidden rounded-lg px-2 py-1 text-sm transition-colors hover:bg-[var(--bg-tertiary)] md:inline-flex">
            {{ currentUser?.username || '账号' }}
          </button>
        </n-dropdown>

        <n-tag
          v-if="primaryGroup"
          size="small"
          :color="groupTagColor(primaryGroup)"
          class="hidden lg:inline-flex"
        >
          {{ primaryGroup.name }}
        </n-tag>
      </template>

      <!-- Right slot | 右侧插槽 -->
      <slot name="right"></slot>

      <div class="flex items-center gap-1">
        <!-- GitHub link | GitHub 链接 -->
        <a
          :href="githubUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="hidden rounded-lg p-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent-color)] sm:inline-flex"
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

        <n-dropdown
          v-if="showAuthNav"
          :options="mobileNavOptions"
          placement="bottom-end"
          trigger="click"
          @select="handleMobileNavSelect"
        >
          <button
            class="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-tertiary)] md:hidden"
            title="导航菜单"
          >
            <n-icon :size="22"><MenuOutline /></n-icon>
          </button>
        </n-dropdown>
      </div>
    </div>
    <ModelPricingModal v-model:show="pricingVisible" />
  </header>
</template>

<script setup>
/**
 * App Header component | 应用头部组件
 * Reusable header with slots for customization
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NDropdown, NIcon, NTag } from 'naive-ui'
import { 
  SunnyOutline, 
  MoonOutline,
  LogoGithub,
  MenuOutline
} from '@vicons/ionicons5'
import { isDark, toggleTheme } from '../stores/theme'
import { currentUser, isLoggedIn, logout } from '../stores/auth'
import { coinApi } from '@/api/backend'
import AnnouncementBanner from '@/components/AnnouncementBanner.vue'
import ModelPricingModal from '@/components/ModelPricingModal.vue'
import logoSmall from '@/assets/logo-small.webp'

const BALANCE_CACHE_KEY = 'doodle-balance-cache'
const BALANCE_CACHE_TTL_MS = 30 * 1000
const router = useRouter()
const pricingVisible = ref(false)
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
  showProjectsLink: {
    type: Boolean,
    default: false
  },
  loginPath: {
    type: String,
    default: '/login'
  }
})

const userOptions = computed(() => [
  { label: '用户中心', key: 'account' },
  { label: '修改密码', key: 'change-password' },
  { type: 'divider', key: 'divider' },
  { label: '退出登录', key: 'logout' }
])

const mobileNavOptions = computed(() => {
  if (!isLoggedIn.value) {
    return [
      { label: '登录', key: 'login' },
      { label: '注册账号', key: 'register' }
    ]
  }

  return [
    { label: '我的画布', key: 'projects' },
    { label: '模型价格', key: 'pricing' },
    { label: `积分 ${balanceText.value}`, key: 'transactions' },
    { type: 'divider', key: 'divider-account' },
    { label: '用户中心', key: 'account' },
    { label: '修改密码', key: 'change-password' },
    { type: 'divider', key: 'divider-session' },
    { label: '退出登录', key: 'logout' }
  ]
})

const balanceText = computed(() => {
  if (balanceLoading.value && balance.value === null) return '...'
  const value = Number(balance.value || 0)
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
})

const primaryGroup = computed(() => {
  const groups = currentUser.value?.userGroups || []
  return groups.find(group => group?.name) || null
})

function textColorForBadge(color) {
  const hex = String(color || '').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff'
}

function groupTagColor(group = {}) {
  if (!group?.badgeColor) return undefined
  return {
    color: group.badgeColor,
    borderColor: group.badgeColor,
    textColor: textColorForBadge(group.badgeColor)
  }
}

async function handleUserAction(key) {
  if (key === 'account') {
    router.push('/account')
    return
  }
  if (key === 'change-password') {
    router.push('/change-password')
    return
  }
  if (key === 'logout') {
    await logout()
    balance.value = null
    window.$message?.success('已退出登录')
    router.push(props.loginPath)
  }
}

async function handleMobileNavSelect(key) {
  if (key === 'login') {
    router.push(props.loginPath)
    return
  }
  if (key === 'register') {
    router.push('/register')
    return
  }
  if (key === 'projects') {
    router.push('/projects')
    return
  }
  if (key === 'pricing') {
    pricingVisible.value = true
    return
  }
  if (key === 'transactions') {
    router.push({ path: '/account', query: { view: 'transactions' } })
    return
  }
  await handleUserAction(key)
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
