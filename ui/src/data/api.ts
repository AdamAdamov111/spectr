// In-browser Object API (spec part 9). Every read passes the PEP: _mk filter before scoring and counting.

import { generateWorld, simNow, OPEN_SERIES, type World } from './generator'
import { currentDomainKey, setDomainKey, type DomainKey } from './domain'
import { TYPES, LINK_BY_TYPE, ACTION_BY_NAME, type ObjectType, type LinkType, type Marking } from './ontology'
import type { SpObject, SpLink, Session, HistoryEntry, FreshnessInfo, EventItem } from './types'
import { canSee, canSeeLink, decide, viewProps, canExecute, nextDecisionId, effectiveCategories } from './security'
import { AuditLog, type AuditEvent } from './audit'
import { Rng, hash32, hexHash, shortHash, fmtIso, DAY, HOUR, MIN, fmtMoney } from './rng'

// ---------- world singleton ----------
let _world: World | null = null
export function world(): World {
  if (!_world) {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
    const small = (mem != null && mem < 4) || mobile
    _world = generateWorld(2026, small ? 0.3 : 1, currentDomainKey())
    if (import.meta.env.DEV) (window as unknown as { __spectr?: unknown }).__spectr = { world: _world, audit }
  }
  return _world
}
export function switchDomain(k: DomainKey) { setDomainKey(k); location.hash = '#/s/situation'; location.reload() }
export const get = (id: string): SpObject | undefined => world().objects.get(id)
export const must = (id: string): SpObject => { const o = world().objects.get(id); if (!o) throw new Error('no object ' + id); return o }

export const audit = new AuditLog()

// ---------- search ----------
export interface SearchFilters { type?: ObjectType | 'all'; subsidiary?: string; marking?: Marking; status?: string; freshness?: 'ok' | 'warn' | 'stale'; onlyDerivedRisk?: boolean }
export interface SearchResult { items: SpObject[]; total: number; hiddenByPolicy: number; facets: { types: [ObjectType, number][]; subsidiaries: [string, number][]; markings: [Marking, number][]; statuses: [string, number][] }; tookMs: number }

const TYPE_PREFIX: Record<string, ObjectType> = { eq: 'Equipment', org: 'Organization', inn: 'Organization', well: 'Well', nps: 'PumpStation', doc: 'Document', ctr: 'Contract', prc: 'Procurement', mo: 'MaintenanceOrder', per: 'Person', inc: 'Incident', sen: 'Sensor', tank: 'Tank', emp: 'Employee', ps: 'Substation', fdr: 'Feeder', vl: 'PowerLine' }

function textOf(o: SpObject): string {
  const p = o.props
  return `${o.label} ${o.id} ${p.inn ?? ''} ${p.inventory_no ?? ''} ${p.number ?? ''} ${p.tag ?? ''} ${p.code ?? ''} ${p.name ?? ''} ${p.subject ?? ''} ${p.notice_no ?? ''} ${p.title ?? ''} ${p.full_name ?? ''}`.toLowerCase()
}

export function search(session: Session, query: string, f: SearchFilters = {}, limit = 200): SearchResult {
  const t0 = performance.now()
  const w = world()
  let q = query.trim().toLowerCase()
  let type: ObjectType | undefined = f.type && f.type !== 'all' ? f.type : undefined
  const m = q.match(/^([a-z]+):\s*(.*)$/)
  if (m && TYPE_PREFIX[m[1]]) { type = TYPE_PREFIX[m[1]]; q = m[2] }
  const pool: SpObject[] = type ? (w.byType.get(type) || []) : [...w.objects.values()]
  const terms = q.split(/\s+/).filter(Boolean)
  const items: SpObject[] = []
  let hidden = 0
  const typeC = new Map<ObjectType, number>(), subC = new Map<string, number>(), mkC = new Map<Marking, number>(), stC = new Map<string, number>()
  for (const o of pool) {
    if (terms.length) { const t = textOf(o); let ok = true; for (const term of terms) if (!t.includes(term)) { ok = false; break } if (!ok) continue }
    if (f.subsidiary && o.subsidiary !== f.subsidiary) continue
    if (f.status && String(o.props.status ?? '') !== f.status) continue
    if (f.marking && !o.markings.includes(f.marking)) continue
    if (f.freshness && freshnessStatus(o) !== f.freshness) continue
    // PEP: policy filter BEFORE counting (X-05)
    if (!canSee(session, o)) { hidden++; continue }
    typeC.set(o.type, (typeC.get(o.type) || 0) + 1)
    if (o.subsidiary) subC.set(o.subsidiary, (subC.get(o.subsidiary) || 0) + 1)
    for (const mk of o.markings) if (mk !== 'SYNTHETIC') mkC.set(mk, (mkC.get(mk) || 0) + 1)
    if (o.props.status != null) stC.set(String(o.props.status), (stC.get(String(o.props.status)) || 0) + 1)
    items.push(o)
  }
  // rank: exact label match first, then named scenario objects, then recency
  if (terms.length) items.sort((a, b) => score(b, q) - score(a, q))
  const total = items.length
  const res: SearchResult = { items: items.slice(0, limit), total, hiddenByPolicy: 0 /* never disclosed to the subject */, facets: { types: [...typeC].sort((a, b) => b[1] - a[1]), subsidiaries: [...subC].sort((a, b) => b[1] - a[1]), markings: [...mkC].sort((a, b) => b[1] - a[1]), statuses: [...stC].sort((a, b) => b[1] - a[1]).slice(0, 8) }, tookMs: Math.round((performance.now() - t0) * 10) / 10 }
  void hidden
  return res
}
function score(o: SpObject, q: string): number { const l = o.label.toLowerCase(); let s = 0; if (l === q) s += 100; if (l.startsWith(q)) s += 40; if (l.includes(q)) s += 20; if (o.history) s += 10; if (o.type === 'Organization' || o.type === 'Equipment' || o.type === 'PumpStation') s += 5; return s }

export function quickSearch(session: Session, q: string, limit = 12): SpObject[] {
  if (!q.trim()) return []
  return search(session, q, {}, limit).items
}

// ---------- links / traverse ----------
export interface Neighbor { link: SpLink; other: SpObject; direction: 'out' | 'in'; hidden?: boolean }
export function neighbors(session: Session, id: string, opts: { types?: LinkType[]; minConfidence?: number; includeHidden?: boolean } = {}): Neighbor[] {
  const w = world(); const self = get(id); if (!self) return []
  const out: Neighbor[] = []
  const push = (l: SpLink, otherId: string, direction: 'out' | 'in') => {
    if (opts.types && !opts.types.includes(l.type)) return
    if (opts.minConfidence != null && l.confidence < opts.minConfidence) return
    const other = get(otherId); if (!other) return
    const visible = canSeeLink(session, l, self, other)
    if (!visible && !opts.includeHidden) return
    out.push({ link: l, other, direction, hidden: !visible })
  }
  for (const l of w.linksFrom.get(id) || []) push(l, l.to, 'out')
  for (const l of w.linksTo.get(id) || []) push(l, l.from, 'in')
  return out
}
export function linkCounts(session: Session, id: string): { type: LinkType; label: string; count: number; direction: 'out' | 'in' }[] {
  const ns = neighbors(session, id)
  const m = new Map<string, { type: LinkType; label: string; count: number; direction: 'out' | 'in' }>()
  for (const n of ns) { const def = LINK_BY_TYPE[n.link.type]; const key = n.link.type + n.direction; const e = m.get(key); if (e) e.count++; else m.set(key, { type: n.link.type, label: n.direction === 'out' ? def.label : def.inverseLabel, count: 1, direction: n.direction }) }
  return [...m.values()].sort((a, b) => b.count - a.count)
}

export interface GraphData { nodes: SpObject[]; links: SpLink[]; hidden: Set<string> }
export function traverse(session: Session, roots: string[], depth = 1, opts: { types?: LinkType[]; minConfidence?: number; maxPerNode?: number } = {}): GraphData {
  const nodes = new Map<string, SpObject>(); const links = new Map<string, SpLink>(); const hidden = new Set<string>()
  let frontier = roots.filter(id => get(id)).map(id => must(id))
  for (const r of frontier) nodes.set(r.id, r)
  for (let d = 0; d < depth; d++) {
    const next: SpObject[] = []
    for (const n of frontier) {
      const ns = neighbors(session, n.id, { types: opts.types, minConfidence: opts.minConfidence, includeHidden: true })
      // prefer structural links over bulk (orders) so the graph stays readable
      ns.sort((a, b) => weight(b) - weight(a))
      let taken = 0
      for (const nb of ns) {
        if (taken >= (opts.maxPerNode ?? 14)) break
        if (nb.other.type === 'MaintenanceOrder' && taken > 6) continue
        if (nb.hidden) { hidden.add(nb.other.id) }
        if (!nodes.has(nb.other.id)) { nodes.set(nb.other.id, nb.other); next.push(nb.other) }
        links.set(nb.link.id, nb.link); taken++
      }
    }
    frontier = next
  }
  return { nodes: [...nodes.values()], links: [...links.values()], hidden }
}
function weight(n: Neighbor): number { const t = n.other.type; if (t === 'Person' || t === 'Organization') return 10; if (t === 'Procurement' || t === 'Contract') return 8; if (t === 'PumpStation' || t === 'Equipment' || t === 'Sensor' || t === 'Anomaly' || t === 'Incident') return 7; if (t === 'Document') return 5; if (t === 'MaintenanceOrder') return 2; return 4 }

