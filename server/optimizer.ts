export type TrafficObservation = {
  id: string
  name: string
  lat: number
  lon: number
  currentSpeed: number
  freeFlowSpeed: number
  currentTravelTime: number
  freeFlowTravelTime: number
  confidence: number
  volume?: number
  source: 'tomtom' | 'demo'
}

export type OptimizedIntersection = TrafficObservation & {
  status: 'stable' | 'watch' | 'critical'
  delay: number
  congestion: number
  signal: {
    cycle: number
    green: number
    amber: number
    red: number
    offset: number
    estimatedDelayReduction: number | null
    calibrated: boolean
    method: 'webster-volume' | 'speed-proxy'
  }
}

export function optimizeSignal(observation: TrafficObservation, thresholds = { watchDelay: 20, criticalDelay: 45 }): OptimizedIntersection {
  const speedRatio = observation.freeFlowSpeed > 0 ? observation.currentSpeed / observation.freeFlowSpeed : 1
  const delay = Math.max(0, Math.round(observation.currentTravelTime - observation.freeFlowTravelTime))
  const congestion = Math.round(Math.max(0, Math.min(1, 1 - speedRatio)) * 100)
  const demand = observation.volume ? Math.min(0.92, observation.volume / 1800) : Math.min(0.92, 0.35 + congestion / 150)

  // Webster's method: C = (1.5L + 5) / (1 - Y), with practical urban bounds.
  const lostTime = 10
  const cycle = Math.round(Math.max(60, Math.min(180, (1.5 * lostTime + 5) / Math.max(0.08, 1 - demand))))
  const effectiveGreen = cycle - lostTime
  const green = Math.round(Math.max(25, effectiveGreen * Math.min(0.72, 0.46 + demand * 0.28)))
  const amber = 4
  const red = Math.max(12, cycle - green - amber)
  const calibrated = observation.volume !== undefined && observation.volume > 0
  const estimatedDelayReduction = calibrated ? Math.round(Math.max(6, Math.min(29, congestion * 0.42 + demand * 8))) : null

  return {
    ...observation,
    delay,
    congestion,
    status: delay >= thresholds.criticalDelay ? 'critical' : delay >= thresholds.watchDelay ? 'watch' : 'stable',
    signal: { cycle, green, amber, red, offset: Math.round((cycle * 0.24 + observation.lat * 10) % cycle), estimatedDelayReduction, calibrated, method: calibrated ? 'webster-volume' : 'speed-proxy' },
  }
}
