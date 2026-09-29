/// <reference lib="webworker" />
/**
 * 战斗模拟 Worker 入口（G12）：模拟器推演移出主线程（大编队不卡 UI）。
 * 协议：{ id, attacker, defender } → { id, result } | { id, error }
 */
import { fleetFromIntel, runSimulation, type FleetCounts } from './battleSim'

interface RunMsg {
  id: number
  attacker: FleetCounts
  defender: FleetCounts
}

interface IntelMsg {
  id: number
  visibleShips: unknown
}

self.onmessage = (ev: MessageEvent<RunMsg | (IntelMsg & { kind: 'intel' })>) => {
  const msg = ev.data as RunMsg & { kind?: 'intel'; visibleShips?: unknown }
  try {
    if (msg.kind === 'intel') {
      self.postMessage({ id: msg.id, result: fleetFromIntel(msg.visibleShips) })
      return
    }
    self.postMessage({ id: msg.id, result: runSimulation(msg.attacker, msg.defender) })
  } catch (e) {
    self.postMessage({ id: msg.id, error: e instanceof Error ? e.message : String(e) })
  }
}