/** Shortest path (BFS) respecting markings — the Function graph_shortest_path. */
export function shortestPath(session: Session, a: string, b: string, maxDepth = 5): { nodes: string[]; links: SpLink[] } | null {
  const prev = new Map<string, { id: string; link: SpLink } | null>(); prev.set(a, null)
  let frontier = [a]
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of neighbors(session, id)) {
        if (prev.has(nb.other.id)) continue
        prev.set(nb.other.id, { id, link: nb.link }); next.push(nb.other.id)
        if (nb.other.id === b) {
          const nodes: string[] = []; const links: SpLink[] = []; let cur: string | null = b
          while (cur) { nodes.unshift(cur); const p = prev.get(cur); if (p) { links.unshift(p.link); cur = p.id } else cur = null }
          return { nodes, links }
        }
      }
    }
    frontier = next
  }
  return null
}

// ---------- freshness ----------
export function freshnessStatus(o: SpObject): 'ok' | 'warn' | 'stale' {
  const def = TYPES[o.type]; if (!def.sloSec) return 'ok'
  const lag = (simNow() - o.materializedAt) / 1000
  return lag <= def.sloSec ? 'ok' : lag <= def.sloSec * 3 ? 'warn' : 'stale'
}
export function freshnessOf(o: SpObject): FreshnessInfo {
  const def = TYPES[o.type]
  const lagSec = Math.max(0, (simNow() - o.materializedAt) / 1000)
  const status = freshnessStatus(o)
  const src = def.sources[0]
  const r = new Rng(hash32(o.id))
  const s1 = Math.round(lagSec * 0.55), s2 = Math.round(lagSec * 0.3), s3 = Math.max(0, Math.round(lagSec) - s1 - s2)
  return { lagSec, sloSec: def.sloSec, status, source: src, pipeline: `materialize_${o.type.toLowerCase()}`, index: 'OpenSearch + PostgreSQL', chain: [{ stage: `источник ${src}`, lagSec: s1 }, { stage: 'Kafka → materializer', lagSec: s2 + r.int(0, 2) }, { stage: 'Object Index', lagSec: s3 }] }
}
export function typeFreshness(): { type: ObjectType; label: string; sloSec: number; lagSec: number; status: 'ok' | 'warn' | 'stale'; count: number }[] {
  const w = world(); const out = []
  for (const [t, arr] of w.byType) {
    const def = TYPES[t]; if (!def.sloSec) continue
    const lag = arr.length ? arr.reduce((a, o) => a + (simNow() - o.materializedAt), 0) / arr.length / 1000 : 0
    out.push({ type: t, label: def.label, sloSec: def.sloSec, lagSec: lag, status: lag <= def.sloSec ? 'ok' as const : lag <= def.sloSec * 3 ? 'warn' as const : 'stale' as const, count: arr.length })
  }
  return out.sort((a, b) => a.sloSec - b.sloSec)
}

// ---------- history ----------
export function history(o: SpObject): HistoryEntry[] {
  if (o.history) return o.history
  const r = new Rng(hash32(o.id + 'h'))
  const def = TYPES[o.type]
  const out: HistoryEntry[] = []
  const n = Math.min(o.version, 6)
  let ts = o.materializedAt
  for (let i = 0; i < n; i++) {
    const props = def.props.filter(p => p.type !== 'string').map(p => p.name)
    const prop = r.pick(props.length ? props : ['status'])
    const after = o.props[prop]; const before = typeof after === 'number' ? +(after * r.float(0.85, 1.15)).toFixed(2) : after
    out.push({ version: o.version - i, ts, cause: i === 0 ? `materialize_${o.type.toLowerCase()}@build ${shortHash(r, 4)}` : r.chance(0.2) ? 'change_order_priority' : `materialize_${o.type.toLowerCase()}@build ${shortHash(r, 4)}`, causeKind: r.chance(0.15) ? 'action' : 'pipeline', actor: r.chance(0.15) ? 'toir_eng' : undefined, diff: [{ prop, before, after }] })
    ts -= r.int(1, 30) * (def.sloSec > 3600 ? DAY : HOUR)
  }
  o.history = out
  return out
}

