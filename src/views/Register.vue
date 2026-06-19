<template>
  <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <AppHeader :show-auth-nav="false">
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
          {{ verifying ? '输入邮箱收到的 6 位验证码完成激活。' : '创建账号后即可进入用户页面。' }}
        </p>

        <n-form v-if="!verifying" :model="form" label-placement="top">
          <n-form-item label="用户名" :feedback="usernameFeedback" :validation-status="usernameStatus">
            <n-input v-model:value.trim="form.username" placeholder="3-50 位字母、数字或下划线" />
          </n-form-item>
          <n-form-item label="邮箱" :feedback="emailFeedback" :validation-status="emailStatus">
            <n-input
              v-model:value.trim="form.email"
              placeholder="name@example.com"
              @blur="handleEmailBlur"
            />
          </n-form-item>
          <n-form-item label="密码" :feedback="passwordFeedback" :validation-status="passwordStatus">
            <n-input
              v-model:value="form.password"
              type="password"
              show-password-on="click"
              placeholder="至少 8 位，包含字母和数字"
            />
          </n-form-item>
          <n-form-item label="确认密码" :feedback="confirmFeedback" :validation-status="confirmStatus">
            <n-input
              v-model:value="form.confirmPassword"
              type="password"
              show-password-on="click"
              placeholder="再次输入密码"
              @keydown.enter="handleRegister"
            />
          </n-form-item>
          <n-button type="primary" block :loading="loading" @click="handleRegister">发送验证码</n-button>
        </n-form>

        <n-form v-else :model="verifyForm" label-placement="top">
          <n-form-item label="邮箱">
            <n-input v-model:value="verifyForm.email" disabled />
          </n-form-item>
          <n-form-item label="验证码">
            <n-input v-model:value.trim="verifyForm.code" maxlength="6" placeholder="6 位数字" @keydown.enter="handleVerify" />
          </n-form-item>
          <n-button type="primary" block :loading="loading" @click="handleVerify">完成注册</n-button>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <n-button block quaternary :disabled="resendCountdown > 0" :loading="resending" @click="handleResend">
              {{ resendCountdown > 0 ? `${resendCountdown}s 后重发` : '重发验证码' }}
            </n-button>
            <n-button block quaternary @click="verifying = false">返回修改</n-button>
          </div>
        </n-form>

        <div class="mt-4 flex items-center justify-between text-sm">
          <button class="text-[var(--accent-color)] hover:underline" @click="router.push('/login')">已有账号，去登录</button>
          <button class="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" @click="router.push('/admin/login')">管理员登录</button>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NForm, NFormItem, NInput } from 'naive-ui'
import AppHeader from '@/components/AppHeader.vue'
import { checkEmail, register, resendVerification, verifyEmail } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const initialVerifyEmail = typeof route.query.verify_email === 'string' ? route.query.verify_email : ''
const loading = ref(false)
const resending = ref(false)
const verifying = ref(Boolean(initialVerifyEmail))
const emailAvailable = ref(null)
const emailChecking = ref(false)
const resendCountdown = ref(0)
let resendTimer = null

const form = reactive({
  username: '',
  email: initialVerifyEmail,
  password: '',
  confirmPassword: ''
})
const verifyForm = reactive({
  email: initialVerifyEmail,
  code: ''
})

const usernameValid = computed(() => /^[a-zA-Z0-9_]{3,50}$/.test(form.username))
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
const passwordValid = computed(() => form.password.length >= 8 && /[a-zA-Z]/.test(form.password) && /[0-9]/.test(form.password))
const confirmValid = computed(() => form.confirmPassword && form.confirmPassword === form.password)

