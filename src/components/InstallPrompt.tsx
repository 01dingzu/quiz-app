import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * 手机安装引导（PWA「添加到主屏幕」）
 *
 * 这个站点是 PWA：手机不需要下载安装包，浏览器里点一下「添加到主屏幕」
 * 就会生成桌面图标并以全屏 standalone 运行。装完后和网页仍是同一份代码、
 * 同一个部署点，gh-pages 发一次版，手机下次打开自动吃到新版（SW autoUpdate）。
 *
 * 站点原先没有任何安装提示，手机上很难自己发现入口，所以这里按浏览器环境
 * 给出对应步骤。纯 UI 组件，不碰题库、不碰刷题状态，也不引入新依赖。
 */

const SITE_URL = 'https://01dingzu.github.io/quiz-app/'
const DISMISS_KEY = 'quiz-app:install-dismissed'
const INSTALLED_KEY = 'quiz-app:install-installed'
/** 页脚「装到手机」通过自定义事件随时重新打开面板（关闭后也能再找到） */
export const OPEN_INSTALL_EVENT = 'quiz-app:install-open'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type EnvKind = 'ios' | 'android' | 'inapp' | 'desktop' | 'installed'

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 隐私模式下 localStorage 可能不可写，忽略即可 */
  }
}

function detectEnv(): EnvKind {
  if (typeof window === 'undefined') return 'desktop'
  const nav = window.navigator as Navigator & { standalone?: boolean }
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches === true ||
    nav.standalone === true
  if (standalone || lsGet(INSTALLED_KEY) === '1') return 'installed'

  const ua = nav.userAgent || ''
  // 微信 / QQ / 微博 / 钉钉 / 支付宝内置浏览器不支持添加到主屏幕，
  // 必须先「在浏览器中打开」跳到系统浏览器。
  if (/MicroMessenger|QQ\/|Weibo|DingTalk|AlipayClient|Quark|UCBrowser|baiduboxapp/i.test(ua)) {
    return 'inapp'
  }
  // iPadOS 13+ 默认伪装成 Macintosh，用触控点数兜底
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)
  if (ios) return 'ios'
  if (/Android|HarmonyOS/i.test(ua)) return 'android'
  return 'desktop'
}

function Steps({ kind }: { kind: EnvKind }) {
  if (kind === 'installed') {
    return (
      <div className="install-note">
        已经是 App 模式了。之后我这边每次更新，你下次打开就是新版，<b>不用重装、不用手动更新</b>；
        偶尔吃到旧版的话，连刷一两次页面即可。
      </div>
    )
  }

  if (kind === 'inapp') {
    return (
      <>
        <p className="install-hint">当前是微信 / QQ 等内置浏览器，它不提供「添加到主屏幕」。先跳出去：</p>
        <ol className="install-steps">
          <li>点右上角「⋯」</li>
          <li>选「在浏览器中打开」，跳到系统浏览器</li>
          <li>再按下面 Safari 或 Chrome 的步骤添加</li>
        </ol>
        <p className="install-hint install-hint-sub">iPhone → Safari 步骤；安卓 → Chrome 步骤，见下方折叠。</p>
      </>
    )
  }

  if (kind === 'ios') {
    return (
      <>
        <p className="install-hint">iPhone / iPad 请用 <b>Safari</b> 打开本页（其他浏览器装不了）：</p>
        <ol className="install-steps">
          <li>点屏幕<strong>底部中间</strong>的「分享」按钮（方框 + 向上箭头）</li>
          <li>在弹出来的列表里往下滑，找到「<strong>添加到主屏幕</strong>」</li>
          <li>右上角点「添加」，桌面就出现「考研刷题」图标</li>
        </ol>
        <p className="install-note">之后从桌面图标进入是全屏无地址栏的，断网也能刷已缓存的题。</p>
      </>
    )
  }

  if (kind === 'android') {
    return (
      <>
        <p className="install-hint">安卓请用 <b>Chrome / Edge / 三星浏览器</b> 打开：</p>
        <ol className="install-steps">
          <li>点右上角「⋮」菜单</li>
          <li>选「<strong>安装应用</strong>」或「添加到主屏幕」</li>
          <li>确认，桌面出现「考研刷题」图标</li>
        </ol>
        <p className="install-note">如果浏览器支持，下面会直接出现「一键安装」按钮，点它更省事。</p>
      </>
    )
  }

  return (
    <>
      <p className="install-hint">这是给手机用的。在手机浏览器打开下面这个网址，再按提示添加即可：</p>
      <div className="install-url">{SITE_URL}</div>
      <p className="install-note">
        桌面版 Chrome / Edge 也能装：地址栏右侧会出现一个「安装」图标，点一下就变成独立窗口。
      </p>
    </>
  )
}

