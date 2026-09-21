import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * KaTeX 的 CSS 为每个字体声明了 woff2 / woff / ttf 三种格式。
 * 目标浏览器（含 iOS Safari 15+）全部支持 woff2，另两种是纯冗余
 * —— 20 个字体 × 2 种冗余格式 ≈ 700KB 白打包。
 * 这里在 CSS 编译前把 woff / ttf 的 src 声明摘掉，只保留 woff2。
 */
function katexWoff2Only(): Plugin {
  return {
    name: 'katex-woff2-only',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('katex') || !/\.css$/i.test(id)) return null
      const out = code
        .replace(/,url\([^)]*\.woff\)\s*format\(["']woff["']\)/g, '')
        .replace(/,url\([^)]*\.ttf\)\s*format\(["']truetype["']\)/g, '')
      return out === code ? null : out
    },
  }
}

// base: './' —— GH Pages 子路径部署（相对路径 + hash 路由）
export default defineConfig({
  plugins: [
    katexWoff2Only(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: '考研刷题',
        short_name: '考研刷题',
        description:
          '408 / 政治 / 英语一 / 数学一 客观题真题练习 + 错题本 + SRS 复习 + 复试机试模块（共 1946 题）',
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
        // 预缓存所有静态资源（首屏 + 数据 + KaTeX 字体）
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest,woff2}'],
        // 五份题库随包 precache（离线可用），联网时按 SWR 取新版本
        runtimeCaching: [
          {
            urlPattern: /\/assets\/data-.*\.js$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'quiz-data',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 7 },
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
    rollupOptions: {
      output: {
        /**
         * 分片策略（v0.10 起）：
         *
         * 四份题库 JSON 合计约 1.5MB（408 单选 323KB + 408 应用题 261KB +
         * 政治 757KB + 数学 195KB），全进主包会让首屏 JS 涨到 1.5MB+。
         *
         * 这里按**文件**切独立 chunk（data-questions / data-applied /
         * data-politics / data-math），收益有三点：
         *   1. 主包只剩业务代码，首屏解析不被题库体积拖累；
         *   2. 四个数据 chunk 由浏览器并行下载，而不是串在主包里；
         *   3. 只改政治题库时，只有 data-politics 的 hash 变，
         *      408 / 数学 的 chunk 与缓存全部保留。
         *
         * 没有进一步做「按试卷异步 import」：静态 import 的语义让
         * BANK 保持同步可得，全站无需加载态；实测 gzip 后总量在可接受
         * 范围内，异步化换来的收益不足以抵掉它带来的复杂度与回归面。
         */
        manualChunks(id: string) {
          const data = /[\\/]src[\\/]data[\\/]([a-z0-9_-]+)\.json$/.exec(id)
          if (data) return `data-${data[1]}`
          if (id.includes('node_modules')) {
            if (/[\\/]node_modules[\\/]katex[\\/]/.test(id)) return 'katex'
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
              return 'react'
            }
          }
          return undefined
        },
      },
    },
  },
})
