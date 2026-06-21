<template>
  <div
    class="landing-shell h-screen overflow-y-auto text-white [--accent-color:#35e6a1] [--accent-hover:#21c986] [--bg-primary:#050711] [--bg-secondary:#0b1020] [--bg-tertiary:#131b31] [--border-color:rgba(255,255,255,0.12)] [--text-primary:#f8fbff] [--text-secondary:#a9b6d3]"
  >
    <AppHeader class="sticky top-0 z-30 border-white/10 bg-[#050711]/85 backdrop-blur-xl">
      <template #left>
        <button class="flex items-center gap-3" @click="router.push('/')">
          <span class="grid h-9 w-9 place-items-center rounded-lg border border-emerald-300/30 bg-emerald-300/10 text-sm font-black text-emerald-200">
            DC
          </span>
          <span class="font-semibold text-white">万能涂鸦画布</span>
        </button>
      </template>
    </AppHeader>

    <main>
      <section class="relative overflow-hidden border-b border-white/10">
        <div class="tech-grid absolute inset-0"></div>
        <div class="relative mx-auto max-w-7xl px-5 pb-12 pt-10 md:px-8 lg:pt-14">
          <div class="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div class="max-w-2xl">
              <div class="mb-5 inline-flex items-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                <n-icon :size="16"><SparklesOutline /></n-icon>
                AI Canvas Command Center
              </div>
              <h1 class="text-4xl font-black leading-tight text-white md:text-6xl">
                把灵感编排成可复用的 AI 生成流水线
              </h1>
              <p class="mt-5 max-w-xl text-base leading-8 text-slate-300 md:text-lg">
                从提示词、参考图、文生图到图生视频，用节点画布把创意链路拆开、连接、复用。每一步都能被看见，也能继续迭代。
              </p>

              <div class="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  class="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_18px_50px_rgba(53,230,161,0.25)] transition hover:bg-emerald-300"
                  @click="router.push('/login')"
                >
                  <n-icon :size="18"><LogInOutline /></n-icon>
                  登录开始创作
                </button>
                <button
                  class="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:border-cyan-200/50 hover:bg-white/10"
                  @click="router.push('/register')"
                >
                  注册账号
                  <n-icon :size="18"><ArrowForwardOutline /></n-icon>
                </button>
              </div>

              <div class="mt-9 grid max-w-xl grid-cols-3 gap-3">
                <div v-for="item in stats" :key="item.label" class="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div class="text-xl font-black text-white md:text-2xl">{{ item.value }}</div>
                  <div class="mt-1 text-xs leading-5 text-slate-400">{{ item.label }}</div>
                </div>
              </div>
            </div>

            <div class="relative">
              <div class="signal-line signal-line-a"></div>
              <div class="signal-line signal-line-b"></div>
              <div class="glass-panel overflow-hidden rounded-lg border border-white/15">
                <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div class="flex items-center gap-2">
                    <span class="h-2.5 w-2.5 rounded-sm bg-rose-300"></span>
                    <span class="h-2.5 w-2.5 rounded-sm bg-amber-300"></span>
                    <span class="h-2.5 w-2.5 rounded-sm bg-emerald-300"></span>
                  </div>
                  <div class="hidden items-center gap-2 text-xs font-semibold text-slate-300 sm:flex">
                    <span class="h-2 w-2 rounded-sm bg-emerald-300"></span>
                    Live canvas
                  </div>
                </div>
                <div class="relative aspect-[16/9] bg-slate-950">
                  <img
                    :src="canvasImage"
                    alt="万能涂鸦画布节点工作台"
                    class="h-full w-full object-cover object-[52%_42%]"
                    decoding="async"
                    fetchpriority="high"
                  />
                  <div class="scanline absolute inset-0"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-10 grid gap-3 md:grid-cols-3">
            <div v-for="item in highlights" :key="item.title" class="rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <div class="flex items-center gap-3">
                <span class="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-emerald-200">
                  <n-icon :size="20"><component :is="item.icon" /></n-icon>
                </span>
                <h2 class="font-bold text-white">{{ item.title }}</h2>
              </div>
              <p class="mt-3 text-sm leading-6 text-slate-400">{{ item.text }}</p>
            </div>
          </div>
        </div>
      </section>

      <section class="border-b border-white/10 bg-[#080c18]">
        <div class="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-200">Workflow Engine</p>
            <h2 class="mt-3 text-3xl font-black leading-tight text-white md:text-4xl">
              多模型流程从一张画布里跑起来
            </h2>
            <p class="mt-4 text-base leading-8 text-slate-300">
              文本、图片、视频节点可以按创作目标组合成链路。生成结果会留在画布上，方便继续作为参考图、首帧或分镜输入。
            </p>
            <div class="mt-6 space-y-3">
              <div v-for="item in pipeline" :key="item" class="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-slate-300">
                <span class="h-2 w-2 rounded-sm bg-cyan-300"></span>
                {{ item }}
              </div>
            </div>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <figure class="glass-panel overflow-hidden rounded-lg border border-white/12">
              <div class="aspect-[16/9] bg-slate-950">
                <img :src="workflowImage" alt="提示词到图片再到视频的流程画布" class="h-full w-full object-cover object-center" loading="lazy" decoding="async" />
              </div>
              <figcaption class="border-t border-white/10 px-4 py-3 text-sm font-semibold text-slate-200">
                图文到视频生成链路
              </figcaption>
            </figure>
            <figure class="glass-panel overflow-hidden rounded-lg border border-white/12 md:translate-y-8">
              <div class="aspect-[16/9] bg-slate-950">
                <img :src="workflowStoryboardImage" alt="角色参考与分镜生成流程画布" class="h-full w-full object-cover object-center" loading="lazy" decoding="async" />
              </div>
              <figcaption class="border-t border-white/10 px-4 py-3 text-sm font-semibold text-slate-200">
                角色参考与分镜迭代
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section class="bg-[#050711]">
        <div class="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <figure class="glass-panel overflow-hidden rounded-lg border border-white/12 lg:order-first">
            <div class="aspect-[16/9] bg-slate-950">
              <img :src="homeImage" alt="万能涂鸦画布项目首页" class="h-full w-full object-cover object-top" loading="lazy" decoding="async" />
            </div>
          </figure>

          <div>
            <p class="text-sm font-bold uppercase tracking-[0.2em] text-cyan-200">Project Console</p>
            <h2 class="mt-3 text-3xl font-black leading-tight text-white md:text-4xl">
              项目、素材、成果都留在同一个创作面板
            </h2>
            <p class="mt-4 text-base leading-8 text-slate-300">
              首页保留快速创建、历史项目和生成成果入口，适合把零散灵感沉淀成可继续编辑的项目库。
            </p>
            <div class="mt-7 flex flex-wrap gap-3">
              <button
                class="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100"
                @click="router.push('/projects')"
              >
                <n-icon :size="18"><LayersOutline /></n-icon>
                查看我的画布
              </button>
              <button
                class="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10"
                @click="router.push('/login')"
              >
                <n-icon :size="18"><RocketOutline /></n-icon>
                创建新流程
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { NIcon } from 'naive-ui'
import {
  ArrowForwardOutline,
  ColorPaletteOutline,
  FlashOutline,
  LayersOutline,
  LogInOutline,
  PlayCircleOutline,
  RocketOutline,
  SparklesOutline
} from '@vicons/ionicons5'
import AppHeader from '@/components/AppHeader.vue'
import canvasImage from '../assets/landing-canvas.webp'
import homeImage from '../assets/landing-home.webp'
import workflowImage from '../assets/landing-workflow.webp'
import workflowStoryboardImage from '../assets/landing-workflow2.webp'

