import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' —— GH Pages 子路径部署（相对路径 + hash 路由）
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: '408 刷题',
        short_name: '408刷题',
        description: '2009-2024 年 408 考研统考单选真题练习 + 错题本 + 统计',
        theme_color: '#2563eb',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // 预缓存所有静态资源（首屏 + 数据）
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest}'],
        // 数据文件 cache 策略：StaleWhileRevalidate（数据 7 天内可用，离线优先）
        runtimeCaching: [
          {
            urlPattern: /\/data\/questions\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'quiz-data',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
        // 离线回退页（hash 路由下不需要单独的 fallback）
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  base: './',
  build: {
    outDir: 'dist',
  },
})
