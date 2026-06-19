<template>
  <div class="min-h-screen overflow-y-auto bg-[var(--bg-primary)] text-[var(--text-primary)]">
    <AppHeader>
      <template #left>
        <button class="flex items-center gap-2" @click="router.push('/')">
          <img src="../assets/logo.png" alt="Doodle Canvas" class="h-9 w-9" />
          <span class="font-semibold">万能涂鸦画布</span>
        </button>
      </template>
      <template #center>
        <button
          class="hidden text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:inline"
          @click="router.push('/projects')"
        >
          我的画布
        </button>
      </template>
    </AppHeader>

    <main>
      <section class="mx-auto grid min-h-[calc(100vh-72px)] max-w-6xl items-center gap-10 px-5 py-10 md:grid-cols-[1fr_520px] md:px-8">
        <div>
          <p class="mb-4 text-sm font-medium text-[var(--accent-color)]">AI Canvas for prompts, images and video</p>
          <h1 class="max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
            把灵感拖进画布，让提示词、图片和视频一起生长
          </h1>
          <p class="mt-5 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
            万能涂鸦画布把节点式创作、模型配置、积分计费和云端素材管理放在同一个工作台里。每个画布、提示词、生成结果都会同步到服务端，换设备也能继续创作。
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <button
              class="rounded-lg bg-[var(--accent-color)] px-5 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
              @click="router.push('/login')"
            >
              登录开始创作
            </button>
            <button
              class="rounded-lg border border-[var(--border-color)] px-5 py-3 text-sm font-semibold hover:bg-[var(--bg-secondary)]"
              @click="router.push('/register')"
            >
              注册账号
            </button>
          </div>
        </div>

        <div class="overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-sm">
          <img :src="productImage" alt="万能涂鸦画布工作台预览" class="h-full min-h-[320px] w-full object-cover" />
          <div class="flex items-center justify-between border-t border-[var(--border-color)] px-4 py-3 text-sm">
            <span class="font-medium">云端画布</span>
            <span class="text-[var(--accent-color)]">自动同步</span>
          </div>
        </div>
      </section>

      <section class="border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
        <div class="mx-auto grid max-w-6xl gap-4 px-5 py-10 md:grid-cols-3 md:px-8">
          <div v-for="item in features" :key="item.title" class="rounded-lg border border-[var(--border-color)] p-5">
            <h2 class="font-semibold">{{ item.title }}</h2>
            <p class="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{{ item.text }}</p>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import productImage from '@/assets/product01.jpg'

const router = useRouter()

const features = [
  { title: '节点式创作', text: '文本、问答、图片和视频节点可以自由连接，适合分镜、角色设定和多阶段生成。' },
  { title: '后台模型管理', text: '问答、图片、视频模型分开配置渠道、密钥、路径和计费规则，生成时按渠道轮询。' },
  { title: '云端持久化', text: '画布结构、提示词、生成 URL、文件 ID 和生成记录写入服务端，减少浏览器缓存依赖。' }
]
</script>