const router = useRouter()

const stats = [
  { value: '4+', label: '核心节点类型' },
  { value: '1:1', label: '画布链路留存' },
  { value: '24h', label: '云端项目续写' }
]

const highlights = [
  {
    icon: LayersOutline,
    title: '节点式编排',
    text: '把提示词、参考图、图片生成和视频生成拆成可复用节点，长链路也能保持清晰。'
  },
  {
    icon: ColorPaletteOutline,
    title: '多模态创作',
    text: '同一项目里沉淀角色、分镜、首帧和生成结果，适合连续迭代视觉方案。'
  },
  {
    icon: FlashOutline,
    title: '即时执行',
    text: '在画布上触发生成、复用结果、继续连接下一步，让创作节奏贴近灵感。'
  }
]

const pipeline = [
  '提示词节点沉淀角色、场景、镜头和风格',
  '图片节点生成首帧、参考图或分镜画面',
  '视频节点接收画面与文本，继续生成动态片段'
]
</script>

<style scoped>
.landing-shell {
  background:
    linear-gradient(135deg, rgba(8, 13, 28, 0.98), #050711 46%, rgba(4, 24, 27, 0.96)),
    #050711;
}

.tech-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.065) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.065) 1px, transparent 1px);
  background-size: 54px 54px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.92), transparent 88%);
}

.glass-panel {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.035));
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.34);
}

.signal-line {
  position: absolute;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(53, 230, 161, 0.75), transparent);
  pointer-events: none;
}

.signal-line-a {
  left: -6%;
  right: 18%;
  top: 14%;
}

.signal-line-b {
  left: 14%;
  right: -4%;
  bottom: 12%;
  background: linear-gradient(90deg, transparent, rgba(103, 232, 249, 0.65), transparent);
}

.scanline {
  background: linear-gradient(180deg, transparent, rgba(53, 230, 161, 0.08), transparent);
  mix-blend-mode: screen;
}
</style>
