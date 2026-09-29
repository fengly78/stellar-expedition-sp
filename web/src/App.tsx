import { Component, useEffect, useState, type ReactNode } from 'react'
import { sfx, startMusic } from './game/audio'
import { privacyGranted } from './game/consent'
import { installErrorReporting, recordError } from './game/errorReport'
import { toast, ToastHost } from './game/toasts'
import { useGame } from './game/state'
import GameScreen from './components/GameScreen'
import GmScreen from './screens/GmScreen'
import LoadScreen from './screens/LoadScreen'
import MainMenu from './screens/MainMenu'
import PrivacyGate from './screens/PrivacyGate'
import ProfileScreen from './screens/ProfileScreen'
import ServerScreen from './screens/ServerScreen'
import SettingsScreen from './screens/SettingsScreen'
import TitleScreen from './screens/TitleScreen'

type Phase = 'title' | 'profile' | 'menu' | 'load' | 'settings' | 'server' | 'game' | 'gm'

type ErrorBoundaryProps = { children: ReactNode; onReset: () => void }
type ErrorBoundaryState = { error: Error | null }

/** 存档是用户可导入的 JSON，损坏数据可能在渲染期直接白屏 —— 边界兜底 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error): void {
    // G11：渲染期错误进本地错误日志（默认仅本地，设置页可导出/手动上报）
    recordError('render', error.message, error.stack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="panel w-full max-w-md p-4" role="alert">
          <h2 className="page-title">界面发生错误</h2>
          <p className="mt-2 text-sm text-ink-2">渲染时出错，可能是存档数据损坏。可返回主菜单后读取其他存档或开新档。</p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-md border border-edge-2 bg-surface-2 p-2 text-xs break-words whitespace-pre-wrap text-bad">
            {this.state.error.message}
          </pre>
          <button
            className="btn btn-primary min-h-11 sm:min-h-0 mt-3"
            onClick={() => {
              this.setState({ error: null })
              this.props.onReset()
            }}
          >
            返回主菜单
          </button>
        </div>
      </div>
    )
  }
}

export default function App() {
  const devPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'game'
  const [phase, setPhase] = useState<Phase>(devPreview ? 'game' : 'title')
  const newGame = useGame((s) => s.newGame)
  const loadFromSlot = useGame((s) => s.loadFromSlot)

  useEffect(() => {
    if (phase === 'game' || phase === 'menu') startMusic()
  }, [phase])

  useEffect(() => {
    // G11：全局未捕获异常/rejection → 本地错误日志（零默认上报）
    installErrorReporting()
  }, [])

  return (
    <>
      <ToastHost />
      {/* G2 隐私同意门：未同意前整个应用只渲染声明屏（零存档/零网络接触） */}
      {!privacyGranted() ? (
        <PrivacyGate />
      ) : (
        <ErrorBoundary onReset={() => setPhase('title')}>
          {phase === 'title' && <TitleScreen onEnter={() => setPhase('profile')} />}
          {phase === 'profile' && <ProfileScreen onLogin={() => setPhase('menu')} />}
          {phase === 'menu' && (
            <MainMenu
              onNewGame={() => {
                newGame()
                // P2（体验修复）：开局只有一条欢迎——签到提示合并进来，第一分钟不再两条 toast 叠加
                toast('欢迎来到星际远征！跟着左下目标条走：先升金属矿，再补太阳能电站（电力跟不上会减产）。别忘了每日签到领资源', 'success')
                sfx('complete')
                setPhase('game')
              }}
              onContinue={() => {
                const err = loadFromSlot(0)
                if (err) {
                  toast(err, 'error')
                  sfx('error')
                } else {
                  setPhase('game')
                }
              }}
              onLoad={() => setPhase('load')}
              onSettings={() => setPhase('settings')}
              onServer={() => setPhase('server')}
              onLogout={() => setPhase('profile')}
            />
          )}
          {phase === 'load' && <LoadScreen onBack={() => setPhase('menu')} onLoaded={() => setPhase('game')} />}
          {phase === 'settings' && <SettingsScreen onBack={() => setPhase('menu')} />}
          {phase === 'server' && <ServerScreen onBack={() => setPhase('menu')} onOpenGm={() => setPhase('gm')} />}
          {phase === 'gm' && <GmScreen onBack={() => setPhase('menu')} />}
          {phase === 'game' && <GameScreen onExit={() => setPhase('menu')} />}
        </ErrorBoundary>
      )}
    </>
  )
}
