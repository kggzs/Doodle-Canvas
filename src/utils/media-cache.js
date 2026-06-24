const DB_NAME = 'doodle-canvas-media-cache'
const DB_VERSION = 1
const STORE_NAME = 'media'
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000
const MAX_CACHE_BYTES = 250 * 1024 * 1024
const MAX_PRUNE_ENTRIES = 20
const MAX_PARALLEL_FETCHES = 4

let dbPromise = null
const objectUrlBySource = new Map()
const pendingObjectUrlBySource = new Map()
const fetchQueue = []
let activeFetches = 0

function canUseIndexedDB() {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

function normalizeSourceUrl(sourceUrl) {
  if (!sourceUrl || typeof sourceUrl !== 'string') return ''
  try {
    return new URL(sourceUrl, window.location.href).toString()
  } catch {
    return ''
  }
}

function openMediaDb() {
  if (!canUseIndexedDB()) return Promise.resolve(null)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'url' })

      if (!store.indexNames.contains('lastAccessedAt')) {
        store.createIndex('lastAccessedAt', 'lastAccessedAt')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })

  return dbPromise
}

async function readCachedMedia(url) {
  const db = await openMediaDb()
  if (!db) return null

  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(url)

    request.onsuccess = () => {
      const record = request.result
      if (!record?.blob || Date.now() - Number(record.createdAt || 0) > MAX_CACHE_AGE_MS) {
        resolve(null)
        return
      }
      resolve(record)
    }
    request.onerror = () => resolve(null)
  })
}

async function writeCachedMedia(record) {
  const db = await openMediaDb()
  if (!db) return

  await new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(record)
    transaction.oncomplete = resolve
    transaction.onerror = resolve
    transaction.onabort = resolve
  })
}

async function touchCachedMedia(url) {
  const db = await openMediaDb()
  if (!db) return

  const record = await readCachedMedia(url)
  if (!record) return
  await writeCachedMedia({
    ...record,
    lastAccessedAt: Date.now()
  })
}

async function listCachedMedia() {
  const db = await openMediaDb()
  if (!db) return []

  return new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).getAll()

    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : [])
    request.onerror = () => resolve([])
  })
}

async function deleteCachedMedia(urls) {
  const db = await openMediaDb()
  if (!db || !urls.length) return

  await new Promise((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    urls.forEach((url) => store.delete(url))
    transaction.oncomplete = resolve
    transaction.onerror = resolve
    transaction.onabort = resolve
  })
}

async function pruneMediaCache() {
  const records = await listCachedMedia()
  if (!records.length) return

  const now = Date.now()
  const expiredUrls = records
    .filter((record) => now - Number(record.createdAt || 0) > MAX_CACHE_AGE_MS)
    .map((record) => record.url)

  if (expiredUrls.length) {
    await deleteCachedMedia(expiredUrls)
  }

  const activeRecords = records
    .filter((record) => !expiredUrls.includes(record.url))
    .sort((a, b) => Number(a.lastAccessedAt || a.createdAt || 0) - Number(b.lastAccessedAt || b.createdAt || 0))

  let totalBytes = activeRecords.reduce((total, record) => total + Number(record.size || record.blob?.size || 0), 0)
  const removeUrls = []

  for (const record of activeRecords) {
    if (totalBytes <= MAX_CACHE_BYTES || removeUrls.length >= MAX_PRUNE_ENTRIES) break
    removeUrls.push(record.url)
    totalBytes -= Number(record.size || record.blob?.size || 0)
  }

  if (removeUrls.length) {
    await deleteCachedMedia(removeUrls)
  }
}

function createTrackedObjectUrl(sourceUrl, blob) {
  const existingUrl = objectUrlBySource.get(sourceUrl)
  if (existingUrl) return existingUrl

  const objectUrl = URL.createObjectURL(blob)
  objectUrlBySource.set(sourceUrl, objectUrl)
  return objectUrl
}

function runNextFetches() {
  while (activeFetches < MAX_PARALLEL_FETCHES && fetchQueue.length) {
    const { task, resolve } = fetchQueue.shift()
    activeFetches += 1

    task()
      .then(resolve)
      .catch(() => resolve(null))
      .finally(() => {
        activeFetches -= 1
        runNextFetches()
      })
  }
}

function enqueueImageFetch(task) {
  return new Promise((resolve) => {
    fetchQueue.push({ task, resolve })
    runNextFetches()
  })
}

async function fetchImageBlob(sourceUrl) {
  const response = await fetch(sourceUrl, {
    credentials: 'same-origin',
    cache: 'force-cache'
  })

  if (!response.ok) return null

  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const blob = await response.blob()
  const blobType = String(blob.type || contentType).toLowerCase()

  if (!blob.size || !blobType.startsWith('image/')) return null
  return blob.type ? blob : blob.slice(0, blob.size, contentType || 'image/png')
}

async function resolveCachedImageObjectUrl(sourceUrl, normalizedUrl) {
  const cached = await readCachedMedia(normalizedUrl)
  if (cached?.blob) {
    touchCachedMedia(normalizedUrl)
    return createTrackedObjectUrl(normalizedUrl, cached.blob)
  }

  try {
    const blob = await enqueueImageFetch(() => fetchImageBlob(normalizedUrl))
    if (!blob) return sourceUrl

    const now = Date.now()
    await writeCachedMedia({
      url: normalizedUrl,
      blob,
      size: blob.size,
      type: blob.type,
      createdAt: now,
      lastAccessedAt: now
    })
    pruneMediaCache()
    return createTrackedObjectUrl(normalizedUrl, blob)
  } catch {
    return sourceUrl
  }
}

export async function getCachedImageObjectUrl(sourceUrl) {
  const normalizedUrl = normalizeSourceUrl(sourceUrl)
  if (!normalizedUrl || !canUseIndexedDB() || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return sourceUrl
  }

  const existingUrl = objectUrlBySource.get(normalizedUrl)
  if (existingUrl) return existingUrl

  const pendingObjectUrl = pendingObjectUrlBySource.get(normalizedUrl)
  if (pendingObjectUrl) return pendingObjectUrl

  const pendingObjectUrlPromise = resolveCachedImageObjectUrl(sourceUrl, normalizedUrl)
    .finally(() => {
      pendingObjectUrlBySource.delete(normalizedUrl)
    })

  pendingObjectUrlBySource.set(normalizedUrl, pendingObjectUrlPromise)
  return pendingObjectUrlPromise
}

export function releaseCachedImageObjectUrls() {
  objectUrlBySource.forEach((objectUrl) => {
    URL.revokeObjectURL(objectUrl)
  })
  objectUrlBySource.clear()
}
