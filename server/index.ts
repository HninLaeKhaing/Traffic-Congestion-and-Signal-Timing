import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { optimizeSignal, type TrafficObservation } from './optimizer.js'

const app = express()
const port = Number(process.env.API_PORT ?? 8787)
app.use(cors())
app.use(express.json())

const cityCatalog = [
  { id: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
  { id: 'mumbai', name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { id: 'delhi', name: 'Delhi', lat: 28.6139, lon: 77.209 },
  { id: 'hyderabad', name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
  { id: 'chennai', name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { id: 'kolkata', name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { id: 'pune', name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { id: 'ahmedabad', name: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
  { id: 'jaipur', name: 'Jaipur', lat: 26.9124, lon: 75.7873 },
  { id: 'lucknow', name: 'Lucknow', lat: 26.8467, lon: 80.9462 },
  { id: 'kochi', name: 'Kochi', lat: 9.9312, lon: 76.2673 },
  { id: 'chandigarh', name: 'Chandigarh', lat: 30.7333, lon: 76.7794 },
]

type SignalPoint = { id: string; name: string; lat: number; lon: number }
const signalCache = new Map<string, SignalPoint[]>()
const networkCache = new Map<string, { createdAt: number; value: Awaited<ReturnType<typeof readNetwork>> }>()

async function loadSignalPoints(city: typeof cityCatalog[number]) {
  const cached = signalCache.get(city.id)
  if (cached) return cached
  const query = `[out:json][timeout:40];node(around:6000,${city.lat},${city.lon})[highway=traffic_signals];out body;`
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.nchc.org.tw/api/interpreter']
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Flowstate traffic research dashboard/1.0' }, body: new URLSearchParams({ data: query }) })
      if (!response.ok) continue
      const payload = await response.json() as { elements: Array<{ id: number; lat: number; lon: number; tags?: { name?: string } }> }
      if (payload.elements.length) {
        const points = payload.elements.slice(0, 8).map((point, index) => ({ id: `${city.id}-${point.id}`, name: point.tags?.name ?? `${city.name} signal ${index + 1}`, lat: point.lat, lon: point.lon }))
        signalCache.set(city.id, points)
        return points
      }
    } catch { /* Try the next public Overpass instance. */ }
  }
  throw new Error(`No mapped traffic signals could be loaded near ${city.name}; OpenStreetMap providers are busy`) 
}

async function getTomTomObservation(point: Awaited<ReturnType<typeof loadSignalPoints>>[number]): Promise<TrafficObservation> {
  const url = new URL(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json`)
  url.searchParams.set('point', `${point.lat},${point.lon}`)
  url.searchParams.set('unit', 'KMPH')
  url.searchParams.set('key', process.env.TOMTOM_API_KEY ?? '')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`TomTom returned ${response.status}`)
  const payload = await response.json() as { flowSegmentData: { currentSpeed: number; freeFlowSpeed: number; currentTravelTime: number; freeFlowTravelTime: number; confidence: number } }
  return { ...point, ...payload.flowSegmentData, source: 'tomtom' }
}

async function geocodeCity(query: string) {
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'Flowstate traffic research dashboard' } })
  if (!response.ok) throw new Error('City geocoding failed')
  const results = await response.json() as Array<{ display_name: string; lat: string; lon: string }>
  if (!results[0]) throw new Error(`No Indian city found for "${query}"`)
  return { id: query.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: results[0].display_name.split(',')[0], lat: Number(results[0].lat), lon: Number(results[0].lon) }
}

async function resolveCity(query: string) {
  const normalized = query.toLowerCase().trim()
  return cityCatalog.find((city) => city.id === normalized || city.name.toLowerCase() === normalized) ?? geocodeCity(query)
}

async function readNetwork(cityQuery: string, watchDelay: number, criticalDelay: number) {
  const cacheKey = `${cityQuery.toLowerCase().trim()}:${watchDelay}:${criticalDelay}`
  const cached = networkCache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < 30000) return cached.value
  const city = await resolveCity(cityQuery)
  if (!process.env.TOMTOM_API_KEY) throw new Error('TOMTOM_API_KEY is required for live traffic evidence')
  const points = await loadSignalPoints(city)
  const observations = await Promise.all(points.map((point) => getTomTomObservation(point)))
  const thresholds = { watchDelay, criticalDelay }
  const intersections = observations.map((observation) => optimizeSignal(observation, thresholds))
  const averageDelay = intersections.reduce((sum, item) => sum + item.delay, 0) / intersections.length
  const averageSpeed = intersections.reduce((sum, item) => sum + item.currentSpeed, 0) / intersections.length
  const value = { generatedAt: new Date().toISOString(), provider: 'TomTom Traffic Flow', city, thresholds, evidence: { source: 'TomTom Traffic Flow API + OpenStreetMap signal nodes', methodology: 'Measured segment speed and travel-time delta; vehicle counts, turning movements, and controller phase data are not supplied', quality: 'observed traffic, uncalibrated signal demand', refreshSeconds: 60 }, intersections, summary: { networkDelay: Number(averageDelay.toFixed(1)), vehicles: null, averageSpeed: Number(averageSpeed.toFixed(1)), signalsOnline: intersections.length } }
  networkCache.set(cacheKey, { createdAt: Date.now(), value })
  return value
}

app.get('/api/health', (_request, response) => response.json({ ok: Boolean(process.env.TOMTOM_API_KEY), provider: 'tomtom', country: 'India', liveDataRequired: true }))
app.get('/api/cities', (_request, response) => response.json(cityCatalog))
app.get('/api/network', async (request, response) => {
  try {
    const watchDelay = Math.max(1, Number(request.query.watchDelay ?? 20))
    const criticalDelay = Math.max(watchDelay + 1, Number(request.query.criticalDelay ?? 45))
    response.json(await readNetwork(String(request.query.city ?? 'bengaluru'), watchDelay, criticalDelay))
  } catch (error) { response.status(502).json({ error: error instanceof Error ? error.message : 'Traffic provider unavailable' }) }
})

app.listen(port, () => console.log(`Traffic API listening at http://localhost:${port}`))