// ---------- explain (spec 1.4 C) ----------
export interface ExplainNode { id: string; kind: 'value' | 'function' | 'pipeline' | 'dataset' | 'raw' | 'action' | 'policy' | 'model'; title: string; subtitle?: string; details: Record<string, string>; children: ExplainNode[]; level: number; raw?: string; code?: string[] }
export function explain(session: Session, o: SpObject, prop: string): { root: ExplainNode; policy: { decision: string; markings: Marking[]; purpose: string } } {
  const w = world(); const n = w.named; const def = TYPES[o.type]; const pd = def.props.find(p => p.name === prop)
  const r = new Rng(hash32(o.id + prop))
  const meta = o.meta[prop] || {}
  const value = o.props[prop]
  const dec = decide(session, [...o.markings, ...(pd?.markings || [])])
  let idc = 0; const nid = () => `${o.id}:${prop}:${idc++}`
  const raw = (src: string, line: number, file: string, extra: Record<string, string> = {}): ExplainNode => ({ id: nid(), kind: 'raw', level: 0, title: file, subtitle: `строка ${line.toLocaleString('ru-RU')}`, details: { источник: src, rid: `${hexHash(o.id + src, 12)}`, snapshot: fmtIso(o.materializedAt - r.int(60, 1800) * 1000), 'SHA-256': hexHash(file, 16) + '…', ...extra }, children: [], raw: rawLine(o, prop, src, r) })
  const dataset = (name: string, rows: string, children: ExplainNode[], extra: Record<string, string> = {}): ExplainNode => ({ id: nid(), kind: 'dataset', level: 0, title: name, subtitle: `snapshot ${shortHash(r, 10)}`, details: { строк: rows, ветка: 'main', формат: 'Iceberg v3 / Parquet+Zstd', ...extra }, children })
  const pipeline = (name: string, children: ExplainNode[], extra: Record<string, string> = {}, code?: string[]): ExplainNode => ({ id: nid(), kind: 'pipeline', level: 0, title: name, subtitle: `build ${shortHash(r, 4)}`, details: { commit: shortHash(r, 7), image: 'sha256:' + hexHash(name + o.id, 12) + '…', lockfile: hexHash(name, 8), воркер: 'spiffe://spectr/dagster/worker-3', ...extra }, children, code })
  const fn = (name: string, children: ExplainNode[], extra: Record<string, string> = {}): ExplainNode => ({ id: nid(), kind: 'function', level: 0, title: name, subtitle: 'детерминированная функция', details: { кэш: `hit (hash входов ${shortHash(r, 8)})`, ...extra }, children })

  let root: ExplainNode
  if (o.id === n.focusAsset && prop === w.domain.focusProp) {
    const sens = must(n.focusSensor); const unit = String(sens.props.unit); const val = sens.props.last_value; const code = String(o.props.code)
    root = { id: nid(), kind: 'value', level: 0, title: `${prop} = 0.87`, subtitle: `${code} · окно 15 мин`, details: { маркировки: 'CONFIDENTIAL, PROD', версия: String(o.version) }, children: [
      pipeline('anomaly_v3', [
        dataset('enrich.anomaly_window', '1 (агрегат окна)', [
          dataset('clean.scada_telemetry', `180 (окно 15 мин, датчик ${sens.label})`, [
            raw('opcua → raw.scada.telemetry', 88412, 'raw/scada/telemetry_2026-09-14.parquet', { датчик: sens.label, значение: `${val} ${unit}`, качество: 'good' }),
            raw('opcua → raw.scada.telemetry', 88231, 'raw/scada/telemetry_2026-09-14.parquet', { датчик: sens.label, значение: `${(Number(val) * 0.77).toFixed(2)} ${unit}` }),
          ], { provenance: 'Roaring bitmap 180 rid', _mk: 'CONFIDENTIAL|PROD' }),
        ], { трансформация: 'window_agg(15m)' }),
        dataset(def.backing, '2', [raw('sap_pm → raw.sap.iflot', 12, 'raw/sap/IFLOT_2026-09-14T03-00.csv', { tplnr: code, 'функц. место': `${o.subsidiary ? get(o.subsidiary)?.label : ''}/${code}` })]),
      ], { commit: 'a1b2c3f', модель: 'isolation forest + CUSUM', параметры: 'window=15m, contamination=0.02', 'anomaly_v3': 'v3.2.1' }, ['- window = 10m', '+ window = 15m', '  contamination = 0.02', '+ cusum_threshold = 4.5']),
    ] }
  } else if (o.type === 'Equipment' && prop === 'health_index') {
    root = { id: nid(), kind: 'value', level: 0, title: `health_index = ${value}`, subtitle: o.label, details: { маркировки: o.markings.filter(m => m !== 'SYNTHETIC').join(', '), версия: String(o.version) }, children: [
      fn('functions.equipment_health_index@2.1.0', [
        pipeline('materialize_equipment', [dataset('gold.equipment', '1', [raw('sap_pm → raw.sap.equi', r.int(1000, 9000), 'raw/sap/EQUI_2026-09-14T03-00.csv', { equnr: String(o.props.inventory_no), oper_hours: String(o.props.operating_hours) })], { колонка: 'operating_hours' })], { вход: 'наработка' }),
        pipeline('anomaly_v3', [dataset('enrich.anomaly', String(neighbors(session, o.id, { types: ['detected_on'] }).length), [raw('opcua → raw.scada.telemetry', r.int(10000, 99000), 'raw/scada/telemetry_2026-09-14.parquet', { окно: '30 дней' })])], { вход: 'аномалии за 30 дней' }),
        pipeline('materialize_maintenance_order', [dataset('gold.maintenance_order', String(neighbors(session, o.id, { types: ['maintains'] }).filter(x => x.other.props.status !== 'закрыта').length), [raw(o.sources.includes('onec_toir') ? 'onec_toir OData → raw.onec.zayavki' : 'sap_pm → raw.sap.aufk', r.int(100, 9000), o.sources.includes('onec_toir') ? 'raw/onec/zayavki_2026-09-14T13-45.json' : 'raw/sap/AUFK_2026-09-14T03-00.csv', { фильтр: 'status != закрыта' })])], { вход: 'открытые заявки' }),
      ], { формула: '1 − w1·norm(hours) − w2·anomalies − w3·open_orders − w4·age', веса: '0.35 / 0.30 / 0.20 / 0.15' }),
    ] }
  } else if (o.type === 'Organization' && prop === 'risk_score') {
    const f = counterpartyRisk(session, o)
    root = { id: nid(), kind: 'value', level: 0, title: `risk_score = ${value}`, subtitle: o.label, details: { маркировки: 'INTERNAL', версия: String(o.version) }, children: [
      fn('functions.counterparty_risk_score@1.4.0', f.factors.map(fa => pipeline(fa.pipeline, [dataset(fa.dataset, String(fa.rows), [raw(fa.source, r.int(10, 90000), fa.file, fa.extra)])], { фактор: fa.label, вес: String(fa.weight), вклад: fa.contribution.toFixed(2) })), { факторов: String(f.factors.length) }),
    ] }
  } else if (o.type === 'Procurement' && prop === 'cartel_pattern') {
    root = { id: nid(), kind: 'value', level: 0, title: `cartel_pattern = ${value}`, subtitle: o.label, details: { маркировки: 'INTERNAL, FIN' }, children: [
      fn('functions.cartel_pattern@1.0.0', [
        pipeline('er_organization (учредители)', [dataset('gold.link_founder_of', '2', [raw('egrul → raw.egrul.ul', r.int(1000, 900000), 'raw/egrul/EGRUL_FULL_2026-09-01.xml', { поле: 'СвУчредит/УчрФЛ' })])], { фактор: 'общий учредитель', вес: '0.35' }),
        pipeline('materialize_bid', [dataset('gold.bid', String(o.props.bids_count), [raw('etp → raw.etp.bids', r.int(100, 9000), 'raw/etp/bids_2026-08.json', { разброс_цен: `${(o.props.winner_discount as number).toFixed(1)} %` })])], { фактор: 'близкие цены', вес: '0.25' }),
        pipeline('materialize_procurement', [dataset('gold.procurement', '6', [raw('eis → raw.eis.notices', r.int(100, 9000), 'raw/eis/223fz_notices_2026-09-13.xml', { паттерн: 'ротация победителей 3/3' })])], { фактор: 'ротация победителей', вес: '0.40' }),
      ]),
    ] }
  } else {
    const src = meta.source || (pd?.sources?.[0]) || `${o.sources[0]}.${o.type.toLowerCase()}.${prop}`
    const sys = src.split('.')[0]
    const derived = meta.derived_by || pd?.derived_by
    const file = fileFor(sys, r)
    const rawNode = raw(`${sys} → raw.${sys}.${src.split('.')[1] || o.type.toLowerCase()}`, r.int(10, 90000), file, { колонка: src.split('.').slice(-1)[0] })
    const chain = pipeline(`materialize_${o.type.toLowerCase()}`, [dataset(def.backing, '1', [dataset(`clean.${sys}_${src.split('.')[1] || o.type.toLowerCase()}`, '1', [rawNode], { quarantine: '0 строк' })])], {})
    root = { id: nid(), kind: 'value', level: 0, title: `${prop} = ${formatVal(value, pd?.type)}`, subtitle: o.label, details: { маркировки: [...o.markings, ...(pd?.markings || [])].filter(m => m !== 'SYNTHETIC').join(', '), версия: String(o.version), survivorship: pd?.survivorship || 'единственный источник' }, children: [derived ? fn(derived, [chain]) : chain] }
    if (o.sources.length > 1 && !derived) {
      const alt = o.sources[1]
      root.children[0].children.push(dataset(`clean.${alt}_${o.type.toLowerCase()}`, '1', [raw(`${alt} → raw.${alt}`, r.int(10, 9000), fileFor(alt, r), { колонка: prop, 'проиграл survivorship': pd?.survivorship || 'приоритет источника' })], { роль: 'альтернативный источник (ER crosswalk)' }))
    }
  }
  assignLevels(root, 0)
  return { root, policy: { decision: dec.id, markings: [...o.markings, ...(pd?.markings || [])].filter(m => m !== 'SYNTHETIC'), purpose: session.purpose || '' } }
}
function assignLevels(n: ExplainNode, l: number) { n.level = l; for (const c of n.children) assignLevels(c, l + 1) }
function fileFor(sys: string, r: Rng): string {
  switch (sys) { case 'open_ref': return 'raw/open_ref/ru_wikipedia_reference_2026-09-16.csv'; case 'jodi': return 'raw/jodi/world_Primary_CSV_2026-08-19.csv'; case 'eia': return 'raw/eia/RBRTEd_2026-09-16.xls'; case 'volve': return 'raw/volve/Volve_production_data.xlsx'; case 'natural_earth': return 'raw/natural_earth/ne_50m_admin_0_countries.geojson'; case 'sap_pm': case 'sap_mm': case 'sap_sd': case 'sap_hcm': return `raw/sap/${r.pick(['EQUI', 'AUFK', 'EKKO', 'LFA1', 'IFLOT', 'ANLA'])}_2026-09-14T03-00.csv`; case 'onec': case 'onec_toir': case 'onec_zup': return `raw/onec/${r.pick(['kontragenty', 'zayavki', 'oborudovanie'])}_2026-09-14T13-45.json`; case 'egrul': return 'raw/egrul/EGRUL_FULL_2026-09-01.xml'; case 'eis': return 'raw/eis/223fz_notices_2026-09-13.xml'; case 'etp': return 'raw/etp/bids_2026-08.json'; case 'scada': case 'opcua': return 'raw/scada/telemetry_2026-09-14.parquet'; case 'sed': return `raw/sed/directum_export_2026-09-${r.int(10, 14)}.zip`; case 'mail': return 'raw/mail/mailbox_toir@sn-transport_2026-09.mbox'; case 'nlp': return 'enrich/mentions_2026-09-14.parquet'; case 'crm': return 'raw/crm/counterparty_flags_2026-09-14.json'; case 'measurements': return 'raw/prod/daily_measurements_2026-09-14.xlsx'; default: return `raw/${sys}/export_2026-09-14.csv` }
}
function rawLine(o: SpObject, prop: string, src: string, r: Rng): string {
  const v = o.props[prop]
  if (src.includes('sap')) return `${String(o.props.inventory_no || o.props.number || o.props.inn || o.id.slice(-8))};${o.label};${v};${'RUB'};${'2026-09-14T03:00:12Z'}`
  if (src.includes('onec')) return `{"Ref_Key":"${hexHash(o.id, 8)}-…","Наименование":"${o.label}","${prop}":${JSON.stringify(v)},"ДатаИзменения":"2026-09-14T13:44:51"}`
  if (src.includes('egrul')) return `<СвЮЛ ИНН="${o.props.inn ?? ''}" ОГРН="${o.props.ogrn ?? ''}"><СвНаимЮЛ НаимЮЛПолн="${o.label}"/>…`
  if (src.includes('scada') || src.includes('opcua')) return `2026-09-14T10:47:${r.int(10, 59)}.${r.int(100, 999)}Z\tP-104\t${v}\tgood\tns=2;s=NPS2.P104`
  return `${o.id}\t${prop}\t${JSON.stringify(v)}`
}
function formatVal(v: unknown, t?: string): string { if (v == null) return '∅'; if (t === 'money' && typeof v === 'number') return fmtMoney(v); return String(v) }

