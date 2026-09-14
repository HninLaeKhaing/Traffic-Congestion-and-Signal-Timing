import { useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, CarFront,
  ChevronDown, CircleHelp, Clock3, Gauge, Layers3, Map, MapPin, Menu, Pause, Play,
  Radio, Settings2, SlidersHorizontal, Sparkles, TrafficCone, TrendingUp,
} from 'lucide-react'
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

type Intersection = {
  id: string
  name: string
  lat?: number
  lon?: number
  status: 'stable' | 'watch' | 'critical'
  delay: number
  volume?: string
  cycle: number
  offset: number
  position: string
  currentSpeed?: number
  freeFlowSpeed?: number
  confidence?: number
  currentTravelTime?: number
  freeFlowTravelTime?: number
  congestion?: number
  source?: string
  signal?: { cycle: number; green: number; amber: number; red: number; offset: number; estimatedDelayReduction: number | null; calibrated: boolean; method: string }
}

const intersections: Intersection[] = [
  { id: 'oak-5th', name: 'Oak St & 5th Ave', status: 'critical', delay: 42, volume: '1,842', cycle: 112, offset: 28, position: 'top: 34%; left: 29%' },
  { id: 'oak-6th', name: 'Oak St & 6th Ave', status: 'watch', delay: 31, volume: '1,506', cycle: 108, offset: 35, position: 'top: 34%; left: 49%' },
  { id: 'oak-7th', name: 'Oak St & 7th Ave', status: 'stable', delay: 18, volume: '1,214', cycle: 104, offset: 42, position: 'top: 34%; left: 69%' },
  { id: 'pine-5th', name: 'Pine St & 5th Ave', status: 'stable', delay: 14, volume: '980', cycle: 96, offset: 17, position: 'top: 63%; left: 29%' },
  { id: 'pine-6th', name: 'Pine St & 6th Ave', status: 'watch', delay: 27, volume: '1,122', cycle: 100, offset: 24, position: 'top: 63%; left: 49%' },
  { id: 'pine-7th', name: 'Pine St & 7th Ave', status: 'stable', delay: 16, volume: '874', cycle: 92, offset: 31, position: 'top: 63%; left: 69%' },
]