export default function InstallPrompt() {
  const env = useMemo(detectEnv, [])
  const [open, setOpen] = useState(false)
  const [installed, setInstalled] = useState(env === 'installed')
  const [nativeReady, setNativeReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const deferred = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    const onBeforeInstall = (e: Event) => {
      // 阻止浏览器自带的迷你提示条，改由面板里的按钮统一触发
      e.preventDefault()
      deferred.current = e as BeforeInstallPromptEvent
      setNativeReady(true)
    }
    const onInstalled = () => {
      lsSet(INSTALLED_KEY, '1')
      setInstalled(true)
      setOpen(false)
    }

    window.addEventListener(OPEN_INSTALL_EVENT, onOpen)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    // 首次访问：移动端、未安装、没点过「不再提示」→ 延迟轻提示，不挡首屏
    let timer: number | undefined
    if (env !== 'desktop' && env !== 'installed' && !lsGet(DISMISS_KEY)) {
      timer = window.setTimeout(() => setOpen(true), 1600)
    }

    return () => {
      window.removeEventListener(OPEN_INSTALL_EVENT, onOpen)
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      if (timer) window.clearTimeout(timer)
    }
  }, [env])

  const kind: EnvKind = installed ? 'installed' : env

  async function doNativeInstall() {
    const e = deferred.current
    if (!e) return
    try {
      await e.prompt()
      const choice = await e.userChoice
      if (choice.outcome === 'accepted') {
        lsSet(INSTALLED_KEY, '1')
        setInstalled(true)
        setOpen(false)
      }
    } finally {
      deferred.current = null
      setNativeReady(false)
    }
  }

  function close(remember: boolean) {
    setOpen(false)
    if (remember) lsSet(DISMISS_KEY, '1')
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(SITE_URL)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = SITE_URL
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* 极老浏览器不支持，忽略 */
      }
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (!open) return null

  return (
    <div className="install-mask" onClick={() => close(false)} role="presentation">
      <div
        className="install-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="安装到手机"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="install-head">
          <div>
            <div className="install-title">
              {kind === 'installed' ? '已经装好了' : '把刷题装到手机桌面'}
            </div>
            <div className="install-sub">和网页同一份 · 我更新你自动跟着更新</div>
          </div>
          <button className="install-x" onClick={() => close(false)} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="install-body">
          <Steps kind={kind} />
          {kind === 'inapp' && (
            <details className="install-more">
              <summary>展开 iPhone / 安卓的具体步骤</summary>
              <div className="install-more-inner">
                <p className="install-hint"><b>iPhone（Safari）</b>：底部分享按钮 → 添加到主屏幕 → 添加</p>
                <p className="install-hint"><b>安卓（Chrome）</b>：右上角 ⋮ → 安装应用 → 确认</p>
              </div>
            </details>
          )}
        </div>

        <div className="install-actions">
          {/* iOS Safari / 微信内置都不支持 beforeinstallprompt，别给点了没反应的按钮。
              只有 Android Chrome 与桌面 Chromium 才可能拿到原生安装事件。 */}
          {nativeReady && !installed && (kind === 'android' || kind === 'desktop') && (
            <button className="install-primary" onClick={doNativeInstall}>
              一键安装
            </button>
          )}
          <button className="install-ghost" onClick={copyUrl}>
            {copied ? '已复制 ✓' : '复制网址'}
          </button>
          {!installed && (
            <button className="install-later" onClick={() => close(true)}>
              不再提示
            </button>
          )}
          {installed && (
            <button className="install-primary" onClick={() => close(false)}>
              知道了
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
