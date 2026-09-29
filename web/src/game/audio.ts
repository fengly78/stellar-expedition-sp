import { currentProfile, updateProfileSettings } from './accounts'

let ctx: AudioContext | null = null

function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export type SfxKind = 'click' | 'complete' | 'battle' | 'error' | 'notify'

const PRESETS: Record<SfxKind, { freq: number; dur: number; type: OscillatorType; slide?: number }> = {
  click: { freq: 880, dur: 0.05, type: 'square' },
  complete: { freq: 660, dur: 0.18, type: 'sine', slide: 990 },
  battle: { freq: 220, dur: 0.25, type: 'sawtooth', slide: 110 },
  error: { freq: 180, dur: 0.2, type: 'square' },
  notify: { freq: 520, dur: 0.12, type: 'sine' },
}

export function sfx(kind: SfxKind): void {
  const p = currentProfile()
  if (!p || !p.sfx) return
  const c = ac()
  if (!c) return
  const pre = PRESETS[kind]
  try {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = pre.type
    osc.frequency.setValueAtTime(pre.freq, c.currentTime)
    if (pre.slide) osc.frequency.exponentialRampToValueAtTime(pre.slide, c.currentTime + pre.dur)
    gain.gain.setValueAtTime(Math.max(0.0001, 0.12 * p.volume), c.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + pre.dur)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + pre.dur)
  } catch {
    // audio device unavailable → silent
  }
}

const CHORDS = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [130.81, 196.0, 261.63],
  [196.0, 246.94, 293.66],
]

let music: { gain: GainNode; oscs: OscillatorNode[]; timer: ReturnType<typeof setInterval> } | null = null

export function startMusic(): void {
  const p = currentProfile()
  if (!p || !p.music || music) return
  const c = ac()
  if (!c) return
  try {
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.0001, c.currentTime)
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, 0.035 * p.volume), c.currentTime + 3)
    const oscs = CHORDS[0].map((f) => {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = f * 0.5
      o.connect(gain)
      o.start()
      return o
    })
    gain.connect(c.destination)
    let idx = 0
    const timer = setInterval(() => {
      idx = (idx + 1) % CHORDS.length
      oscs.forEach((o, i) => o.frequency.setTargetAtTime(CHORDS[idx][i] * 0.5, c.currentTime, 1.5))
    }, 6000)
    music = { gain, oscs, timer }
  } catch {
    // silent
  }
}

export function stopMusic(): void {
  if (!music) return
  const m = music
  music = null
  try {
    const c = ac()
    if (c) m.gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 1)
    clearInterval(m.timer)
    setTimeout(() => m.oscs.forEach((o) => { try { o.stop() } catch { /* already stopped */ } }), 1200)
  } catch {
    // silent
  }
}

export function toggleMusic(): boolean {
  const next = !(currentProfile()?.music ?? false)
  updateProfileSettings({ music: next })
  if (next) startMusic()
  else stopMusic()
  return next
}
