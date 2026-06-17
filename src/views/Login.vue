<template>
  <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <AppHeader>
      <template #left>
        <button class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]" @click="router.push('/')">
          返回首页
        </button>
      </template>
    </AppHeader>

    <main class="mx-auto flex min-h-[calc(100vh-72px)] max-w-md items-center px-4">
      <section class="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 shadow-sm">
        <h1 class="mb-2 text-2xl font-semibold">登录</h1>
        <p class="mb-6 text-sm text-[var(--text-secondary)]">使用账号进入画布和管理后台。</p>

        <n-form :model="form" label-placement="top">
          <n-form-item label="邮箱或用户名">
            <n-input v-model:value="form.emailOrUsername" placeholder="admin@example.com" />
          </n-form-item>
          <n-form-item label="密码">
            <n-input v-model:value="form.password" type="password" show-password-on="click" placeholder="请输入密码" @keydown.enter="handleLogin" />
          </n-form-item>
          <n-button type="primary" block :loading="loading" @click="handleLogin">登录</n-button>
        </n-form>

        <div class="mt-4 flex items-center justify-between text-sm">
          <button class="text-[var(--accent-color)] hover:underline" @click="router.push('/register')">注册新账号</button>
          <button class="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" @click="router.push('/admin/users')">进入管理后台</button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NForm, NFormItem, NInput } from 'naive-ui'
import AppHeader from '@/components/AppHeader.vue'
import { login } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const form = reactive({
  emailOrUsername: '',
  password: ''
})

async function handleLogin() {
  if (!form.emailOrUsername || !form.password) {
    window.$message?.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const result = await login(form.emailOrUsername, form.password)
    window.$message?.success('登录成功')
    const redirect = route.query.redirect || (result.user?.role === 'admin' ? '/admin/users' : '/')
    router.push(String(redirect))
  } catch (err) {
    window.$message?.error(err?.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>
