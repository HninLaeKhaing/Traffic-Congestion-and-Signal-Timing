# Flowstate Traffic Congestion and Signal Timing

Developer guide for the India-wide traffic monitoring and signal timing prototype.

## What the system does

Flowstate reads live road-speed and travel-time observations from the TomTom Traffic Flow API, finds mapped traffic-signal locations from OpenStreetMap, analyzes congestion at those points, and presents the results on a real geographic map.

The system currently supports:

- Preset Indian cities including Bengaluru, Mumbai, Delhi, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, Jaipur, Lucknow, Kochi, and Chandigarh.
- Free-text Indian city search through OpenStreetMap Nominatim geocoding.
- Real OpenStreetMap signal coordinates loaded through Overpass.
- Real TomTom current speed, free-flow speed, current travel time, free-flow travel time, and confidence values.
- Manager-configurable Watch and Critical delay thresholds.
- Speed-based timing proxies when traffic volume and signal-phase data are unavailable.
- Explicit data-quality labeling so proxy recommendations are not presented as high-accuracy controller plans.

The system does not currently send commands to physical traffic controllers.

---

# Part 1: Backend

## Location

Backend source:

- `server/index.ts`
- `server/optimizer.ts`

The backend is a Node.js TypeScript service using Express. It runs separately from the Vite frontend.

## Technology

- Node.js
- TypeScript
- Express 5
- `tsx` for running TypeScript directly
- `dotenv` for environment configuration
- `cors` for local cross-origin access
- Native `fetch` for external APIs

## Start the backend

From the project root:

```powershell
npm run api
```

The API listens on:

```text
http://localhost:8787
```

The frontend development server proxies `/api` requests to this port.

## Environment configuration

Create `.env` in the project root, next to `package.json`:

```env
TOMTOM_API_KEY=your_real_tomtom_key
API_PORT=8787
```

The key must not be placed in `src/.env`, committed to Git, or exposed in frontend code.

## HTTP endpoints

### Health

```http
GET /api/health
```

Example response:

```json
{
  "ok": true,
  "provider": "tomtom",
  "country": "India",
  "liveDataRequired": true
}
```

### City catalog

```http
GET /api/cities
```

Returns the preset Indian city list used by the UI.

### Live network analysis

```http
GET /api/network?city=mumbai&watchDelay=20&criticalDelay=45
```

Parameters:

- `city`: Preset city ID, city name, or free-text Indian city.
- `watchDelay`: Delay in seconds at which a point becomes Watch.
- `criticalDelay`: Delay in seconds at which a point becomes Critical.

The response contains:

- Resolved city coordinates.
- Thresholds used for classification.
- Provider and evidence metadata.
- Live analyzed intersections.
- Network-level average delay and speed.

## Backend request flow

```text
Frontend city request
        |
        v
Resolve preset city or geocode with Nominatim
        |
        v
Load traffic signal nodes from OpenStreetMap Overpass
        |
        v
Request TomTom Flow data for each signal coordinate
        |
        v
Run congestion and signal analysis
        |
        v
Return evidence, status, and recommendation metadata
```

## External service responsibilities

### TomTom Traffic Flow API

TomTom supplies live road-segment observations:

- `currentSpeed`
- `freeFlowSpeed`
- `currentTravelTime`
- `freeFlowTravelTime`
- `confidence`

TomTom Flow does not supply all information required for accurate signal timing. In this project it does not provide approach-level vehicle counts, turning movements, lane geometry, or current controller phase state.

### OpenStreetMap services

Nominatim resolves free-text city names.

Overpass finds nearby nodes tagged:

```text
highway=traffic_signals
```

The backend tries multiple public Overpass instances and caches successful signal coordinates in memory. Public Overpass servers can rate-limit requests, so production deployments should use a controlled OSM data pipeline or a managed geospatial provider.

## Caching

Two in-memory caches are used:

1. `signalCache`: successful signal coordinates by city.
2. `networkCache`: live analysis by city and threshold combination for 30 seconds.

These caches disappear when the API restarts. They are not a database and must not be treated as durable storage.

---

# Part 2: Data Analysis and Database

## Current data analysis

The system receives one TomTom flow observation for each selected mapped traffic-signal point. The observation is transformed into:

- Travel-time delay in seconds.
- Speed-based congestion percentage.
- Normal, Watch, or Critical status.
- A signal timing calculation and data-quality flag.

Measured delay is calculated as:

```text
delaySeconds = max(0, currentTravelTime - freeFlowTravelTime)
```

Speed-based congestion is calculated as:

```text
congestionPercent = clamp(1 - currentSpeed / freeFlowSpeed, 0, 1) * 100
```

The frontend shows these values directly in the evidence panel and map popup.

## Current database status

There is no persistent database in the current implementation.

Live observations are fetched on demand and cached in memory for a short period. When the server restarts, historical data is lost.

This is acceptable for a live prototype, but not enough for:

- Historical trend charts.
- Before-and-after signal-plan evaluation.
- Incident investigation.
- City-wide reporting.
- Model calibration.
- Audit trails for manager decisions.

## Recommended production database

A practical production design is PostgreSQL with PostGIS and TimescaleDB:

### `cities`

```text
id
name
country
center_lat
center_lon
```

### `intersections`

```text
id
city_id
name
location geometry(Point, 4326)
osm_id
controller_id
```

### `traffic_observations`

```text
id
intersection_id
observed_at
current_speed_kmh
free_flow_speed_kmh
current_travel_time_sec
free_flow_travel_time_sec
confidence
provider
raw_payload jsonb
```

### `approach_counts`

```text
id
intersection_id
observed_at
approach
movement
vehicle_count
occupancy
queue_length_m
source
```

### `signal_phase_observations`

```text
id
intersection_id
observed_at
cycle_sec
green_sec
amber_sec
red_sec
offset_sec
phase_state
source
```

### `timing_recommendations`

```text
id
intersection_id
created_at
watch_delay_sec
critical_delay_sec
cycle_sec
green_sec
amber_sec
red_sec
offset_sec
method
calibrated
status
approved_by
approved_at
```

## Data-quality rules

The system should keep these data classes separate:

- **Observed data:** Directly received from TomTom or a sensor.
- **Derived data:** Calculated from observed data, such as delay and congestion percentage.
- **Estimated data:** Produced by a model when required inputs are incomplete.
- **Recommended control data:** A proposed signal plan that has been approved for operational use.

The current API labels speed-only timing as `speed-proxy` and sets `calibrated: false` because vehicle volumes and turning movements are missing.

---

# Part 3: Algorithm Analysis and Optimization

## Congestion classification

The backend first calculates travel-time delay from TomTom:

```text
delay = current travel time - free-flow travel time
```

The manager sets two thresholds:

```text
Normal: delay < watchDelay
Watch: watchDelay <= delay < criticalDelay
Critical: delay >= criticalDelay
```

The default values are:

```text
watchDelay = 20 seconds
criticalDelay = 45 seconds
```

These values can be changed in the Manager policy panel. The frontend sends them to `/api/network` so classification is recalculated by the backend.

## Signal timing calculation

The optimizer is in `server/optimizer.ts`.

When volume data exists, it uses a simplified Webster-style cycle calculation:

```text
C = (1.5L + 5) / (1 - Y)
```

Where:

- `C` is the cycle length.
- `L` is assumed lost time.
- `Y` is a demand ratio derived from measured approach volume.

The implementation applies practical bounds:

- Minimum cycle: 60 seconds.
- Maximum cycle: 180 seconds.
- Assumed lost time: 10 seconds.
- Amber time: 4 seconds.

It then derives green and red time from the cycle.

## Speed-proxy mode