function App() {
  const [network, setNetwork] = useState<{ provider: string; generatedAt: string; city?: { name: string; lat: number; lon: number }; thresholds?: { watchDelay: number; criticalDelay: number }; evidence?: { source: string; methodology: string; quality?: string; refreshSeconds: number }; summary: { networkDelay: number; vehicles: number | null; averageSpeed: number; signalsOnline: number } } | null>(null)
  const [cities, setCities] = useState<Array<{ id: string; name: string }>>([])
  const [city, setCity] = useState('bengaluru')
  const [cityInput, setCityInput] = useState('')
  const [liveError, setLiveError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState('oak-5th')
  const [isLive, setIsLive] = useState(true)
  const [range, setRange] = useState('Now')
  const [optimized, setOptimized] = useState(false)
  const [liveIntersections, setLiveIntersections] = useState<Intersection[]>([])
  const [watchDelay, setWatchDelay] = useState(20)
  const [criticalDelay, setCriticalDelay] = useState(45)
  useEffect(() => {
    fetch('/api/cities').then((response) => response.json()).then(setCities).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!isLive) return
    const loadNetwork = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/network?city=${encodeURIComponent(city)}&watchDelay=${watchDelay}&criticalDelay=${criticalDelay}`)
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error ?? 'Traffic API unavailable')
        setNetwork(payload)
        setLiveIntersections(payload.intersections.map((item: Intersection, index: number) => ({ ...item, volume: item.volume ? String(item.volume) : '—', position: intersections[index]?.position ?? '' })))
        setLiveError('')
      } catch (error) {
        setLiveError(error instanceof Error ? error.message : 'Traffic API unavailable')
      } finally {
        setLoading(false)
      }
    }
    loadNetwork()
    const timer = window.setInterval(loadNetwork, 60000)
    return () => window.clearInterval(timer)
  }, [isLive, city, watchDelay, criticalDelay])
  const selected = liveIntersections.find((intersection) => intersection.id === selectedId) ?? liveIntersections[0] ?? { id: 'none', name: 'No live intersection selected', status: 'stable' as const, delay: 0, offset: 0, position: '' }
  const submitCity = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = cityInput.trim()
    if (!query) return
    const knownCity = cities.find((item) => item.id === query.toLowerCase() || item.name.toLowerCase() === query.toLowerCase())
    setNetwork(null)
    setLiveIntersections([])
    setOptimized(false)
    setCity(knownCity?.id ?? query)
    setCityInput('')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><TrafficCone size={18} /></span><span>flowstate</span></div>
        <div className="workspace-switcher"><span className="workspace-dot" /><span>India traffic network</span></div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className="nav-item active"><Activity size={17} /> Overview</button>
          <button className="nav-item"><Map size={17} /> Network map <span className="nav-count">6</span></button>
          <button className="nav-item"><Clock3 size={17} /> Signal plans</button>
          <button className="nav-item"><BarChartIcon /> Performance</button>
        </nav>
        <div className="nav-label">Manage</div>
        <nav className="primary-nav" aria-label="Management navigation">
          <button className="nav-item"><SlidersHorizontal size={17} /> Scenarios</button>
          <button className="nav-item"><Settings2 size={17} /> Settings</button>
        </nav>
        <div className="sidebar-footer"><div className="user-avatar">AM</div><div><strong>Alex Morgan</strong><span>Traffic engineer</span></div><MoreDots /></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu"><Menu size={20} /></button>
          <div><p className="eyebrow">Monday, September 7, 2026</p><h1>Network overview</h1></div>
          <form className="city-search" onSubmit={submitCity}><MapPin size={15} /><input value={cityInput} onChange={(event) => setCityInput(event.target.value)} list="indian-city-list" placeholder={network?.city?.name ?? 'Search any Indian city'} aria-label="Search any Indian city" /><datalist id="indian-city-list">{cities.map((item) => <option key={item.id} value={item.name} />)}</datalist><button type="submit">Load</button></form>
          <div className="top-actions"><button className="icon-button" aria-label="Help"><CircleHelp size={19} /></button><button className="icon-button has-alert" aria-label="Notifications"><Bell size={19} /></button><button className="profile-button"><span className="user-avatar small">AM</span><ChevronDown size={14} /></button></div>
        </header>

        <div className="status-strip"><div className="live-state"><span className={`live-dot ${isLive ? '' : 'paused'}`} /><strong>{loading ? 'Loading live traffic' : isLive ? (network?.provider ?? 'Connecting to traffic feed') : 'Monitoring paused'}</strong><span className="muted">{liveError || (network ? `Updated ${new Date(network.generatedAt).toLocaleTimeString()}` : 'Fetching current conditions')}</span></div><button className="pause-button" onClick={() => setIsLive((value) => !value)}>{isLive ? <Pause size={14} /> : <Play size={14} />}{isLive ? 'Pause feed' : 'Resume feed'}</button></div>

        <section className="metric-grid" aria-label="Network metrics">
          <MetricCard label="Network delay" value={String(network?.summary.networkDelay ?? '—')} unit="sec" trend="live" positive={false} icon={<Clock3 size={17} />} detail="TomTom travel-time delta" />
          <MetricCard label="Vehicles / hour" value={network?.summary.vehicles ? network.summary.vehicles.toLocaleString() : 'N/A'} trend="live" positive icon={<CarFront size={17} />} detail="not supplied by flow API" />
          <MetricCard label="Avg. speed" value={String(network?.summary.averageSpeed ?? '—')} unit="km/h" trend="live" positive={false} icon={<Gauge size={17} />} detail="current estimate" />
          <MetricCard label="Signals online" value={network ? `${network.summary.signalsOnline} / ${liveIntersections.length}` : '—'} trend={network?.provider === 'Demo mode' ? 'demo' : 'live'} positive icon={<Radio size={17} />} detail={network?.provider ?? 'connecting'} warning={network?.provider === 'Demo mode'} />
        </section>

        <section className="policy-panel panel"><div><span className="section-kicker">Manager policy</span><h2>Delay thresholds for congestion</h2><p>Statuses are assigned from measured travel-time delay at each live traffic point.</p></div><div className="policy-controls"><label>Watch at <input type="number" min="1" max={criticalDelay - 1} value={watchDelay} onChange={(event) => setWatchDelay(Math.min(criticalDelay - 1, Math.max(1, Number(event.target.value) || 1)))} /> <span>sec</span></label><label>Critical at <input type="number" min={watchDelay + 1} value={criticalDelay} onChange={(event) => setCriticalDelay(Math.max(watchDelay + 1, Number(event.target.value) || watchDelay + 1))} /> <span>sec</span></label><span className="policy-note">Normal &lt; {watchDelay}s · Watch {watchDelay}-{criticalDelay - 1}s · Critical ≥ {criticalDelay}s</span></div></section>

        <section className="dashboard-grid">
          <div className="map-panel panel">
            <div className="panel-header"><div><span className="section-kicker">Indian city corridor</span><h2>{network?.city?.name ?? 'Bengaluru'} traffic flow</h2></div><div className="map-actions"><button className="select-control">All corridors <ChevronDown size={14} /></button><button className="icon-button"><Layers3 size={17} /></button></div></div>
            <div className="map-canvas real-map">{network?.city && liveIntersections.length ? <TrafficMap city={network.city} intersections={liveIntersections} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setOptimized(false) }} /> : <div className="no-live-data">{liveError || 'Waiting for live traffic evidence'}</div>}</div>
            <div className="map-footer"><span><span className="foot-dot" /> {network?.summary.signalsOnline ?? 0} mapped signals monitored</span><span>Last sync {network ? new Date(network.generatedAt).toLocaleTimeString() : '—'}</span><button className="text-button">Open network map <ArrowUpRight size={14} /></button></div>
          </div>

          <aside className="detail-panel panel"><div className="panel-header"><div><span className="section-kicker">Selected intersection</span><h2>{selected.name}</h2></div><span className={`status-badge ${selected.status}`}>{selected.status}</span></div><div className="intersection-hero"><div className="delay-number">{liveIntersections.length ? (optimized ? Math.max(selected.delay - 9, 12) : selected.delay) : '—'}<span> sec delay</span></div><span className={optimized ? 'trend-good' : 'trend-bad'}>{liveIntersections.length ? (optimized ? `-${selected.signal?.estimatedDelayReduction ?? '—'}%` : `${selected.congestion ? `-${selected.congestion}%` : '—'}`) : '—'} <span>congestion</span></span></div><div className="detail-stats"><div><span>Volume</span><strong>{selected.volume ?? '—'}<small> {selected.volume && 'veh/hr'}</small></strong></div><div><span>Avg. speed</span><strong>{selected.currentSpeed?.toFixed(1) ?? '—'}<small> {selected.currentSpeed && 'km/h'}</small></strong></div></div><div className="timing-title"><span>{selected.signal?.calibrated ? 'Calibrated timing plan' : 'Speed-based timing proxy'}</span><button className="text-button">Edit <ArrowUpRight size={14} /></button></div><div className="timing-bar"><div className="timing-green" style={{ width: `${optimized ? 53 : 44}%` }} /><div className="timing-yellow" style={{ width: '14%' }} /><div className="timing-red" /><span className="timing-marker" style={{ left: `${selected.offset}%` }} /></div><div className="timing-legend"><span><i className="green-dot" /> Green {optimized ? (selected.signal?.green ?? '—') : '—'}s</span><span><i className="yellow-dot" /> Amber {selected.signal?.amber ?? '—'}s</span><span><i className="red-dot" /> Red {optimized ? (selected.signal?.red ?? '—') : '—'}s</span></div><button className={`recommend-button ${optimized ? 'is-done' : ''}`} disabled={!liveIntersections.length} onClick={() => liveIntersections.length && setOptimized(true)}>{optimized ? <><Sparkles size={17} /> {selected.signal?.calibrated ? 'Plan applied' : 'Draft saved'}</> : selected.signal?.calibrated ? <><Sparkles size={17} /> Apply recommendation</> : <><Sparkles size={17} /> Save proxy draft</>}</button><p className="recommendation-copy">{liveIntersections.length ? (selected.signal?.calibrated ? (optimized ? `Adaptive timing active. Estimated delay reduction: ${selected.signal.estimatedDelayReduction}%.` : `Webster optimization uses measured traffic volume and phase data.`) : (optimized ? 'Proxy timing draft saved for manager review. It is not safe to push to a controller without volume and phase data.' : 'Live speed data is available, but vehicle counts and turning movements are missing. Save this as a review draft, not a field control plan.')) : 'Timing recommendations appear after live traffic evidence is connected.'}</p><div className="evidence-box"><div className="evidence-heading"><span>Evidence used</span><span className="evidence-live">● {selected.source === 'tomtom' ? 'LIVE' : 'NO DATA'}</span></div><div className="evidence-grid"><div><span>Observed / free flow</span><strong>{selected.currentSpeed?.toFixed(1) ?? '—'} / {selected.freeFlowSpeed?.toFixed(1) ?? '—'} <small>km/h</small></strong></div><div><span>Travel time</span><strong>{selected.currentTravelTime ?? '—'} / {selected.freeFlowTravelTime ?? '—'} <small>sec</small></strong></div><div><span>Confidence</span><strong>{selected.confidence ? `${Math.round(selected.confidence * 100)}%` : '—'}</strong></div><div><span>Source</span><strong>{network?.evidence?.source ?? 'No live source'}</strong></div></div></div></aside>
        </section>

        <section className="bottom-grid"><div className="chart-panel panel"><div className="panel-header"><div><span className="section-kicker">Network performance</span><h2>Average delay by hour</h2></div><div className="range-switcher">{['Now', 'Today', '7 days'].map((item) => <button key={item} className={range === item ? 'selected' : ''} onClick={() => setRange(item)}>{item}</button>)}</div></div><div className="chart-area"><div className="y-axis"><span>60s</span><span>40s</span><span>20s</span><span>0s</span></div><div className="chart"><div className="grid-line line-1" /><div className="grid-line line-2" /><div className="grid-line line-3" /><div className="area-fill" /><svg className="chart-svg" viewBox="0 0 620 190" preserveAspectRatio="none" aria-label="Average delay chart"><path d="M0 156 C30 150 45 140 71 145 S112 127 137 134 S171 104 200 112 S242 70 267 84 S300 95 328 72 S364 45 390 67 S426 112 451 106 S488 74 510 88 S548 122 570 111 S602 92 620 98" fill="none" stroke="#ee744b" strokeWidth="3" /><circle cx="390" cy="67" r="5" fill="#fff" stroke="#ee744b" strokeWidth="3" /></svg><div className="chart-tooltip"><strong>42 sec</strong><span>08:00 AM</span></div><div className="x-axis"><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>24:00</span></div></div></div></div><div className="alerts-panel panel"><div className="panel-header"><div><span className="section-kicker">Needs attention</span><h2>Active alerts <span className="alert-count">3</span></h2></div><button className="text-button">View all <ArrowUpRight size={14} /></button></div><div className="alert-list"><AlertItem icon={<AlertTriangle size={16} />} tone="critical" title="High delay detected" detail="Oak St & 5th Ave · 2 min ago" /><AlertItem icon={<Radio size={16} />} tone="watch" title="Signal offline" detail="Maple St & 4th Ave · 14 min ago" /><AlertItem icon={<TrendingUp size={16} />} tone="neutral" title="Volume spike" detail="Pine St corridor · 22 min ago" /></div></div></section>
      </main>
    </div>
  )
}

function MetricCard({ label, value, unit, trend, positive, icon, detail, warning = false }: { label: string; value: string; unit?: string; trend: string; positive: boolean; icon: React.ReactNode; detail: string; warning?: boolean }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon">{icon}</span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-bottom"><span className={warning ? 'trend-warning' : positive ? 'trend-good' : 'trend-bad'}>{positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{trend}</span><span>{detail}</span></div></article>
}

function AlertItem({ icon, tone, title, detail }: { icon: React.ReactNode; tone: string; title: string; detail: string }) { return <div className="alert-item"><span className={`alert-icon ${tone}`}>{icon}</span><div><strong>{title}</strong><span>{detail}</span></div><ChevronDown size={15} className="alert-arrow" /></div> }
function TrafficMap({ city, intersections, selectedId, onSelect }: { city: { name: string; lat: number; lon: number }; intersections: Intersection[]; selectedId: string; onSelect: (id: string) => void }) {
  return <MapContainer key={city.name} center={[city.lat, city.lon]} zoom={13} scrollWheelZoom className="leaflet-map" attributionControl><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{intersections.filter((intersection): intersection is Intersection & { lat: number; lon: number } => intersection.lat !== undefined && intersection.lon !== undefined).map((intersection) => <CircleMarker key={intersection.id} center={[intersection.lat, intersection.lon]} radius={selectedId === intersection.id ? 10 : 7} pathOptions={{ color: '#fff', weight: 2, fillColor: intersection.status === 'critical' ? '#ee744b' : intersection.status === 'watch' ? '#e5a83b' : '#3b9a92', fillOpacity: .95 }} eventHandlers={{ click: () => onSelect(intersection.id) }}><Popup><strong>{intersection.name}</strong><br />Measured delay: {intersection.delay} sec<br />Status: {intersection.status}<br />Current speed: {intersection.currentSpeed?.toFixed(1)} km/h<br />Free-flow speed: {intersection.freeFlowSpeed?.toFixed(1)} km/h<br />Confidence: {Math.round((intersection.confidence ?? 0) * 100)}%</Popup></CircleMarker>)}</MapContainer>
}
function MoreDots() { return <span className="more-dots">•••</span> }
function BarChartIcon() { return <span className="bar-chart-icon"><i /><i /><i /></span> }

export default App