// ---------- functions ----------
export interface Factor { label: string; weight: number; contribution: number; pipeline: string; dataset: string; source: string; file: string; rows: number; extra: Record<string, string>; objects: string[] }
export function counterpartyRisk(session: Session, o: SpObject): { score: number; factors: Factor[] } {
  const w = world(); const r = new Rng(hash32(o.id + 'risk'))
  const founders = neighbors(session, o.id, { types: ['founder_of', 'director_of'], includeHidden: true })
  const founderIds = founders.map(n => n.other.id)
  const affiliated = new Set<string>()
  for (const f of founderIds) for (const n of neighbors(session, f, { types: ['founder_of', 'director_of'], includeHidden: true })) if (n.other.id !== o.id && n.other.type === 'Organization') affiliated.add(n.other.id)
  const sameAddr = (w.byType.get('Organization') || []).filter(x => x.id !== o.id && x.props.address === o.props.address).slice(0, 5)
  const samePhone = (w.byType.get('Organization') || []).filter(x => x.id !== o.id && x.props.phone === o.props.phone).slice(0, 5)
  const procs = neighbors(session, o.id, { types: ['participated_in'] })
  const cartelProcs = procs.filter(p => (p.other.props.cartel_pattern as number) > 0.5)
  const contracts = neighbors(session, o.id, { types: ['party_to'] }).map(n => n.other)
  const overdue = contracts.filter(c => (c.props.overdue_days as number) > 0)
  const ageDays = (simNow() - new Date(o.props.registered as string).getTime()) / DAY
  const factors: Factor[] = [
    { label: `Аффилированность: общие учредители/директора с ${affiliated.size} орг.`, weight: 0.3, contribution: Math.min(0.3, affiliated.size * 0.12), pipeline: 'er_organization', dataset: 'gold.link_founder_of', source: 'egrul → raw.egrul.ul', file: 'raw/egrul/EGRUL_FULL_2026-09-01.xml', rows: founders.length, extra: { учредителей: String(founders.length) }, objects: [...affiliated].slice(0, 6) },
    { label: `Совпадение адреса/телефона: ${sameAddr.length + samePhone.length}`, weight: 0.15, contribution: Math.min(0.15, (sameAddr.length + samePhone.length) * 0.05), pipeline: 'er_organization (blocking)', dataset: 'er.candidate_pairs', source: 'onec → raw.onec.kontragenty', file: 'raw/onec/kontragenty_2026-09-14T13-45.json', rows: sameAddr.length + samePhone.length, extra: { блокировка: 'address_norm, phone_norm' }, objects: [...new Set([...sameAddr, ...samePhone].map(x => x.id))].slice(0, 6) },
    { label: `Картельные закупки: ${cartelProcs.length} из ${procs.length}`, weight: 0.3, contribution: procs.length ? Math.min(0.3, cartelProcs.length / Math.max(1, procs.length) * 0.3 + cartelProcs.length * 0.02) : 0, pipeline: 'functions.cartel_pattern', dataset: 'gold.procurement', source: 'eis → raw.eis.notices', file: 'raw/eis/223fz_notices_2026-09-13.xml', rows: procs.length, extra: { закупок: String(procs.length) }, objects: cartelProcs.map(p => p.other.id).slice(0, 6) },
    { label: `Срывы сроков: ${overdue.length} из ${contracts.length} договоров`, weight: 0.15, contribution: contracts.length ? Math.min(0.15, overdue.length / contracts.length * 0.15 + overdue.length * 0.02) : 0, pipeline: 'functions.contract_execution_status', dataset: 'gold.contract', source: 'sap_mm → raw.sap.ekko', file: 'raw/sap/EKKO_2026-09-14T03-00.csv', rows: contracts.length, extra: { просрочено: String(overdue.length) }, objects: overdue.map(c => c.id).slice(0, 6) },
    { label: `Возраст компании: ${Math.round(ageDays / 365 * 10) / 10} лет`, weight: 0.1, contribution: ageDays < 365 ? 0.1 : ageDays < 1000 ? 0.04 : 0, pipeline: 'materialize_organization', dataset: 'gold.organization', source: 'egrul → raw.egrul.ul', file: 'raw/egrul/EGRUL_FULL_2026-09-01.xml', rows: 1, extra: { зарегистрирована: String(o.props.registered) }, objects: [] },
  ]
  void r
  return { score: o.props.risk_score as number, factors }
}
export function cartelFactors(session: Session, p: SpObject): { label: string; weight: number; value: number; objects: string[] }[] {
  const parts = neighbors(session, p.id, { types: ['participated_in'] }).map(n => n.other)
  const founders = new Map<string, string[]>()
  for (const o of parts) for (const n of neighbors(session, o.id, { types: ['founder_of', 'director_of'], includeHidden: true })) { const a = founders.get(n.other.id) || []; a.push(o.id); founders.set(n.other.id, a) }
  const shared = [...founders.entries()].filter(([, v]) => v.length > 1)
  const disc = p.props.winner_discount as number
  const others = new Set<string>()
  for (const o of parts) for (const n of neighbors(session, o.id, { types: ['participated_in'] })) if (n.other.id !== p.id && parts.some(x => x !== o && neighbors(session, x.id, { types: ['participated_in'] }).some(m => m.other.id === n.other.id))) others.add(n.other.id)
  const sameAddr = parts.filter((o, i) => parts.some((x, j) => j !== i && x.props.address === o.props.address)).length
  const score = p.props.cartel_pattern as number
  return [
    { label: `Общий учредитель у участников: ${shared.length}`, weight: 0.35, value: shared.length ? 0.35 : 0, objects: shared.map(([id]) => id) },
    { label: `Совместное участие в других закупках: ${others.size}`, weight: 0.25, value: Math.min(0.25, others.size * 0.05), objects: [...others].slice(0, 8) },
    { label: `Разброс цен победителя и 2-го места: ${disc.toFixed(1)} %`, weight: 0.25, value: disc < 2 ? 0.25 : disc < 5 ? 0.1 : 0, objects: [] },
    { label: `Совпадение адресов участников: ${sameAddr}`, weight: 0.15, value: sameAddr ? 0.15 : 0, objects: parts.filter((o, i) => parts.some((x, j) => j !== i && x.props.address === o.props.address)).map(o => o.id) },
  ].map(f => ({ ...f, value: Math.min(f.weight, f.value * (score / Math.max(0.01, Math.min(1, score + 0.0001))) ) }))
}

// ---------- actions (Temporal-like workflow) ----------
export interface Precondition { text: string; ok: boolean; why?: string }
export interface ActionPreview { action: string; objectId: string; preconditions: Precondition[]; diff: { prop: string; before: unknown; after: unknown }[]; target: string; mode: string; allowed: boolean; denyReason?: string }
export interface Workflow { id: string; action: string; objectId: string; params: Record<string, unknown>; stages: { name: string; status: 'wait' | 'run' | 'done' | 'fail'; ts?: number }[]; status: 'running' | 'confirmed' | 'rejected' | 'compensated'; eventId: string; startedAt: number; target: string; actor: string; error?: string; secondSigner?: string }

