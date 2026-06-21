<template>
  <div class="admin-shell min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <AppHeader class="admin-header bg-[var(--bg-secondary)]" :show-auth-nav="false">
      <template #left>
        <div class="flex items-center gap-3">
          <button class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]" @click="router.push('/')">
            首页
          </button>
          <span class="font-semibold tracking-wide">管理后台</span>
        </div>
      </template>
      <template #right>
        <span class="hidden text-sm text-[var(--text-secondary)] md:inline">{{ currentUser?.username }}</span>
        <n-button size="small" quaternary @click="handleLogout">退出</n-button>
      </template>
    </AppHeader>

    <main class="admin-main mx-auto max-w-7xl px-4 py-6">
      <n-select
        class="mb-4 md:hidden"
        :value="route.path"
        :options="mobileNavOptions"
        @update:value="path => router.push(path)"
      />

      <nav class="admin-nav mb-4 hidden flex-wrap gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 md:flex">
        <button
          v-for="item in navItems"
          :key="item.path"
          class="admin-nav-button rounded-md px-3 py-2 text-sm transition-colors"
          :class="isActive(item) ? 'is-active text-white' : 'hover:bg-[var(--bg-tertiary)]'"
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
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NSelect } from 'naive-ui'
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
  { label: '公告管理', path: '/admin/announcements' },
  { label: '问答模型', path: '/admin/models/chat' },
  { label: '图片模型', path: '/admin/models/image' },
  { label: '视频模型', path: '/admin/models/video' }
]

const mobileNavOptions = computed(() => navItems.map(item => ({
  label: item.label,
  value: item.path
})))

function isActive(item) {
  return route.path === item.path
}

async function handleLogout() {
  await logout()
  router.push('/admin/login')
}
</script>

<style scoped>
.admin-shell {
  position: relative;
  background:
    linear-gradient(135deg, rgba(34, 197, 94, 0.08), transparent 32%),
    linear-gradient(315deg, rgba(6, 182, 212, 0.08), transparent 30%),
    var(--bg-primary);
}

.admin-shell::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.36;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.16) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: linear-gradient(to bottom, black, transparent 72%);
}

.admin-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
  backdrop-filter: blur(18px);
}

.admin-main {
  position: relative;
  z-index: 1;
}

.admin-nav {
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(16px);
}

.admin-nav-button {
  position: relative;
  color: var(--text-secondary);
}

.admin-nav-button.is-active {
  background:
    linear-gradient(135deg, var(--accent-color), color-mix(in srgb, var(--accent-color) 70%, #06b6d4));
  box-shadow: 0 10px 24px color-mix(in srgb, var(--accent-color) 24%, transparent);
}

:deep(.admin-panel),
:deep(.admin-toolbar),
:deep(section.rounded-lg.border) {
  border-color: color-mix(in srgb, var(--border-color) 86%, transparent);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.07);
  backdrop-filter: blur(14px);
}

:deep(.n-data-table) {
  --n-merged-border-color: color-mix(in srgb, var(--border-color) 80%, transparent);
}

:deep(.n-data-table-th) {
  font-weight: 650;
  letter-spacing: 0;
}

:deep(.n-button) {
  border-radius: 7px;
}

:deep(.n-input),
:deep(.n-base-selection),
:deep(.n-input-number) {
  border-radius: 7px;
}
</style>
