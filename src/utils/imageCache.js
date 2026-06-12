/**
 * Image Cache Utility | 图片缓存工具
 * 使用 IndexedDB 缓存图片的 base64 数据，解决 API 生成链接时效限制问题
 */

const DB_NAME = 'huobao-canvas-image-cache'
const DB_VERSION = 1
const STORE_NAME = 'images'

/**
 * 打开 IndexedDB 数据库
 * @returns {Promise<IDBDatabase>}
 */
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 生成 URL 的缓存 key（使用原始 URL 作为 key）
 * @param {string} url - 图片 URL
 * @returns {string}
 */
const getCacheKey = (url) => {
  // data: 开头的 base64 URL 直接作为 key
  if (url.startsWith('data:')) return url.substring(0, 200)
  // 远程 URL 直接作为 key
  return url
}

/**
 * 将远程图片下载并转换为 base64
 * @param {string} url - 图片 URL
 * @returns {Promise<string|null>} base64 data URL 或 null
 */
const fetchImageAsBase64 = async (url) => {
  // 已经是 base64 的直接返回
  if (url.startsWith('data:')) return url

  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      signal: AbortSignal.timeout(30000) // 30 秒超时
    })

    if (!response.ok) return null

    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    // 跨域或网络错误，尝试通过 canvas 绘制
    return fetchImageViaCanvas(url)
  }
}

/**
 * 通过 canvas 绘制方式获取图片 base64（跨域回退方案）
 * @param {string} url - 图片 URL
 * @returns {Promise<string|null>}
 */
const fetchImageViaCanvas = (url) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        const dataUrl = canvas.toDataURL('image/png')
        resolve(dataUrl)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
    // 超时处理
    setTimeout(() => resolve(null), 15000)
  })
}

/**
 * 缓存图片到 IndexedDB
 * @param {string} url - 图片原始 URL
 * @param {string} [base64] - 可选的 base64 数据，不传则自动下载
 * @returns {Promise<boolean>} 是否缓存成功
 */
export const cacheImage = async (url, base64) => {
  if (!url) return false

  // 已经是 base64 的，直接缓存
  let base64Data = base64
  if (!base64Data) {
    base64Data = await fetchImageAsBase64(url)
  }

  if (!base64Data) return false

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)

    store.put({
      url: getCacheKey(url),
      originalUrl: url,
      base64: base64Data,
      createdAt: Date.now()
    })

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        db.close()
        resolve(true)
      }
      tx.onerror = () => {
        db.close()
        resolve(false)
      }
    })
  } catch {
    return false
  }
}

/**
 * 从缓存获取图片 base64
 * @param {string} url - 图片原始 URL
 * @returns {Promise<string|null>} base64 data URL 或 null
 */
export const getCachedImage = async (url) => {
  if (!url) return null

  // 已经是 base64 的直接返回
  if (url.startsWith('data:')) return url

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(getCacheKey(url))

    return new Promise((resolve) => {
      request.onsuccess = () => {
        db.close()
        resolve(request.result?.base64 || null)
      }
      request.onerror = () => {
        db.close()
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

/**
 * 获取缓存的图片 URL（优先返回本地缓存，否则返回原始 URL）
 * @param {string} url - 图片原始 URL
 * @returns {Promise<string>} 可用的图片 URL
 */
export const getAvailableImageUrl = async (url) => {
  if (!url) return ''
  // base64 直接可用
  if (url.startsWith('data:')) return url

  const cached = await getCachedImage(url)
  return cached || url
}

/**
 * 删除指定图片缓存
 * @param {string} url - 图片原始 URL
 * @returns {Promise<boolean>}
 */
export const deleteCachedImage = async (url) => {
  if (!url) return false

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(getCacheKey(url))

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        db.close()
        resolve(true)
      }
      tx.onerror = () => {
        db.close()
        resolve(false)
      }
    })
  } catch {
    return false
  }
}

/**
 * 清理过期缓存（超过 30 天的缓存）
 * @returns {Promise<number>} 清理的记录数
 */
export const cleanExpiredCache = async () => {
  const EXPIRE_MS = 30 * 24 * 60 * 60 * 1000 // 30 天
  const expireTime = Date.now() - EXPIRE_MS

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('createdAt')
    const range = IDBKeyRange.upperBound(expireTime)
    const request = index.openCursor(range)

    let count = 0
    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const cursor = event.target.result
        if (cursor) {
          cursor.delete()
          count++
          cursor.continue()
        }
      }
      tx.oncomplete = () => {
        db.close()
        resolve(count)
      }
      tx.onerror = () => {
        db.close()
        resolve(count)
      }
    })
  } catch {
    return 0
  }
}

/**
 * 获取缓存统计信息
 * @returns {Promise<{count: number, size: number}>}
 */
export const getCacheStats = async () => {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    return new Promise((resolve) => {
      request.onsuccess = () => {
        db.close()
        const items = request.result || []
        const size = items.reduce((sum, item) => sum + (item.base64?.length || 0), 0)
        resolve({ count: items.length, size })
      }
      request.onerror = () => {
        db.close()
        resolve({ count: 0, size: 0 })
      }
    })
  } catch {
    return { count: 0, size: 0 }
  }
}

/**
 * 清空所有图片缓存
 * @returns {Promise<boolean>}
 */
export const clearAllImageCache = async () => {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.clear()

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        db.close()
        resolve(true)
      }
      tx.onerror = () => {
        db.close()
        resolve(false)
      }
    })
  } catch {
    return false
  }
}
