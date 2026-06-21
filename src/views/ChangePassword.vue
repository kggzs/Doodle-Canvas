<template>
  <div class="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <AppHeader :show-projects-link="true">
      <template #left>
        <button class="flex items-center gap-2" @click="router.push('/projects')">
          <img src="../assets/logo-small.webp" alt="Doodle Canvas" class="h-9 w-9" decoding="async" />
          <span class="font-semibold">修改密码</span>
        </button>
      </template>
    </AppHeader>

    <main class="mx-auto flex max-w-xl px-4 py-10">
      <section class="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-6">
        <h1 class="text-xl font-semibold">修改密码</h1>
        <n-form ref="formRef" class="mt-6" :model="form" :rules="rules" label-placement="top">
          <n-form-item label="原密码" path="oldPassword">
            <n-input v-model:value="form.oldPassword" type="password" show-password-on="click" />
          </n-form-item>
          <n-form-item label="新密码" path="newPassword">
            <n-input v-model:value="form.newPassword" type="password" show-password-on="click" />
          </n-form-item>
          <n-form-item label="确认新密码" path="confirmPassword">
            <n-input v-model:value="form.confirmPassword" type="password" show-password-on="click" />
          </n-form-item>
          <div class="mt-2 flex justify-end gap-2">
            <n-button secondary @click="router.push('/account')">返回</n-button>
            <n-button type="primary" :loading="saving" @click="submit">保存</n-button>
          </div>
        </n-form>
      </section>
    </main>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NForm, NFormItem, NInput } from 'naive-ui'
import AppHeader from '@/components/AppHeader.vue'
import { changePassword, clearAuthSession } from '@/stores/auth'

const router = useRouter()
const formRef = ref(null)
const saving = ref(false)
const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const passwordPattern = /^(?=.*[a-zA-Z])(?=.*[0-9]).+$/
const rules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: ['blur', 'input'] }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: ['blur', 'input'] },
    { min: 8, message: '新密码至少 8 位', trigger: ['blur', 'input'] },
    {
      validator: (_, value) => !value || passwordPattern.test(value),
      message: '新密码需同时包含字母和数字',
      trigger: ['blur', 'input']
    }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: ['blur', 'input'] },
    {
      validator: (_, value) => value === form.newPassword,
      message: '两次输入的新密码不一致',
      trigger: ['blur', 'input']
    }
  ]
}

async function submit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    await changePassword({
      oldPassword: form.oldPassword,
      newPassword: form.newPassword
    })
    clearAuthSession()
    window.$message?.success('密码修改成功，请重新登录')
    router.push('/login')
  } catch (err) {
    window.$message?.error(err?.message || '修改密码失败')
  } finally {
    saving.value = false
  }
}
</script>
