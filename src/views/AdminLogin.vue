<template>
  <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <AppHeader :show-auth-nav="false" login-path="/admin/login">
      <template #left>
        <button class="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]" @click="router.push('/')">
          返回首页
        </button>
      </template>
    </AppHeader>

    <main class="mx-auto flex min-h-[calc(100vh-72px)] max-w-md items-center px-4">
      <section class="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6 shadow-sm">
        <h1 class="mb-2 text-2xl font-semibold">管理登录</h1>
        <p class="mb-6 text-sm text-[var(--text-secondary)]">使用同一套账号登录，仅管理员可进入后台。</p>

        <n-form :model="form" label-placement="top">
          <n-form-item label="邮箱或用户名">
            <n-input v-model:value="form.emailOrUsername" placeholder="admin@example.com" />
          </n-form-item>
          <n-form-item label="密码">
            <n-input
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              placeholder="请输入密码"
              @keydown.enter="handleLogin"
            />
          </n-form-item>
          <n-button type="primary" block :loading="loading" @click="handleLogin">进入管理后台</n-button>
        </n-form>

        <div class="mt-4 flex items-center justify-between text-sm">
          <button class="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" @click="router.push('/login')">用户登录</button>
          <button class="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" @click="router.push('/projects')">返回用户页面</button>
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

function postLoginRedirect() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  if (redirect.startsWith('/admin') && redirect !== '/admin/login') return redirect
  return '/admin/dashboard'
}

async function handleLogin() {
  if (!form.emailOrUsername || !form.password) {
    window.$message?.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const data = await login(form.emailOrUsername, form.password)
    if (data?.user?.role !== 'admin') {
      window.$message?.warning('当前账号不是管理员，已进入用户页面')
      router.push('/projects')
      return
    }
    window.$message?.success('登录成功')
    router.push(postLoginRedirect())
  } catch (err) {
    if (err?.code === 40104) {
      window.$message?.warning('邮箱未验证，请先完成注册验证')
      const query = form.emailOrUsername.includes('@') ? { verify_email: form.emailOrUsername } : {}
      router.push({ path: '/register', query })
      return
    }
    window.$message?.error(err?.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>
