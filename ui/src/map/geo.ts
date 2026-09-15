// Geographic projection for the schematic map: Albers equal-area conic tuned for Russia (standard parallels 52°/64°,
// central meridian 100°E), then scaled into the map's world space (1000 × 600 units). The canvas stays projection-agnostic:
// everything (assets, pipelines, basemap rings) is projected once at world-build time.

const D2R = Math.PI / 180
const PHI1 = 52 * D2R, PHI2 = 64 * D2R, LAM0 = 100 * D2R, PHI0 = 60 * D2R
const N = (Math.sin(PHI1) + Math.sin(PHI2)) / 2
const C = Math.cos(PHI1) ** 2 + 2 * N * Math.sin(PHI1)
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(PHI0)) / N

function albers(lon: number, lat: number): [number, number] {
  const phi = lat * D2R; const lam = lon * D2R
  const rho = Math.sqrt(C - 2 * N * Math.sin(phi)) / N
  const theta = N * (lam - LAM0)
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)]
}

// Fit box: lon 20°E…150°E, lat 40°N…78°N → world 0…1000 × 0…600 (y grows downwards).
const corners = [[20, 40], [150, 40], [20, 78], [150, 78], [85, 40], [85, 78], [20, 60], [150, 60]].map(([lo, la]) => albers(lo, la))
const minX = Math.min(...corners.map(c => c[0])), maxX = Math.max(...corners.map(c => c[0]))
const minY = Math.min(...corners.map(c => c[1])), maxY = Math.max(...corners.map(c => c[1]))
const SCALE = Math.min(1000 / (maxX - minX), 600 / (maxY - minY))
const OX = (1000 - (maxX - minX) * SCALE) / 2, OY = (600 - (maxY - minY) * SCALE) / 2

/** lon/lat → schematic world coordinates. */
export function project(lon: number, lat: number): [number, number] {
  const [x, y] = albers(lon, lat)
  return [+(OX + (x - minX) * SCALE).toFixed(2), +(OY + (maxY - y) * SCALE).toFixed(2)]
}

export interface BaseRing { points: [number, number][] }
export interface Basemap { land: BaseRing[]; home: BaseRing[] }

/** Project Natural Earth rings (lon/lat pairs) into world space; `homeIso` rings are returned separately for emphasis. */
export function projectBasemap(countries: { iso: string; rings: [number, number][][] }[], homeIso = 'RU'): Basemap {
  const land: BaseRing[] = []; const home: BaseRing[] = []
  for (const c of countries) for (const ring of c.rings) {
    const pts = ring.map(([lon, lat]) => project(lon, lat))
    if (pts.length < 3) continue
    ;(c.iso === homeIso ? home : land).push({ points: pts })
  }
  return { land, home }
}
