import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import http from 'http'
import https from 'https'

// 动态代理插件：通过 _target query 参数转发请求到任意目标地址
function dynamicProxyPlugin() {
  return {
    name: 'dynamic-proxy',
    configureServer(server) {
      // 不使用路径前缀挂载，手动判断完整路径，避免 Connect 剥离前缀导致的解析混乱
      server.middlewares.use((req, res, next) => {
        // 只处理以 /proxy 开头的请求
        if (!req.url || !req.url.startsWith('/proxy')) {
          return next()
        }

        // req.url 是完整路径：/proxy/v1/images/generations?_target=https%3A%2F%2Fxxx
        const url = new URL(req.url, `http://${req.headers.host}`)
        const target = url.searchParams.get('_target')

        if (!target) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing _target parameter' }))
          return
        }

        // 解析目标地址
        let targetUrl
        try {
          targetUrl = new URL(target)
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid _target URL' }))
          return
        }

        // 构建真实请求路径（去掉 /proxy 前缀和 _target 参数）
        const cleanSearch = url.search
          .replace(/[?&]_target=[^&]*/g, '')
          .replace(/^[?&]/, '')
          .replace(/&$/, '')
        const realPath = url.pathname.replace(/^\/proxy/, '') || '/'
        const finalPath = cleanSearch ? `${realPath}?${cleanSearch}` : realPath

        // 选择 http 或 https 模块
        const transport = targetUrl.protocol === 'https:' ? https : http

        // 移除可能导致问题的 hop-by-hop 头
        const forwardHeaders = { ...req.headers }
        delete forwardHeaders['host']
        delete forwardHeaders['connection']
        delete forwardHeaders['content-length']
        forwardHeaders['host'] = targetUrl.host

        // 转发请求
        const proxyOptions = {
          hostname: targetUrl.hostname,
          port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
          path: finalPath,
          method: req.method,
          headers: forwardHeaders
        }

        // 调试日志
        console.log(`[Proxy] ${req.method} -> ${targetUrl.protocol}//${targetUrl.host}${finalPath}`)

        const proxyReq = transport.request(proxyOptions, (proxyRes) => {
          console.log(`[Proxy] Response: ${proxyRes.statusCode}`)
          // 缓冲完整响应后一次性返回，避免 pipe 流式传输中断
          const chunks = []
          proxyRes.on('data', (chunk) => chunks.push(chunk))
          proxyRes.on('end', () => {
            const body = Buffer.concat(chunks)
            // 过滤掉可能导致问题的 transfer-encoding 头
            const headers = { ...proxyRes.headers }
            delete headers['transfer-encoding']
            // 更新 content-length 为实际长度
            headers['content-length'] = body.length
            res.writeHead(proxyRes.statusCode, headers)
            res.end(body)
          })
          proxyRes.on('error', (err) => {
            console.error('[Proxy Response Error]', err.message)
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' })
            }
            res.end(JSON.stringify({ error: 'Proxy response error', message: err.message }))
          })
        })

        proxyReq.on('error', (err) => {
          console.error('[Proxy Error]', err.message)
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' })
          }
          res.end(JSON.stringify({ error: 'Proxy error', message: err.message }))
        })

        // 流式转发请求体（POST/PUT 等）
        req.on('data', (chunk) => proxyReq.write(chunk))
        req.on('end', () => proxyReq.end())
        req.on('error', (err) => proxyReq.destroy(err))
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/huobao-canvas',
  plugins: [vue(), dynamicProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    proxy: {
      '/v1': {
        target: 'https://api.openai.com',
        changeOrigin: true
      },
      // 阿里云万相API代理
      '/services': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/services/, '/api/v1/services')
      },
      '/tasks': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tasks/, '/api/v1/tasks')
      }
    }
  }
})