export function previewAction(session: Session, action: string, objectId: string, params: Record<string, unknown>): ActionPreview {
  const def = ACTION_BY_NAME[action]; const o = must(objectId); const w = world()
  const pre: Precondition[] = []
  const allowedRole = canExecute(session, action)
  if (action === 'flag_counterparty') {
    const inc = neighbors(session, o.id, { types: ['mentions'] }).some(n => n.other.props.kind === 'Протокол')
    pre.push({ text: 'Нет активного legal hold', ok: true, why: 'реестр legal hold: 0 записей' })
    pre.push({ text: 'Роль СЭБ у инициатора', ok: session.role === 'seb', why: session.role === 'seb' ? `роль ${session.roleLabel}` : `у роли «${session.roleLabel}» нет права action:execute:flag_counterparty` })
    pre.push({ text: 'Контрагент ещё не на контроле', ok: !o.props.control_flag, why: o.props.control_flag ? 'control_flag = true' : 'control_flag = false' })
    void inc
  } else if (action === 'create_maintenance_order') {
    const hasAnomaly = neighbors(session, o.id, { types: ['detected_on'] }).length > 0
    const health = o.props.health_index as number
    const openSame = neighbors(session, o.id, { types: ['maintains'] }).some(n => n.other.props.status !== 'закрыта' && n.other.props.kind === params.kind)
    pre.push({ text: 'Индекс состояния < 0.5 или есть Anomaly', ok: health < 0.5 || hasAnomaly, why: `health_index = ${health}${hasAnomaly ? ', аномалия обнаружена' : ''}` })
    pre.push({ text: 'Нет открытой заявки того же типа', ok: !openSame, why: openSame ? `есть открытая заявка «${params.kind}»` : 'открытых заявок этого типа нет' })
    pre.push({ text: 'Оборудование не выведено из эксплуатации', ok: true, why: 'статус в SAP PM: активно' })
  } else if (action === 'change_order_priority') {
    pre.push({ text: 'Статус не «закрыта»', ok: o.props.status !== 'закрыта', why: `status = ${o.props.status}` })
  } else if (action === 'open_incident') {
    const anomalies = neighbors(session, o.id, { types: ['detected_on'] }).map(n => n.other.props.score as number)
    const maxScore = Math.max(0, ...anomalies)
    const openInc = neighbors(session, o.id, { types: ['occurred_at'] }).some(n => n.other.props.status !== 'закрыт')
    pre.push({ text: 'Anomaly score > 0.8 или ручной триггер', ok: true, why: maxScore > 0.8 ? `score = ${maxScore}` : 'ручной триггер' })
    pre.push({ text: 'Нет открытого инцидента по объекту', ok: !openInc, why: openInc ? 'есть инцидент в статусе «расследование»' : 'открытых инцидентов нет' })
  } else if (action === 'request_documents') {
    pre.push({ text: 'Открытая закупка или проверка', ok: true, why: `цель ${session.purpose}` })
  } else { for (const p of def.preconditions) pre.push({ text: p, ok: true }) }
  if (!allowedRole) pre.unshift({ text: `Право action:execute:${action}`, ok: false, why: `роль ${session.roleLabel} не имеет права; политика abac_actions_v3` })
  const diff: ActionPreview['diff'] = []
  if (action === 'flag_counterparty') { diff.push({ prop: 'control_flag', before: false, after: true }); diff.push({ prop: 'control_reason', before: null, after: params.reason ?? '' }); diff.push({ prop: 'control_until', before: null, after: params.until ?? '' }); diff.push({ prop: 'crm.block_status', before: 'ACTIVE', after: 'UNDER_CONTROL' }) }
  if (action === 'create_maintenance_order') { diff.push({ prop: 'new MaintenanceOrder', before: null, after: `${params.kind} · ${params.priority} · ${params.planned}` }); diff.push({ prop: `${o.type}.open_orders`, before: neighbors(session, o.id, { types: ['maintains'] }).filter(n => n.other.props.status !== 'закрыта').length, after: neighbors(session, o.id, { types: ['maintains'] }).filter(n => n.other.props.status !== 'закрыта').length + 1 }) }
  if (action === 'change_order_priority') diff.push({ prop: 'priority', before: o.props.priority, after: params.priority })
  if (action === 'open_incident') { diff.push({ prop: 'new Incident', before: null, after: `${params.class} · ${o.label}` }); diff.push({ prop: 'open_incidents', before: o.props.open_incidents ?? 0, after: ((o.props.open_incidents as number) ?? 0) + 1 }) }
  if (action === 'request_documents') diff.push({ prop: 'outgoing letter', before: null, after: `${params.docs} · срок ${params.deadline}` })
  void w
  return { action, objectId, preconditions: pre, diff, target: def.writeback, mode: def.confirmation, allowed: pre.every(p => p.ok), denyReason: pre.find(p => !p.ok)?.why }
}

const workflows = new Map<string, Workflow>()
const wfListeners = new Set<() => void>()
export function subscribeWorkflows(fn: () => void) { wfListeners.add(fn); return () => { wfListeners.delete(fn) } }
const emitWf = () => { for (const l of wfListeners) l() }
export const getWorkflow = (id: string) => workflows.get(id)
export const allWorkflows = () => [...workflows.values()].sort((a, b) => b.startedAt - a.startedAt)

