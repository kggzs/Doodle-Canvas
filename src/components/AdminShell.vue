<template>
  <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <AppHeader class="bg-[var(--bg-secondary)]" :show-auth-nav="false">
      <template #left>
        <div class="flex items-center gap-3">
          <button class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]" @click="router.push('/')">
            首页
          </button>
          <span class="font-semibold">管理后台</span>
        </div>
      </template>
      <template #right>
        <span class="hidden text-sm text-[var(--text-secondary)] md:inline">{{ currentUser?.username }}</span>
        <n-button size="small" quaternary @click="handleLogout">退出</n-button>
      </template>
    </AppHeader>

    <main class="mx-auto max-w-7xl px-4 py-6">
      <nav class="mb-4 flex flex-wrap gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
        <button
          v-for="item in navItems"
          :key="item.path"
          class="rounded-md px-3 py-2 text-sm transition-colors"
          :class="isActive(item) ? 'bg-[var(--accent-color)] text-white' : 'hover:bg-[var(--bg-tertiary)]'"
          @click="router.push(item.path)"
        >
          {{ item.label }}
        </button>
      </nav>

      <slot />
    </main>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { NButton } from 'naive-ui'
import AppHeader from '@/components/AppHeader.vue'
import { currentUser, logout } from '@/stores/auth'

const route = useRoute()
const router = useRouter()

const navItems = [
  { label: '仪表盘', path: '/admin/dashboard' },
  { label: '用户管理', path: '/admin/users' },
  { label: '用户组', path: '/admin/user-groups' },
  { label: '金币流水', path: '/admin/coins' },
  { label: '生成记录', path: '/admin/records' },
  { label: '文件管理', path: '/admin/files' },
  { label: '错误日志', path: '/admin/error-logs' },
  { label: '问答模型', path: '/admin/models/chat' },
  { label: '图片模型', path: '/admin/models/image' },
  { label: '视频模型', path: '/admin/models/video' }
]

function isActive(item) {
  return route.path === item.path
}

async function handleLogout() {
  await logout()
  router.push('/admin/login')
}
</script>