const usernameStatus = computed(() => !form.username ? undefined : usernameValid.value ? 'success' : 'error')
const usernameFeedback = computed(() => !form.username || usernameValid.value ? '' : '用户名需为 3-50 位字母、数字或下划线')
const emailStatus = computed(() => {
  if (!form.email) return undefined
  if (!emailValid.value || emailAvailable.value === false) return 'error'
  if (emailChecking.value) return 'warning'
  return emailAvailable.value === true ? 'success' : undefined
})
const emailFeedback = computed(() => {
  if (!form.email) return ''
  if (!emailValid.value) return '邮箱格式不正确'
  if (emailChecking.value) return '正在检查邮箱'
  if (emailAvailable.value === false) return '该邮箱已被注册'
  if (emailAvailable.value === true) return '邮箱可注册'
  return ''
})
const passwordStatus = computed(() => !form.password ? undefined : passwordValid.value ? 'success' : 'error')
const passwordFeedback = computed(() => !form.password || passwordValid.value ? '' : '密码至少 8 位，且需同时包含字母和数字')
const confirmStatus = computed(() => !form.confirmPassword ? undefined : confirmValid.value ? 'success' : 'error')
const confirmFeedback = computed(() => !form.confirmPassword || confirmValid.value ? '' : '两次输入的密码不一致')

watch(() => form.email, () => {
  emailAvailable.value = null
})

function postRegisterRedirect(user) {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  if (user?.role === 'admin' && redirect.startsWith('/admin')) return redirect
  if (user?.role === 'admin' && route.query.from === 'admin') return '/admin/dashboard'
  return '/projects'
}

function startResendCountdown(seconds = 60) {
  resendCountdown.value = seconds
  if (resendTimer) clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendCountdown.value -= 1
    if (resendCountdown.value <= 0) {
      clearInterval(resendTimer)
      resendTimer = null
    }
  }, 1000)
}

async function handleEmailBlur() {
  emailAvailable.value = null
  form.email = form.email.trim()
  if (!emailValid.value) return
  emailChecking.value = true
  try {
    const data = await checkEmail(form.email)
    emailAvailable.value = !data.exists
  } catch {
    emailAvailable.value = null
  } finally {
    emailChecking.value = false
  }
}

async function ensureEmailAvailable() {
  if (emailAvailable.value === true) return true
  await handleEmailBlur()
  return emailAvailable.value !== false
}

function validateRegisterForm() {
  if (!usernameValid.value) {
    window.$message?.warning('请填写合法用户名')
    return false
  }
  if (!emailValid.value) {
    window.$message?.warning('请填写合法邮箱')
    return false
  }
  if (!passwordValid.value) {
    window.$message?.warning('密码至少 8 位，且需同时包含字母和数字')
    return false
  }
  if (!confirmValid.value) {
    window.$message?.warning('两次输入的密码不一致')
    return false
  }
  return true
}

async function handleRegister() {
  form.username = form.username.trim()
  form.email = form.email.trim()
  if (!validateRegisterForm()) return
  loading.value = true
  try {
    const available = await ensureEmailAvailable()
    if (!available) {
      window.$message?.warning('该邮箱已被注册')
      return
    }
    const result = await register({
      username: form.username,
      email: form.email,
      password: form.password
    })
    verifyForm.email = form.email
    verifyForm.code = ''
    verifying.value = true
    startResendCountdown(result?.resend_available_in || 60)
    window.$message?.success('验证码已发送')
  } catch (err) {
    if (err?.code === 40902) {
      emailAvailable.value = false
      window.$message?.error('该邮箱已被注册')
      return
    }
    if (err?.code === 40901) {
      window.$message?.error('该用户名已被占用')
      return
    }
    window.$message?.error(err?.message || '注册失败')
  } finally {
    loading.value = false
  }
}

async function handleResend() {
  if (!verifyForm.email || resendCountdown.value > 0) return
  resending.value = true
  try {
    const result = await resendVerification(verifyForm.email)
    startResendCountdown(result?.resend_available_in || 60)
    window.$message?.success('验证码已重发')
  } catch (err) {
    window.$message?.error(err?.message || '重发失败')
  } finally {
    resending.value = false
  }
}

async function handleVerify() {
  if (!verifyForm.email) {
    window.$message?.warning('缺少验证邮箱')
    return
  }
  if (!/^\d{6}$/.test(verifyForm.code)) {
    window.$message?.warning('请输入 6 位验证码')
    return
  }
  loading.value = true
  try {
    const data = await verifyEmail(verifyForm)
    window.$message?.success('注册完成')
    router.push(postRegisterRedirect(data?.user))
  } catch (err) {
    window.$message?.error(err?.message || '邮箱验证失败')
  } finally {
    loading.value = false
  }
}

onBeforeUnmount(() => {
  if (resendTimer) clearInterval(resendTimer)
})
</script>