export function executeAction(session: Session, preview: ActionPreview, params: Record<string, unknown>, opts: { chaos?: boolean; secondSigner?: string } = {}): Workflow {
  const o = must(preview.objectId)
  const def = ACTION_BY_NAME[preview.action]
  const id = `wf_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
  const target = def.writeback.split(':')[0]
  const stages: Workflow['stages'] = [{ name: 'ЗАПИСЬ', status: 'run', ts: Date.now() }, { name: `ПЕРЕДАЧА В ${target.includes('1С') || target.includes('SAP') || target.includes('CRM') ? target.replace('SAP PM / ', '').replace(' / SAP', '').replace('CRM / ', '') : target}`, status: 'wait' }, { name: 'ПОДТВЕРЖДЕНИЕ', status: 'wait' }]
  const ev = audit.append({ ts: Date.now(), actor: session.login, actorKind: 'user', purpose: session.purpose || '', action: `action:execute:${preview.action}`, resource_ids: [o.id], resource_label: o.label, policy_decision_id: nextDecisionId(), outcome: 'allow', detail: JSON.stringify(params) })
  const wf: Workflow = { id, action: preview.action, objectId: o.id, params, stages, status: 'running', eventId: ev.id, startedAt: Date.now(), target: def.writeback, actor: session.login, secondSigner: opts.secondSigner }
  workflows.set(id, wf)
  o.status = 'pending_writeback'
  emitWf()
  const step = (i: number, ms: number, fn?: () => void) => setTimeout(() => { if (fn) fn(); emitWf() }, ms)
  step(0, 420, () => { stages[0].status = 'done'; stages[1].status = 'run'; stages[1].ts = Date.now() })
  step(1, 1700, () => {
    if (opts.chaos) { stages[1].status = 'fail'; wf.status = 'rejected'; wf.error = `${target}: HTTP 503 Service Unavailable (таймаут 1,2 с). Компенсация: откат локальной записи, объект остаётся в версии ${o.version}`; o.status = 'rejected'; addEvent({ kind: 'action', text: `Write-back отклонён источником: ${preview.action} · ${o.label}`, objectId: o.id }); return }
    stages[1].status = 'done'; stages[2].status = 'run'; stages[2].ts = Date.now()
  })
  step(2, 2600, () => {
    if (wf.status !== 'running') return
    stages[2].status = 'done'; wf.status = 'confirmed'; o.status = 'ok'
    applyAction(session, preview.action, o, params)
    addEvent({ kind: 'action', text: `Действие ${preview.action} подтверждено ${target}: ${o.label}`, objectId: o.id })
  })
  return wf
}
export function retryWorkflow(session: Session, wfId: string): Workflow | undefined {
  const wf = workflows.get(wfId); if (!wf) return
  const prev = previewAction(session, wf.action, wf.objectId, wf.params)
  workflows.delete(wfId)
  return executeAction(session, prev, wf.params)
}
export function compensateWorkflow(wfId: string) { const wf = workflows.get(wfId); if (!wf) return; wf.status = 'compensated'; const o = get(wf.objectId); if (o) o.status = 'ok'; emitWf() }

function applyAction(session: Session, action: string, o: SpObject, params: Record<string, unknown>) {
  const before = { ...o.props }
  const ts = Date.now()
  const w = world()
  if (action === 'flag_counterparty') { o.props.control_flag = true; o.props.control_reason = params.reason; o.props.control_until = params.until }
  if (action === 'change_order_priority') o.props.priority = params.priority
  if (action === 'open_incident') { o.props.open_incidents = ((o.props.open_incidents as number) || 0) + 1; const inc: SpObject = { type: 'Incident', id: `inc_${ts.toString(36).toUpperCase()}NEW`, version: 1, label: `Инцидент 2026-${String(900 + w.byType.get('Incident')!.length)}`, markings: ['CONFIDENTIAL', 'SYNTHETIC'], props: { class: params.class, date: fmtIso(ts).slice(0, 16).replace('T', ' '), status: 'открыт', consequences: params.description, damage: 0 }, meta: {}, sources: ['incident_log'], subsidiary: o.subsidiary, materializedAt: ts, created: ts, status: 'ok' }; w.objects.set(inc.id, inc); w.byType.get('Incident')!.push(inc); addLink('occurred_at', inc.id, o.id, ['CONFIDENTIAL']) }
  if (action === 'create_maintenance_order') { const mo: SpObject = { type: 'MaintenanceOrder', id: `mo_${ts.toString(36).toUpperCase()}NEW`, version: 1, label: `Заявка ${5000 + w.byType.get('MaintenanceOrder')!.length % 1000}-NEW`, markings: ['INTERNAL', 'SYNTHETIC'], props: { number: `${5000 + w.byType.get('MaintenanceOrder')!.length % 1000}-NEW`, kind: params.kind, priority: params.priority, status: 'открыта', planned: params.planned, actual: null, cost: 0, source_system: o.sources.includes('onec_toir') ? '1С:ТОиР' : 'SAP PM' }, meta: {}, sources: [o.sources.includes('onec_toir') ? 'onec_toir' : 'sap_pm'], subsidiary: o.subsidiary, materializedAt: ts, created: ts, status: 'ok' }; w.objects.set(mo.id, mo); w.byType.get('MaintenanceOrder')!.push(mo); addLink('maintains', mo.id, o.id, ['INTERNAL']) }
  o.version++
  o.materializedAt = ts
  const diff = Object.keys(o.props).filter(k => before[k] !== o.props[k]).map(k => ({ prop: k, before: before[k] ?? null, after: o.props[k] }))
  const h = history(o)
  h.unshift({ version: o.version, ts, cause: action, causeKind: 'action', actor: session.login, diff: diff.length ? diff : [{ prop: 'version', before: o.version - 1, after: o.version }] })
}
function addLink(type: LinkType, from: string, to: string, markings: Marking[]) {
  const w = world(); const l: SpLink = { id: `lnk_new_${w.links.length}`, type, from, to, confidence: 1, markings, source: 'action' }
  w.links.push(l); (w.linksFrom.get(from) || w.linksFrom.set(from, []).get(from)!).push(l); (w.linksTo.get(to) || w.linksTo.set(to, []).get(to)!).push(l)
}

// ---------- events ----------
const eventListeners = new Set<() => void>()
export function subscribeEvents(fn: () => void) { eventListeners.add(fn); return () => { eventListeners.delete(fn) } }
export function addEvent(e: Omit<EventItem, 'id' | 'ts'>) { const w = world(); w.events.unshift({ id: `ev_${Date.now().toString(36)}`, ts: Date.now(), ...e }); if (w.events.length > 400) w.events.length = 400; for (const l of eventListeners) l() }

// ---------- audit reads (every PEP logs reads) ----------
export function logRead(session: Session, action: string, ids: string[], label?: string, outcome: 'allow' | 'deny' = 'allow', detail?: string) {
  return audit.append({ ts: Date.now(), actor: session.login, actorKind: 'user', purpose: session.purpose || '', action, resource_ids: ids, resource_label: label, policy_decision_id: nextDecisionId(), outcome, detail })
}

/** Seed the audit with a week of history so the inspector has something to prove. */
let seeded = false
export async function seedAudit() {
  if (seeded) return; seeded = true
  const w = world(); const n = w.named; const r = new Rng(77)
  const actors = ['sc_head', 'toir_eng', 'seb_analyst', 'analyst_open', 'svc:materializer', 'svc:agent-runtime', 'k.semion']
  const purposesOf: Record<string, string> = { sc_head: 'situation_monitoring', toir_eng: 'toir_planning', seb_analyst: 'procurement_check', analyst_open: 'toir_planning', 'svc:materializer': 'system', 'svc:agent-runtime': 'procurement_check', 'k.semion': 'finance_control' }
  const objs = [n.focusOrg, n.focusOrg2, n.focusAsset, n.focusEquipment, n.focusContract, n.focusPerson, ...n.sharedProcs.slice(0, 2)]
  const start = Date.now() - 7 * DAY
  const items: { ts: number; actor: string; action: string; ids: string[]; outcome: 'allow' | 'deny'; detail?: string }[] = []
  for (let i = 0; i < 140; i++) {
    const actor = r.pick(actors); const ts = start + r.int(0, 7 * DAY)
    const oid = r.chance(0.5) ? r.pick(objs) : r.pick([...w.objects.keys()].slice(0, 5000))
    const deny = actor === 'analyst_open' && r.chance(0.5)
    const action = r.pick(['read', 'read', 'read', 'search', 'traverse', 'explain', 'export', 'copy', 'agent.tool:search_objects'])
    items.push({ ts, actor, action, ids: [oid], outcome: deny ? 'deny' : 'allow', detail: deny ? 'marking FIN not in clearance' : action === 'export' ? 'xlsx, 240 строк, водяной знак' : undefined })
  }
  items.push({ ts: Date.now() - 2 * DAY, actor: 'p.orlov', action: 'policy.change', ids: ['abac_fin_v12'], outcome: 'allow', detail: 'подпись ok, тесты 30/30' })
  items.push({ ts: Date.now() - 3 * HOUR, actor: 'seb_analyst', action: 'read', ids: [n.focusOrg], outcome: 'allow' })
  items.push({ ts: Date.now() - 55 * MIN, actor: 'analyst_open', action: 'read', ids: [n.focusOrg], outcome: 'deny', detail: 'marking FIN not in clearance (свойство contracts_total замаскировано)' })
  items.push({ ts: Date.now() - 40 * MIN, actor: 'svc:agent-runtime', action: 'agent.tool:traverse', ids: [n.focusOrg, n.focusOrg2], outcome: 'allow', detail: 'delegated token seb_analyst, ttl 300s' })
  items.push({ ts: Date.now() - 12 * MIN, actor: 'sc_head', action: 'explain', ids: [n.focusAsset], outcome: 'allow', detail: w.domain.focusProp })
  items.sort((a, b) => a.ts - b.ts)
  for (const it of items) {
    const o = get(it.ids[0])
    audit.append({ ts: it.ts, actor: it.actor, actorKind: it.actor.startsWith('svc:') ? 'service' : 'user', purpose: purposesOf[it.actor] || 'procurement_check', action: it.action, resource_ids: it.ids, resource_label: o?.label ?? it.ids[0], policy_decision_id: `d_${80000 + r.int(0, 8000)}`, outcome: it.outcome, detail: it.detail })
  }
  await audit.flush()
}

// ---------- branches ----------
export interface Branch { name: string; author: string; created: number; head: string; base?: string; note: string; status: 'open' | 'merged' | 'main' }
export const BRANCHES: Branch[] = [
  { name: 'main', author: 'system', created: Date.UTC(2026, 6, 1), head: 'c9f1e2a', note: 'Продуктивная ветка каталога Nessie', status: 'main' },
  { name: 'dev/backfill-2026-08', author: 'toir_eng', created: Date.UTC(2026, 8, 12, 9, 40), head: '7b2d0c4', base: 'c9f1e2a', note: 'Пересчёт заявок ТОиР за август с новым правилом survivorship (1С > SAP для статуса)', status: 'open' },
  { name: 'exp/er-jaro-0.90', author: 'er-eng', created: Date.UTC(2026, 8, 8, 15, 10), head: '31aa9de', base: 'c9f1e2a', note: 'Эксперимент: порог Jaro-Winkler 0.90 вместо 0.92 для контрагентов', status: 'open' },
  { name: 'feat/document-chunks-v2', author: 'nlp-team', created: Date.UTC(2026, 8, 1, 11, 0), head: '5e77b01', base: 'c9f1e2a', note: 'Новый чанкинг документов (512 токенов, overlap 64)', status: 'merged' },
]
export function branchDiff(name: string): { dataset: string; added: number; changed: number; removed: number; checks: { name: string; ok: boolean; note: string }[] }[] {
  const r = new Rng(hash32(name))
  const sets = name.includes('backfill') ? ['gold.maintenance_order', 'gold.equipment', 'enrich.anomaly', 'gold.contract'] : name.includes('er-') ? ['er.entity_crosswalk', 'gold.organization', 'gold.link_founder_of'] : ['gold.document', 'enrich.mention', 'enrich.embedding']
  return sets.map((ds, i) => ({ dataset: ds, added: r.int(0, i === 0 ? 4200 : 300), changed: r.int(50, i === 0 ? 9800 : 900), removed: r.int(0, 40), checks: [{ name: 'Контракт схемы', ok: true, note: 'совместимо' }, { name: 'Маркировки не понижены', ok: true, note: '⊔ входов сохранён' }, { name: 'Качество (Soda)', ok: i !== 1 || !name.includes('er-'), note: i === 1 && name.includes('er-') ? 'precision 0.93 < 0.95' : 'все проверки пройдены' }, { name: 'Build-манифест подписан', ok: true, note: 'cosign ok' }] }))
}

// ---------- agent ----------
export interface AgentStep { tool: string; args: Record<string, unknown>; result: string; count?: number; ms: number }
export interface AgentReply { steps: AgentStep[]; text: string; chips: string[]; proposed?: { action: string; objectId: string; params: Record<string, unknown> }[]; partialHidden: boolean; unverified?: string[] }

export function askAgent(session: Session, question: string): AgentReply {
  const w = world(); const n = w.named; const q = question.toLowerCase()
  const steps: AgentStep[] = []; const chips: string[] = []
  const t = (tool: string, args: Record<string, unknown>, result: string, count?: number) => steps.push({ tool, args, result, count, ms: 40 + Math.floor(Math.random() * 180) })
  const cats = effectiveCategories(session)
  const finHidden = !cats.has('FIN')
  const money = (v: number) => finHidden ? '[сумма замаскирована: FIN]' : fmtMoney(v)
  const focus = must(n.focusAsset); const vektor = must(n.focusOrg); const strela = must(n.focusOrg2); const code = String(focus.props.code)

  if (w.domain.scenarioKeywords.some(k => q.includes(k)) && q.includes('вектор')) {
    t('search_objects', { type: focus.type, filter: { prop: 'code', op: 'eq', value: code } }, `1 объект: ${focus.id}`, 1)
    const eqs = traverse(session, [focus.id], 1, { types: ['has_equipment'], maxPerNode: 400 }).nodes.filter(x => x.type === 'Equipment')
    t('traverse', { id: focus.id, link_type: 'has_equipment', depth: 1 }, `${eqs.length} единиц оборудования`, eqs.length)
    const orders = new Map<string, SpObject>()
    for (const e of eqs) for (const nb of neighbors(session, e.id, { types: ['maintains'] })) orders.set(nb.other.id, nb.other)
    t('traverse', { ids: `${eqs.length} Equipment`, link_type: 'maintains', depth: 1 }, `${orders.size} заявок ТОиР`, orders.size)
    const contractors = new Map<string, { org: SpObject; overdue: number; total: number }>()
    for (const o of orders.values()) { const p = neighbors(session, o.id, { types: ['performed_by'] }).find(x => x.other.type === 'Organization'); if (!p) continue; const c = contractors.get(p.other.id) || { org: p.other, overdue: 0, total: 0 }; c.total++; if (o.props.status === 'просрочена' || (o.props.status !== 'закрыта' && new Date(o.props.planned as string).getTime() < simNow() - 90 * DAY)) c.overdue++; contractors.set(p.other.id, c) }
    t('call_function', { name: 'contract_execution_status', args: { orgs: contractors.size, period: '2026-Q3' } }, `${contractors.size} подрядчиков, ${[...contractors.values()].filter(c => c.overdue > 0).length} со срывами`)
    const affiliated = new Set([vektor.id])
    for (const nb of neighbors(session, n.focusPerson, { types: ['founder_of', 'director_of'], includeHidden: true })) affiliated.add(nb.other.id)
    t('traverse', { id: vektor.id, link_type: 'founder_of', depth: 2 }, `связанные через учредителей: ${[...affiliated].map(id => get(id)?.label).join(', ')}`, affiliated.size)
    const related = [...contractors.values()].filter(c => affiliated.has(c.org.id))
    const vc = must(n.focusContract); const strelaContract = neighbors(session, strela.id, { types: ['party_to'] }).map(x => x.other).find(c => (c.props.overdue_days as number) > 0)
    chips.push(vektor.id, strela.id, n.focusPerson, vc.id)
    const lines = [`По ${code} за квартал работы вели **${contractors.size} подрядчиков**. Из них связаны с ООО «Вектор» через общего учредителя (Иванов И.И.) и одновременно сорвали сроки:`]
    lines.push(`1. **ООО «Вектор»** [[${vektor.id}]] — ${related.find(c => c.org.id === vektor.id)?.overdue ?? 3} просроченных заявки, договор ${vc.props.number} [[${vc.id}]] на ${money(vc.props.amount as number)} просрочен на ${vc.props.overdue_days} дн.`)
    lines.push(`2. **ООО «Стрела»** [[${strela.id}]] — общий учредитель Иванов И.И. [[${n.focusPerson}]], договор «${strelaContract ? strelaContract.props.subject : 'ремонт'}» просрочен на ${strelaContract ? strelaContract.props.overdue_days : 41} дн.; участвовала в тех же 6 закупках, что и «Вектор» (cartel_pattern до 0.77).`)
    if (finHidden) lines.push(`Суммы договоров скрыты: под целью ${session.purpose} маркировка FIN недоступна.`)
    lines.push(`Рекомендация: рассмотреть действие «Поставить контрагента на контроль» для ООО «Вектор».`)
    return { steps, text: lines.join('\n'), chips, proposed: [{ action: 'flag_counterparty', objectId: vektor.id, params: { reason: 'Аффилированность с участниками закупок', until: '2026-12-31' } }], partialHidden: finHidden }
  }
  if (q.includes('откаж') || q.includes('оборудован') && (q.includes('перв') || q.includes('ремонт'))) {
    const eqs = (w.byType.get('Equipment') || []).filter(e => canSee(session, e)).sort((a, b) => (a.props.health_index as number) - (b.props.health_index as number)).slice(0, 5)
    t('search_objects', { type: 'Equipment', filter: { prop: 'health_index', op: 'lt', value: 0.4 }, sort: 'health_index asc', limit: 5 }, `${eqs.length} объектов`, eqs.length)
    t('call_function', { name: 'equipment_health_index', args: { ids: eqs.map(e => e.id) } }, 'кэш: 5 hit')
    chips.push(...eqs.map(e => e.id))
    return { steps, text: `Оборудование с наименьшим индексом состояния (риск отказа выше всего):\n${eqs.map((e, i) => `${i + 1}. **${e.label}** [[${e.id}]] — health_index ${e.props.health_index}, наработка ${e.props.operating_hours} ч, критичность ${e.props.criticality}`).join('\n')}\nДля каждого доступен Explain до замеров и заявок.`, chips, proposed: eqs[0] ? [{ action: 'create_maintenance_order', objectId: eqs[0].id, params: { kind: 'Диагностика', priority: 'Высокий', planned: '2026-09-18' } }] : undefined, partialHidden: false }
  }
  // generic: find named object
  const found = quickSearch(session, question.replace(/[«»"?,.!]/g, ' ').replace(/(справка|по|расскажи|что|известно|о|об|кто|такой|такое|контрагент|дай|покажи)/g, ' ').trim(), 3)
  if (found.length) {
    const o = found[0]
    t('search_objects', { type: o.type, query: question.slice(0, 40) }, `${found.length} кандидатов, выбран ${o.id}`, found.length)
    const nb = neighbors(session, o.id).slice(0, 6)
    t('get_object', { id: o.id }, `${o.type} v${o.version}, маркировки ${o.markings.filter(m => m !== 'SYNTHETIC').join(', ')}`)
    t('traverse', { id: o.id, depth: 1 }, `${nb.length} связей (показаны первые)`, nb.length)
    chips.push(o.id, ...nb.map(x => x.other.id).slice(0, 3))
    const props = viewProps(session, o).filter(p => TYPES[o.type].props.find(d => d.name === p.name)?.key).slice(0, 5)
    const hidden = props.some(p => p.masked)
    const lines = [`**${o.label}** [[${o.id}]] — ${TYPES[o.type].label}, версия ${o.version}, источники: ${o.sources.join(', ')}.`]
    lines.push(props.map(p => `${TYPES[o.type].props.find(d => d.name === p.name)?.label}: ${p.masked ? '🔒 недоступно' : String(p.value)}`).join(' · '))
    if (nb.length) lines.push(`Связи: ${nb.map(x => `${LINK_BY_TYPE[x.link.type][x.direction === 'out' ? 'label' : 'inverseLabel']} → ${x.other.label} [[${x.other.id}]]`).join('; ')}.`)
    if (o.type === 'Organization') { const rk = counterpartyRisk(session, o); lines.push(`Риск-скор ${rk.score}: ${rk.factors.filter(f => f.contribution > 0).map(f => f.label).join('; ')}.`) }
    return { steps, text: lines.join('\n'), chips, partialHidden: hidden }
  }
  t('search_objects', { query: question.slice(0, 60) }, '0 объектов', 0)
  return { steps, text: `По запросу объектов не найдено. Я отвечаю только по объектам онтологии с ссылками на идентификаторы; ответ без ссылок был бы «мнением модели» и не может стать входом действия. Попробуйте: «справка по ООО Вектор», «какое оборудование откажет первым», «какие подрядчики НПС-2 связаны с ООО Вектор и сорвали сроки за квартал».`, chips, partialHidden: false, unverified: ['ответ без ссылок на объекты'] }
}

// ---------- KPI for situation center (domain pack decides the first two cards) ----------
export interface KpiCard { key: string; label: string; value: number; decimals?: number; unit?: string; sub: string; tone?: 'danger' | 'warn' | 'ok' | 'accent'; delta?: number; deltaAbs?: boolean; target?: { screen?: string; object?: string } }
export function kpis(session: Session) {
  const w = world(); const d = w.domain; const n = w.named
  const units = w.byType.get(d.unitType) || []
  const inWork = units.filter(x => x.props.status === 'в работе' || x.props.status === 'под нагрузкой').length
  const openOrders = (w.byType.get('MaintenanceOrder') || []).filter(o => o.props.status !== 'закрыта').length
  const incidents = (w.byType.get('Incident') || []).filter(o => o.props.status !== 'закрыт').length
  const anomalies = (w.byType.get('Anomaly') || []).filter(a => (a.props.score as number) > 0.6).length
  const flow = w.pipelines.reduce((a, p) => a + p.flow, 0)
  const critical = (w.byType.get('Equipment') || []).filter(e => (e.props.health_index as number) < 0.4).length
  const fresh = typeFreshness()
  const stale = fresh.filter(f => f.status !== 'ok').length
  const cartel = (w.byType.get('Procurement') || []).filter(p => (p.props.cartel_pattern as number) > 0.5).length
  const code = String(must(n.focusAsset).props.code)
  const cards: KpiCard[] = []
  if (d.key === 'energy') {
    const hubs = (w.byType.get('Substation') || []).filter(x => x.props.voltage_kv === 220)
    const load = hubs.reduce((a, x) => a + (x.props.load_mw as number), 0)
    cards.push({ key: 'load', label: 'Нагрузка сети', value: load, unit: 'МВт', decimals: 1, sub: `${inWork} из ${units.length} ${d.unitLabelInWork}`, delta: 3.4, target: { screen: 'search' } })
    cards.push({ key: 'flow', label: 'Переток по ВЛ', value: flow, unit: 'МВт', sub: 'суммарно по магистральным ВЛ', tone: 'accent', delta: 1.2, target: { object: n.focusAsset } })
  } else {
    const S = OPEN_SERIES; const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
    const mlabel = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
    const nowM = new Date().toISOString().slice(0, 7)
    const steo = (S as unknown as { steo?: { months: string[]; values: number[]; source: string } | null }).steo
    if (steo) {
      const idx = Math.max(0, steo.months.findIndex(m => m >= nowM) - 1); const v = steo.values[idx]; const pv = steo.values[Math.max(0, idx - 12)]
      cards.push({ key: 'prod', label: 'Добыча нефти РФ', value: v, unit: 'млн барр/сут', decimals: 2, sub: `EIA STEO, ${mlabel(steo.months[idx])} · оценка`, delta: +((v - pv) / pv * 100).toFixed(1), target: { object: n.holding } })
    } else {
      const j = S.jodi; const i = j.production_kt.length - 1; const v = (j.production_kt[i] || 0) / 1000; const pv = (j.production_kt[i - 12] || v * 1000) / 1000
      cards.push({ key: 'prod', label: 'Добыча нефти РФ', value: v, unit: 'млн т/мес', decimals: 2, sub: `JODI, ${mlabel(j.months[i])}`, delta: +((v - pv) / pv * 100).toFixed(1), target: { object: n.holding } })
    }
    const j = S.jodi; const ri = j.refinery_intake_kt.length - 1; const rv = (j.refinery_intake_kt[ri] || 0) / 1000; const rpv = (j.refinery_intake_kt[ri - 12] || rv * 1000) / 1000
    cards.push({ key: 'ref', label: 'Переработка РФ', value: rv, unit: 'млн т/мес', decimals: 1, sub: `JODI, ${mlabel(j.months[ri])} · ${(w.byType.get('Refinery') || []).length} НПЗ в реестре`, delta: +((rv - rpv) / rpv * 100).toFixed(1), target: { screen: 'search' } })
    const b = S.brent; const bi = b.values.length - 1
    cards.push({ key: 'brent', label: 'Brent', value: b.values[bi], unit: '$/барр', decimals: 2, sub: `EIA, спот ${b.dates[bi]}`, tone: 'accent', delta: +((b.values[bi] - b.values[bi - 1]) / b.values[bi - 1] * 100).toFixed(1), target: { object: n.holding } })
  }
  if (d.key === 'energy') cards.push({ key: 'inc', label: d.incidentsKpi, value: incidents, sub: `открытых, 2 на ${code}`, tone: incidents ? 'danger' : 'ok', delta: 1, deltaAbs: true, target: { object: n.focusIncidents[0] } })
  cards.push({ key: 'anom', label: d.key === 'energy' ? 'Аномалии' : 'Аномалии и инциденты', value: anomalies, sub: d.key === 'energy' ? 'score > 0.6 за 30 дн' : `score > 0.6 · ${incidents} открытых инцидентов, 2 на ${code}`, tone: 'warn', delta: 3, deltaAbs: true, target: { object: n.focusAnomaly } })
  cards.push({ key: 'toir', label: 'ТОиР: открыто', value: openOrders, sub: `${critical} ед. с индексом < 0.4`, delta: -2.4, target: { screen: 'toir' } })
  cards.push({ key: 'cartel', label: 'Закупки: риск', value: cartel, sub: 'cartel_pattern > 0.5', tone: 'warn', delta: 2, deltaAbs: true, target: { screen: 'procurement' } })
  void session
  return { cards, fresh, stale, inWork, unitsTotal: units.length, incidents, anomalies, openOrders, flow }
}

// ---------- live simulation ----------
export function tick() {
  const w = world(); const now = simNow(); const d = w.domain
  const sensors = w.byType.get('Sensor') || []
  const r = new Rng(Math.floor(now / 1000))
  for (let i = 0; i < 40; i++) { const s = r.pick(sensors); s.materializedAt = now - r.int(0, 4) * 1000; s.props.last_value = +((s.props.last_value as number) * (1 + r.gauss(0, 0.004))).toFixed(2); s.version++ }
  const focus = must(w.named.focusAsset); focus.materializedAt = now - r.int(2, 9) * 1000
  if (d.key === 'energy') focus.props.load_mw = +(318.4 + r.gauss(0, 0.8)).toFixed(1); else focus.props.pressure_out = +(6.92 + r.gauss(0, 0.02)).toFixed(2)
  const second = must(w.named.secondAsset); second.materializedAt = now - r.int(2, 12) * 1000
  for (const t of w.byType.get(d.distType) || []) if (t.id !== focus.id && t.id !== second.id && r.chance(0.3)) { t.materializedAt = now - r.int(1, 30) * 1000; const k = d.key === 'energy' ? 'load_pct' : 'level'; t.props[k] = +Math.max(5, Math.min(95, (t.props[k] as number) + r.gauss(0, 0.05))).toFixed(1) }
  const fs = must(w.named.focusSensor); fs.props.last_value = +((d.key === 'energy' ? 84.2 : 6.9) + r.gauss(0, d.key === 'energy' ? 0.3 : 0.03)).toFixed(2); fs.materializedAt = now - 2000
  if (r.chance(0.18)) { const o = r.pick(w.byType.get('MaintenanceOrder') || []); o.materializedAt = now - 3000; addEvent({ kind: 'order', text: `Заявка ${o.props.number} обновлена: ${o.props.status} (${o.props.source_system})`, objectId: o.id }) }
  else if (r.chance(0.08)) addEvent({ kind: 'freshness', text: `Materializer: object.changes лаг ${r.int(2, 11)} с, ${r.int(120, 900)} объектов/с` })
  else if (r.chance(0.05)) { const s = r.pick(sensors); addEvent({ kind: 'anomaly', text: `Аномалия ${s.label}: score ${r.float(0.55, 0.8).toFixed(2)} (anomaly_v3)`, objectId: s.id }) }
}
export const named = () => world().named
export type { AuditEvent }