TomTom Flow alone does not provide vehicle volumes or turning movements. In that case, the optimizer can calculate a directional speed-based proxy, but it is not calibrated for controller deployment.

The API marks this state as:

```json
{
  "calibrated": false,
  "method": "speed-proxy",
  "estimatedDelayReduction": null
}
```

The frontend allows a manager to save a **proxy draft** for review, but it does not present it as a high-accuracy plan.

## What is required for high-accuracy optimization

To produce an operational signal plan, connect:

1. Vehicle counts by approach and time interval.
2. Turning movements such as left, through, and right.
3. Number of lanes and lane utilization.
4. Queue length or occupancy.
5. Existing signal cycle and phase timings.
6. Intergreen and pedestrian clearance requirements.
7. Controller coordination and offset constraints.
8. Historical observations for calibration and validation.

With those inputs, the optimizer can use a multi-approach Webster calculation or a more advanced method such as:

- Max-pressure control.
- SCOOT-style split optimization.
- SCATS-style adaptive control.
- Model predictive control.
- SUMO microsimulation for offline validation.

Any plan should be validated in simulation and reviewed by a qualified traffic engineer before controller deployment.

---

# Part 4: Frontend

## Location

Main frontend source:

- `src/App.tsx`
- `src/App.css`
- `src/index.css`

## Technology

- React 19
- TypeScript
- Vite
- React Leaflet
- Leaflet
- OpenStreetMap map tiles
- Lucide React icons

## Frontend data flow

```text
Select or search city
        |
        v
GET /api/network?city=...&watchDelay=...&criticalDelay=...
        |
        v
Store network response in React state
        |
        +--> Metric cards
        +--> Leaflet map markers
        +--> Selected intersection evidence
        +--> Delay threshold statuses
        +--> Timing proxy or calibrated plan state
```

## Main UI sections

### City search

The top search control is the only city-changing control. It accepts a preset city or free-text Indian city.

When a new city is loaded:

- Old network data is cleared.
- The map enters a loading state.
- The API resolves the city and loads its mapped signal points.
- The map recenters on the new city.

### Live status

The status strip shows:

- Live provider.
- Loading state.
- Last update time.
- API error text when live data is unavailable.
- Pause and resume control for polling.

### Manager policy

The policy panel controls:

- Watch delay threshold.
- Critical delay threshold.

Changing either value triggers a new backend request and reclassifies all live points.

### Real map

The map uses OpenStreetMap tiles and Leaflet markers. Each marker represents a real signal coordinate returned by Overpass, not a decorative grid point.

Marker colors are derived from the configured delay policy:

- Teal: Normal.
- Amber: Watch.
- Coral: Critical.

Clicking a marker opens measured evidence:

- Current speed.
- Free-flow speed.
- Measured delay.
- Congestion percentage.
- Provider confidence.

### Selected intersection panel

The right panel shows:

- Point-level measured delay.
- Congestion classification.
- Speed evidence.
- Travel-time evidence.
- Data source.
- Timing status.
- Calibrated recommendation or proxy draft action.

## Frontend development

Run the full development environment:

```powershell
npm run dev:full
```

Or run services separately:

```powershell
npm run api
npm run dev -- --port 5174
```

The standard Vite port is `5173`; use `5174` if another Vite process is already running.

## Validation commands

```powershell
npm run build
npm run lint
```

The project currently passes both commands.

## Important production improvements

Before deploying for real traffic operations:

- Add authentication and role-based approval for timing plans.
- Add PostgreSQL/PostGIS and durable observation history.
- Replace public Overpass dependency with a controlled geospatial data service.
- Add detector/controller integrations for volume and phase data.
- Add request retries, rate limits, and provider observability.
- Store raw provider payloads for auditability.
- Add automated API and optimizer tests.
- Validate recommendations in SUMO or another traffic microsimulation tool.
- Never automatically push a proxy plan to a physical signal controller.
