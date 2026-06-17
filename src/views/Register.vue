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
        <h1 class="mb-2 text-2xl font-semibold">{{ verifying ? '邮箱验证' : '注册账号' }}</h1>
        <p class="mb-6 text-sm text-[var(--text-secondary)]">
          {{ verifying ? '输入邮箱收到的 6 位验证码完成激活。' : '注册后需要完成邮箱验证才能登录。' }}
        </p>

        <n-form v-if="!verifying" :model="form" label-placement="top">
          <n-form-item label="用户名">
            <n-input v-model:value="form.username" placeholder="3-50 位字母、数字或下划线" />
          </n-form-item>
          <n-form-item label="邮箱">
            <n-input v-model:value="form.email" placeholder="name@example.com" />
          </n-form-item>
          <n-form-item label="密码">
            <n-input v-model:value="form.password" type="password" show-password-on="click" placeholder="至少 8 位，包含字母和数字" @keydown.enter="handleRegister" />
          </n-form-item>
          <n-button type="primary" block :loading="loading" @click="handleRegister">发送验证码</n-button>
        </n-form>

        <n-form v-else :model="verifyForm" label-placement="top">
          <n-form-item label="邮箱">
            <n-input v-model:value="verifyForm.email" disabled />
          </n-form-item>
          <n-form-item label="验证码">
            <n-input v-model:value="verifyForm.code" maxlength="6" placeholder="6 位数字" @keydown.enter="handleVerify" />
          </n-form-item>
          <n-button type="primary" block :loading="loading" @click="handleVerify">完成注册</n-button>
          <n-button class="mt-3" block quaternary @click="verifying = false">返回修改信息</n-button>
        </n-form>

        <div class="mt-4 text-sm">
          <button class="text-[var(--accent-color)] hover:underline" @click="router.push('/login')">已有账号，去登录</button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NForm, NFormItem, NInput } from 'naive-ui'
import AppHeader from '@/components/AppHeader.vue'
import { register, verifyEmail } from '@/stores/auth'

const router = useRouter()
const loading = ref(false)
const verifying = ref(false)
const form = reactive({
  username: '',
  email: '',
  password: ''
})
const verifyForm = reactive({
  email: '',
  code: ''
})

async function handleRegister() {
  if (!form.username || !form.email || !form.password) {
    window.$message?.warning('请填写完整注册信息')
    return
  }
  loading.value = true
  try {
    await register(form)
    verifyForm.email = form.email
    verifying.value = true
    window.$message?.success('验证码已发送')
  } catch (err) {
    window.$message?.error(err?.message || '注册失败')
  } finally {
    loading.value = false
  }
}

async function handleVerify() {
  if (!verifyForm.code || verifyForm.code.length !== 6) {
    window.$message?.warning('请输入 6 位验证码')
    return
  }
  loading.value = true
  try {
    const result = await verifyEmail(verifyForm)
    window.$message?.success('注册完成')
    router.push(result.user?.role === 'admin' ? '/admin/users' : '/')
  } catch (err) {
    window.$message?.error(err?.message || '邮箱验证失败')
  } finally {
    loading.value = false
  }
}
</script>
