<template>
  <div v-if="announcements.length" class="announcement-banner" @click="openAnnouncement(activeAnnouncement)">
    <span class="banner-label">公告</span>
    <div class="banner-track">
      <span class="banner-text">{{ bannerText }}</span>
    </div>
  </div>

  <n-modal v-model:show="detailVisible" preset="card" class="max-w-2xl" title="公告详情">
    <div v-if="selectedAnnouncement" class="space-y-3">
      <div>
        <h3 class="text-lg font-semibold">{{ selectedAnnouncement.title }}</h3>
        <p class="mt-1 text-xs text-[var(--text-secondary)]">{{ formatDateTime(selectedAnnouncement.publishedAt || selectedAnnouncement.createdAt) }}</p>
      </div>
      <div class="whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{{ selectedAnnouncement.content }}</div>
    </div>
  </n-modal>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { NModal } from 'naive-ui'
import { announcementApi } from '@/api/backend'

const announcements = ref([])
const detailVisible = ref(false)
const selectedAnnouncement = ref(null)
let timer = null

const activeAnnouncement = computed(() => announcements.value[0] || null)
const bannerText = computed(() => announcements.value.map(item => item.title).filter(Boolean).join('  /  '))

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('zh-CN')
}

async function loadAnnouncements() {
  try {
    const data = await announcementApi.latest({ limit: 5 })
    announcements.value = data.items || []
  } catch {
    announcements.value = []
  }
}

function openAnnouncement(announcement) {
  if (!announcement) return
  selectedAnnouncement.value = announcement
  detailVisible.value = true
}

onMounted(() => {
  loadAnnouncements()
  timer = window.setInterval(loadAnnouncements, 60 * 1000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<style scoped>
.announcement-banner {
  display: none;
  align-items: center;
  width: min(30vw, 360px);
  min-width: 180px;
  max-width: 360px;
  height: 32px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

@media (min-width: 900px) {
  .announcement-banner {
    display: flex;
  }
}

.banner-label {
  flex: 0 0 auto;
  padding: 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-color);
}

.banner-track {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
}

.banner-text {
  display: inline-block;
  min-width: 100%;
  padding-right: 48px;
  font-size: 13px;
  color: var(--text-secondary);
  animation: announcement-marquee 16s linear infinite;
}

.announcement-banner:hover .banner-text {
  animation-play-state: paused;
  color: var(--text-primary);
}

@keyframes announcement-marquee {
  0% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(-100%);
  }
}
</style>
