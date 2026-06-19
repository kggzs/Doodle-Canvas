/**
 * Projects store | 项目状态管理
 * Cloud-backed project list and canvas persistence.
 */
import { computed, ref } from 'vue'
import { projectApi } from '@/api/backend'

const DEFAULT_CANVAS = { nodes: [], edges: [], viewport: { x: 100, y: 50, zoom: 0.8 } }

export const projects = ref([])
export const projectsLoading = ref(false)
export const projectsLoaded = ref(false)
export const currentProjectId = ref(null)

export const currentProject = computed(() => {
  return projects.value.find(p => p.id === currentProjectId.value) || null
})

function normalizeProject(project = {}) {
  const canvasData = project.canvasData || project.canvas_data || DEFAULT_CANVAS
  return {
    ...project,
    canvasData: {
      nodes: Array.isArray(canvasData.nodes) ? canvasData.nodes : [],
      edges: Array.isArray(canvasData.edges) ? canvasData.edges : [],
      viewport: canvasData.viewport || DEFAULT_CANVAS.viewport,
      thumbnail: canvasData.thumbnail || project.thumbnail || ''
    },
    thumbnail: project.thumbnail || canvasData.thumbnail || '',
    createdAt: project.createdAt || project.created_at,
    updatedAt: project.updatedAt || project.updated_at
  }
}

function thumbnailFromCanvas(canvasData = {}) {
  const mediaNodes = (canvasData.nodes || [])
    .filter(node => (node.type === 'image' || node.type === 'video') && node.data?.url)
    .sort((a, b) => {
      const aTime = Number(a.data?.updatedAt || a.data?.createdAt || 0)
      const bTime = Number(b.data?.updatedAt || b.data?.createdAt || 0)
      return bTime - aTime
    })
  return mediaNodes[0]?.data?.thumbnail || mediaNodes[0]?.data?.url || ''
}

function upsertProject(project) {
  const normalized = normalizeProject(project)
  const index = projects.value.findIndex(item => item.id === normalized.id)
  if (index >= 0) {
    projects.value[index] = normalized
  } else {
    projects.value = [normalized, ...projects.value]
  }
  projects.value = [...projects.value].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
  return normalized
}

export async function loadProjects(params = {}) {
  projectsLoading.value = true
  try {
    const result = await projectApi.list({ pageSize: 100, ...params })
    projects.value = (result.items || []).map(normalizeProject)
    projectsLoaded.value = true
    return projects.value
  } finally {
    projectsLoading.value = false
  }
}

export async function initProjectsStore({ force = false } = {}) {
  if (projectsLoaded.value && !force) return projects.value
  return loadProjects()
}

export async function createProject(name = '未命名项目', canvasData = DEFAULT_CANVAS) {
  const result = await projectApi.create({
    name,
    canvas_data: {
      ...DEFAULT_CANVAS,
      ...canvasData
    }
  })
  const project = upsertProject(result.project)
  return project.id
}

export async function ensureProject(id, fallbackName = '未命名项目') {
  await initProjectsStore()
  if (id && id !== 'new') {
    let project = projects.value.find(item => item.id === id)
    if (!project) {
      const result = await projectApi.detail(id)
      project = upsertProject(result.project)
    }
    currentProjectId.value = project.id
    return project
  }

  const projectId = await createProject(fallbackName)
  currentProjectId.value = projectId
  return projects.value.find(item => item.id === projectId)
}

export async function updateProject(id, data) {
  const payload = { ...data }
  if (payload.canvasData && !payload.canvas_data) {
    payload.canvas_data = payload.canvasData
    delete payload.canvasData
  }
  const result = await projectApi.update(id, payload)
  upsertProject(result.project)
  return true
}

export async function updateProjectCanvas(id, canvasData) {
  const project = projects.value.find(item => item.id === id)
  if (!project) return false

  const nextCanvas = {
    ...project.canvasData,
    ...canvasData
  }
  nextCanvas.thumbnail = thumbnailFromCanvas(nextCanvas)

  project.canvasData = nextCanvas
  project.thumbnail = nextCanvas.thumbnail
  project.updatedAt = new Date().toISOString()

  await updateProject(id, { canvas_data: nextCanvas })
  return true
}

export function getProjectCanvas(id) {
  const project = projects.value.find(item => item.id === id)
  return project?.canvasData || null
}

export async function deleteProject(id) {
  await projectApi.remove(id)
  projects.value = projects.value.filter(item => item.id !== id)
  if (currentProjectId.value === id) currentProjectId.value = null
  return true
}

export async function duplicateProject(id) {
  const source = projects.value.find(item => item.id === id)
  if (!source) return null
  return createProject(`${source.name} (副本)`, source.canvasData)
}

export async function renameProject(id, name) {
  return updateProject(id, { name })
}

export async function updateProjectThumbnail(id, thumbnail) {
  const project = projects.value.find(item => item.id === id)
  const canvasData = {
    ...(project?.canvasData || DEFAULT_CANVAS),
    thumbnail
  }
  return updateProjectCanvas(id, canvasData)
}

export function getSortedProjects(sortBy = 'updatedAt', order = 'desc') {
  return computed(() => {
    const sorted = [...projects.value]
    sorted.sort((a, b) => {
      let valueA = a[sortBy]
      let valueB = b[sortBy]
      if (sortBy.toLowerCase().includes('at')) {
        valueA = new Date(valueA || 0).getTime()
        valueB = new Date(valueB || 0).getTime()
      }
      if (typeof valueA === 'string') {
        valueA = valueA.toLowerCase()
        valueB = String(valueB || '').toLowerCase()
      }
      return order === 'asc'
        ? (valueA > valueB ? 1 : -1)
        : (valueA < valueB ? 1 : -1)
    })
    return sorted
  })
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__aiCanvasProjects = {
    projects,
    loadProjects,
    createProject,
    deleteProject
  }
}
