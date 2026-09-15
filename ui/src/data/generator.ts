// Synthetic holding generator — in-browser twin of demo/generator (spec 7.6).
// Deterministic: same seed → same world for every viewer. All data carries marking SYNTHETIC.
// Domain-parametric: the asset layer (fields/wells/NPS or grid areas/feeders/substations) is built by a domain pack,
// everything else (orgs, persons, contracts, procurements, orders, incidents, docs, purposes) is the shared core.

import { Rng, makeId, makeInn, makeInn12, makeOgrn, hash32, DAY, HOUR, MIN } from './rng'
import type { SpObject, SpLink, EventItem, HistoryEntry, PropMeta } from './types'
import type { ObjectType, LinkType, Marking } from './ontology'
import { TYPES } from './ontology'
import { DOMAINS, type DomainKey, type DomainSpec } from './domain'
import { project, projectBasemap, type Basemap } from '../map/geo'
import fieldsJson from './real/fields.json'
import refineriesJson from './real/refineries.json'
import pipelinesJson from './real/pipelines.json'
import seriesJson from './real/series.json'
import volveJson from './real/volve.json'
import basemapJson from './real/basemap.json'

export const OPEN_SERIES = seriesJson
export const REAL_DATA_DATE = '2026-09-16'

export const SIM_EPOCH = Date.UTC(2026, 8, 14, 11, 2, 11) // 14.09.2026 14:02:11 MSK
const LOAD_TIME = Date.now()
const EMPTY_META: Record<string, PropMeta> = {}
export const simNow = () => SIM_EPOCH + (Date.now() - LOAD_TIME)

export interface PipelineGeom { id: string; points: [number, number][]; flow: number; hot: boolean; code: string; unit: string }
export interface Named {
  holding: string; dzo: string[]
  focusAsset: string; secondAsset: string; focusEquipment: string; focusSensor: string; focusSensors: Record<string, string>
  focusAnomaly: string; focusOrg: string; focusOrg2: string; focusPerson: string; sharedProcs: string[]; cartelProcs: string[]
  focusDoc: string; focusLetters: string[]; focusIncidents: string[]; focusOrders: string[]; focusContract: string
  purposes: Record<string, string>
}

export interface World {
  domain: DomainSpec
  basemap: Basemap | null
  home: { x: number; y: number; z: number }
  objects: Map<string, SpObject>
  byType: Map<ObjectType, SpObject[]>
  links: SpLink[]
  linksFrom: Map<string, SpLink[]>
  linksTo: Map<string, SpLink[]>
  named: Named
  pipelines: PipelineGeom[]
  events: EventItem[]
  stats: Record<string, number>
  scale: number
}

const FORMS = ['ООО', 'ООО', 'ООО', 'АО', 'ЗАО', 'ПАО', 'ИП']
const ORG_WORDS = ['Вектор', 'Стрела', 'Норд', 'Сибирь', 'Прогресс', 'Техно', 'Сервис', 'Монтаж', 'Нефтегазстрой', 'Промсервис', 'Энергия', 'Гарант', 'Ресурс', 'Атлант', 'Меридиан', 'Полюс', 'Кварц', 'Базис', 'Импульс', 'Титан', 'Орион', 'Спектр-Сервис', 'Регион', 'Автоматика', 'Арматура', 'Трубодеталь', 'Геосервис', 'ТехноНефть', 'Уралмонтаж', 'СибТрансСтрой', 'Нефтемаш', 'ПромАвтоматика', 'Диагностика', 'Изоляция', 'Спецстрой', 'Логистика', 'Инжиниринг', 'Комплект', 'Электросеть', 'Сварка', 'Кран', 'Насосмаш', 'Компрессор', 'Теплотех', 'Ямал', 'Обь', 'Иртыш', 'Таймыр', 'Печора', 'Югра', 'Пур', 'Надым', 'Тагул', 'Кама', 'Волга']
const ORG_SUFFIX = ['', '', '', '-Сервис', '-Строй', '-Инжиниринг', '-Транс', '-Пром', '-Групп', ' Плюс', ' Нефтесервис']
const REGIONS = ['ХМАО — Югра', 'ЯНАО', 'Тюменская область', 'Томская область', 'Москва', 'Санкт-Петербург', 'Татарстан', 'Башкортостан', 'Пермский край', 'Самарская область', 'Омская область', 'Красноярский край', 'Архангельская область', 'Вологодская область']
const CITIES: Record<string, string[]> = { 'ХМАО — Югра': ['Сургут', 'Нижневартовск', 'Ханты-Мансийск', 'Нефтеюганск'], 'ЯНАО': ['Новый Уренгой', 'Ноябрьск', 'Салехард'], 'Тюменская область': ['Тюмень', 'Тобольск'], 'Томская область': ['Томск', 'Стрежевой'], 'Москва': ['Москва'], 'Санкт-Петербург': ['Санкт-Петербург'], 'Татарстан': ['Казань', 'Альметьевск'], 'Башкортостан': ['Уфа', 'Салават'], 'Пермский край': ['Пермь', 'Березники'], 'Самарская область': ['Самара', 'Новокуйбышевск'], 'Омская область': ['Омск'], 'Красноярский край': ['Красноярск'], 'Архангельская область': ['Архангельск', 'Северодвинск', 'Котлас'], 'Вологодская область': ['Вологда', 'Череповец'] }
const STREETS = ['Ленина', 'Мира', 'Нефтяников', 'Промышленная', 'Индустриальная', 'Энергетиков', 'Республики', 'Геологов', 'Строителей', 'Магистральная', 'Северная', 'Заводская']
const LAST = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Смирнов', 'Попов', 'Волков', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Фёдоров', 'Михайлов', 'Егоров', 'Орлов', 'Макаров', 'Захаров', 'Гусев', 'Титов', 'Беляев', 'Тарасов', 'Жуков', 'Фролов', 'Комаров', 'Шестаков', 'Мельников', 'Абдуллин', 'Хасанов', 'Галиев', 'Сафин', 'Ахметов', 'Нургалиев', 'Шевченко', 'Ковалёв', 'Бондарь', 'Дорофеев', 'Кириллов', 'Медведев', 'Панов', 'Рябов', 'Селезнёв', 'Ушаков', 'Чернов', 'Яковлев']
const FIRST_M = ['Иван', 'Пётр', 'Сергей', 'Андрей', 'Алексей', 'Дмитрий', 'Николай', 'Михаил', 'Владимир', 'Олег', 'Артём', 'Руслан', 'Тимур', 'Рустам', 'Марат', 'Евгений', 'Константин', 'Павел', 'Роман', 'Юрий']
const FIRST_F = ['Анна', 'Елена', 'Ольга', 'Мария', 'Татьяна', 'Наталья', 'Ирина', 'Светлана', 'Юлия', 'Екатерина', 'Гульнара', 'Алия', 'Дарья', 'Ксения']
const PATR_M = ['Иванович', 'Петрович', 'Сергеевич', 'Андреевич', 'Алексеевич', 'Дмитриевич', 'Николаевич', 'Михайлович', 'Владимирович', 'Олегович', 'Рустамович', 'Маратович', 'Юрьевич']
const PATR_F = ['Ивановна', 'Петровна', 'Сергеевна', 'Андреевна', 'Алексеевна', 'Дмитриевна', 'Николаевна', 'Михайловна', 'Владимировна', 'Рустамовна']
const DOC_KINDS = ['Акт', 'Договор', 'Письмо', 'Протокол', 'Счёт', 'Отчёт', 'Дефектная ведомость', 'Наряд-допуск']
const POSITIONS: Record<DomainKey, string[]> = {
  oilgas: ['Инженер ТОиР', 'Мастер участка', 'Оператор НПС', 'Диспетчер', 'Геолог', 'Механик', 'Электромонтёр', 'Начальник цеха', 'Специалист по закупкам', 'Аналитик СЭБ', 'Инженер АСУ ТП', 'Экономист', 'Юрист', 'Специалист по ИБ', 'Начальник смены'],
  energy: ['Инженер ТОиР', 'Мастер РЭС', 'Дежурный электромонтёр ПС', 'Диспетчер ОДС', 'Инженер РЗА', 'Электромонтёр ОВБ', 'Начальник ПС', 'Специалист по закупкам', 'Аналитик СЭБ', 'Инженер АСУ ТП', 'Экономист', 'Юрист', 'Специалист по ИБ', 'Начальник смены'],
}
const UNITS: Record<DomainKey, string[]> = {
  oilgas: ['ЦДНГ-1', 'ЦДНГ-2', 'ЦППН', 'НПС-1', 'НПС-2', 'РВС-парк', 'ОТиПБ', 'Служба ТОиР', 'Отдел закупок', 'СЭБ', 'ИТ-отдел', 'Диспетчерская', 'ПТО', 'Финансовый отдел'],
  energy: ['Архангельский РЭС', 'Северодвинский РЭС', 'ПС Северная-220', 'ПС Заречная-220', 'Служба ЛЭП', 'Служба ПС', 'Служба РЗА', 'ОДС', 'Служба ТОиР', 'Отдел закупок', 'СЭБ', 'ИТ-отдел', 'ПТО', 'Финансовый отдел'],
}

type EqClass = readonly [string, string, number]
interface HostSpec { host: SpObject; share: number; sub: string; src: string }
interface AssetLayer {
  hosts: HostSpec[]
  focusAsset: SpObject; secondAsset: SpObject
  focusEq: { cls: EqClass; name: string; inv: string; health: number; id: string; hours: number; onecKey: string; passportKey: string; erBefore: string }
  sensorClasses: string[]; focusSensorValue: number
  anomalyKind: string
  focusContractSubject: string; secondContractSubject: string; cartelSubjects: string[]
  vehicleKinds: string[]; withShipments: boolean
}

export function generateWorld(seed = 2026, scale = 1, domainKey: DomainKey = 'oilgas'): World {
  const t0 = performance.now()
  const D = DOMAINS[domainKey]
  const rng = new Rng(seed)
  const NOW = SIM_EPOCH
  const objects = new Map<string, SpObject>()
  const byType = new Map<ObjectType, SpObject[]>()
  const links: SpLink[] = []
  const linksFrom = new Map<string, SpLink[]>()
  const linksTo = new Map<string, SpLink[]>()
  const events: EventItem[] = []
  const pipelines: PipelineGeom[] = []
  let linkSeq = 0

  const N = {
    units: Math.round(120 * scale), equipment: Math.round(4000 * scale), orgs: Math.round(900 * scale), persons: Math.round(2500 * scale),
    contracts: Math.round(2500 * scale), procs: Math.round(800 * scale), docs: Math.round(5000 * scale), orders: Math.round(24000 * scale),
    employees: Math.round(1200 * scale), incidents: 40, shipments: Math.round(300 * scale), vehicles: 32,
  }

  function add(type: ObjectType, label: string, props: Record<string, unknown>, opts: Partial<SpObject> & { id?: string } = {}): SpObject {
    const def = TYPES[type]
    const created = opts.created ?? NOW - rng.int(1, 900) * DAY
    const id = opts.id ?? makeId(rng, def.prefix, created)
    const o: SpObject = {
      type, id, version: opts.version ?? rng.int(1, 40), label, markings: opts.markings ?? [...def.markings, 'SYNTHETIC'],
      props, meta: opts.meta ?? {}, sources: opts.sources ?? [def.sources[0]], subsidiary: opts.subsidiary, geo: opts.geo,
      materializedAt: opts.materializedAt ?? NOW - rng.int(0, Math.max(1, def.sloSec * 0.8)) * 1000, created, status: 'ok',
      crosswalk: opts.crosswalk, history: opts.history,
    }
    objects.set(id, o)
    let arr = byType.get(type); if (!arr) { arr = []; byType.set(type, arr) }
    arr.push(o)
    return o
  }
  function link(type: LinkType, from: string, to: string, opts: Partial<SpLink> = {}): SpLink {
    const l: SpLink = { id: `lnk_${(linkSeq++).toString(36)}`, type, from, to, confidence: opts.confidence ?? 1, markings: opts.markings ?? ['INTERNAL'], source: opts.source ?? 'sap_pm', props: opts.props, validFrom: opts.validFrom, validTo: opts.validTo }
    links.push(l)
    let a = linksFrom.get(from); if (!a) { a = []; linksFrom.set(from, a) } a.push(l)
    let b = linksTo.get(to); if (!b) { b = []; linksTo.set(to, b) } b.push(l)
    return l
  }
  const metaSrc = (source: string, ageSec = 600): PropMeta => ({ source, sourceTs: NOW - rng.int(1, ageSec) * 1000 })
  const person = (r: Rng, female = r.chance(0.3)) => {
    const last = r.pick(LAST); const f = female ? r.pick(FIRST_F) : r.pick(FIRST_M); const p = female ? r.pick(PATR_F) : r.pick(PATR_M)
    return { full: `${female ? last + 'а' : last} ${f} ${p}`, short: `${female ? last + 'а' : last} ${f[0]}.${p[0]}.` }
  }

  // ---------- Holding & subsidiaries (from the domain pack) ----------
  const holding = add('Holding', D.holding, { name: D.holdingFull, inn: makeInn(rng), subsidiaries: D.dzo.length }, { id: 'hld_01J8SN0000000000000000000A', version: 3, sources: ['manual', 'egrul'] })
  const dzo: SpObject[] = D.dzo.map((d, i) => {
    const o = add('Subsidiary', d.name, { name: `АО «${d.name}»`, inn: makeInn(rng), region: d.region, kind: d.kind, erp: d.erp, employees: d.emp }, { id: `dzo_01J8SN00000000000000${D.key === 'energy' ? 'E' : 'O'}${String(i).padStart(5, '0')}`, version: 5, sources: ['egrul', 'it_landscape'], meta: { erp: metaSrc('it_landscape.systems.erp', 86400), inn: metaSrc('egrul.ul.inn', 86400) } })
    link('owns', holding.id, o.id, { source: 'egrul', props: { share: 100 } })
    return o
  })
  const [dzoA, dzoB, dzoC] = dzo // production/transmission · transport/distribution · processing/generation

  // ---------- Asset layer: oil & gas — real public assets (open data), synthetic operations on top ----------
  let basemap: Basemap | null = null
  let home = { x: 500, y: 300, z: 1 }
  function buildOilGas(): AssetLayer {
    basemap = projectBasemap(basemapJson.countries as unknown as { iso: string; rings: [number, number][][] }[], 'RU')
    const openMeta = (col: string): PropMeta => ({ source: `open_ref.${col}`, sourceTs: Date.UTC(2026, 8, 16) })
    // fields (ru.wikipedia reference list + GeoData coordinates)
    const fields: SpObject[] = []
    const byProd = [...fieldsJson].sort((x, y) => (y.production_ktd || 0) - (x.production_ktd || 0))
    const major = new Set(byProd.slice(0, 4).map(f => f.name))
    for (const f of fieldsJson) {
      const geo = project(f.lon, f.lat)
      const fo = add('Field', f.name.replace(/^проект /, '').split(' (')[0], { name: `${f.name} месторождение`, region: f.region || '—', operator: f.operator || '—', discovered: f.discovered, reserves_mt: f.reserves_mt, remaining_mt: f.remaining_mt, production_ktd: f.production_ktd, cumulative_mt: f.cumulative_mt, data_year: f.production_year ?? f.remaining_year ?? f.cumulative_year, license: `${f.region || ''} · ${f.geo_source === 'wikipedia' ? 'координаты Wikipedia' : 'координаты приближённые'}`, _major: major.has(f.name) }, { geo, subsidiary: dzoA.id, sources: ['open_ref'], markings: ['INTERNAL'], version: 1, materializedAt: NOW - 3 * DAY, meta: { name: openMeta('fields.name'), operator: openMeta('fields.operator'), discovered: openMeta('fields.discovered'), reserves_mt: openMeta('fields.reserves_mt'), remaining_mt: openMeta('fields.remaining_mt'), production_ktd: openMeta('fields.production_ktd'), cumulative_mt: openMeta('fields.cumulative_mt'), region: openMeta('fields.region') } })
      fields.push(fo)
      link('operates', dzoA.id, fo.id, { source: 'manual' })
    }
    // Volve reference wells (Equinor open data): real monthly production and bottom-hole pressure, no map position (North Sea)
    const volveField = add('Field', 'Volve (эталон, Северное море)', { name: 'Volve — эталонный набор Equinor (открытая лицензия)', region: 'Северное море, Норвегия', operator: 'Equinor (2008–2016)', discovered: 1993, reserves_mt: null, remaining_mt: null, production_ktd: null, cumulative_mt: 10.9, data_year: 2016, license: 'Equinor Open Data Licence' }, { subsidiary: dzoA.id, sources: ['volve'], markings: ['INTERNAL'], version: 1, materializedAt: NOW - 3 * DAY })
    const volvePad = add('WellPad', 'Платформа Maersk Inspirer (Volve)', { code: 'VOLVE-A', wells: volveJson.wells.length, coords: '58.44 N, 1.89 E' }, { subsidiary: dzoA.id, sources: ['volve'], markings: ['INTERNAL'] })
    link('located_on', volvePad.id, volveField.id, { source: 'volve', markings: ['GEO'] })
    const wells: SpObject[] = []
    for (const vw of volveJson.wells) {
      const n = vw.months.length; const last = vw.oil_bbl[n - 1]; const prev = vw.oil_bbl[Math.max(0, n - 2)]
      const toT = (bbl: number) => +(bbl * 0.136).toFixed(1)
      const daysInMonth = 30.4
      const wo = add('Well', vw.name, { number: vw.name, kind: vw.name.includes('F-4') || vw.name.includes('F-5') ? 'нагнетательная' : 'добывающая', status: last > 0 ? 'в работе' : 'остановлена (конец добычи 2016)', debit: +(toT(last) / daysInMonth).toFixed(1), water_cut: last + vw.water_bbl[n - 1] > 0 ? +(100 * vw.water_bbl[n - 1] / (last + vw.water_bbl[n - 1])).toFixed(1) : 0, commissioned: `${vw.months[0]}-01`, trend_30d: prev > 0 ? +((last - prev) / prev * 100).toFixed(1) : 0 }, { subsidiary: dzoA.id, sources: ['volve'], markings: ['INTERNAL', 'PROD'], version: n, materializedAt: NOW - 3 * DAY, meta: { debit: { source: 'volve.production.BOPM', sourceTs: Date.UTC(2016, 8, 1) }, water_cut: { source: 'volve.production.BWPM' }, status: { source: 'volve.production.BOPM' } } })
      wo.series = [
        { key: 'oil', label: 'Добыча нефти', unit: 'т/мес', source: 'Volve (Equinor), BOPM', x: vw.months, y: vw.oil_bbl.map(toT) },
        { key: 'water', label: 'Добыча воды', unit: 'т/мес', source: 'Volve (Equinor), BWPM', x: vw.months, y: vw.water_bbl.map(toT) },
        { key: 'bhp', label: 'Забойное давление', unit: 'бар', source: 'Volve (Equinor), BHP', x: vw.months, y: vw.bhp },
      ]
      wells.push(wo)
      link('located_on', wo.id, volvePad.id, { source: 'volve', markings: ['GEO'] })
    }
    // refineries (ru.wikipedia reference table) — synthetic load
    const refineries: SpObject[] = []
    for (const r of refineriesJson) {
      const ro = add('Refinery', r.name, { name: r.name, owner: r.owner, capacity_mt: r.capacity_mt, depth: r.depth != null ? +(r.depth * 100).toFixed(1) : null, region: r.region, district: r.district, commissioned: r.commissioned, load_pct: +rng.float(68, 96).toFixed(1) }, { geo: project(r.lon, r.lat), subsidiary: dzoC.id, sources: ['open_ref', 'scada'], markings: ['INTERNAL'], version: rng.int(3, 40), materializedAt: NOW - rng.int(10, 600) * 1000, meta: { name: openMeta('refineries.name'), owner: openMeta('refineries.owner'), capacity_mt: openMeta('refineries.capacity_mt'), depth: openMeta('refineries.depth'), region: openMeta('refineries.region'), commissioned: openMeta('refineries.commissioned'), load_pct: metaSrc('scada.refinery.load', 600) } })
      refineries.push(ro)
      link('operates', dzoC.id, ro.id, { source: 'manual' })
    }
    // trunk pipelines with real waypoints → pump stations, terminals, segments
    const npsByName = new Map<string, SpObject>(); const termByName = new Map<string, SpObject>()
    const tanks: SpObject[] = []; const segments: SpObject[] = []; const pipeObjs: SpObject[] = []
    const FOCUS = 'НПС-21 «Сковородино»', SECOND = 'ГНПС-1 «Тайшет»'
    let focus: SpObject | null = null; let second: SpObject | null = null
    for (const p of pipelinesJson) {
      const pts = p.route.map(w => project(w.lon, w.lat))
      const flow = Math.round(p.capacity_mt * 1000 / 365)
      const po = add('Pipeline', p.name, { code: `${p.name} «${p.full}»`, operator: p.operator, capacity_mt: p.capacity_mt, diameter: p.diameter_mm, length: p.length_km, design_pressure: 6.4, flow, commissioned: p.commissioned }, { geo: pts[Math.floor(pts.length / 2)], subsidiary: dzoB.id, sources: ['open_ref', 'opo_registry', 'sap_pm'], markings: ['INTERNAL'], meta: { operator: openMeta('pipelines.operator'), capacity_mt: openMeta('pipelines.capacity_mt'), length: openMeta('pipelines.length_km'), diameter: openMeta('pipelines.diameter_mm'), commissioned: openMeta('pipelines.commissioned'), flow: metaSrc('scada.pipe.flow', 20) } })
      pipeObjs.push(po)
      pipelines.push({ id: po.id, points: pts, flow, hot: p.name === 'ВСТО-1', code: p.name, unit: D.linearUnit })
      link('operates', dzoB.id, po.id, { source: 'manual' })
      p.route.forEach((w, i) => {
        const geo = pts[i]
        if (w.kind === 'ГНПС' || w.kind === 'НПС') {
          let o = npsByName.get(w.name)
          if (!o) {
            const isFocus = w.name === FOCUS
            o = add('PumpStation', w.name, { code: w.name, pipeline: p.name, place: w.place, capacity: rng.pick([3600, 4200, 5000, 6000, 7200]), mode: isFocus ? 'повышенное давление' : 'номинальный', pressure_in: +rng.float(1.8, 3.2).toFixed(2), pressure_out: isFocus ? 6.92 : +rng.float(4.6, 6.1).toFixed(2), pressure_anomaly_score: isFocus ? 0.87 : +rng.float(0.02, 0.18).toFixed(2), open_incidents: isFocus ? 2 : 0 }, { id: isFocus ? 'nps_01J8SN000000000000000NPS21' : w.name === SECOND ? 'nps_01J8SN000000000000000NPS01' : undefined, geo, subsidiary: dzoB.id, sources: ['open_ref', 'scada', 'sap_pm'], version: isFocus ? 1204 : rng.int(100, 900), materializedAt: NOW - rng.int(2, 20) * 1000, meta: { pipeline: openMeta('pipelines.route'), place: openMeta('pipelines.route'), pressure_in: metaSrc('scada.nps.p_in', 6), pressure_out: metaSrc('scada.nps.p_out', 6), mode: metaSrc('scada.nps.mode', 6), pressure_anomaly_score: { derived_by: 'pipelines.anomaly_v3@3.2.1', sourceTs: NOW - 52000, rawRid: 'raw_scada_telemetry:88412' } } })
            npsByName.set(w.name, o)
            link('operates', dzoB.id, o.id, { source: 'manual' })
            link('located_on', o.id, po.id, { source: 'opo_registry', markings: ['GEO'] })
            if (isFocus) focus = o; if (w.name === SECOND) second = o
          }
          link('connects', po.id, o.id, { source: 'opo_registry', markings: ['GEO'] })
        } else if (w.kind === 'терминал' || w.kind === 'узел') {
          let t = termByName.get(w.name)
          if (!t) {
            t = add('Terminal', w.name, { name: w.name, kind: w.kind === 'терминал' ? 'морской терминал' : 'узел / граница', pipeline: p.name, capacity_mt: p.capacity_mt, stock_pct: +rng.float(35, 80).toFixed(1) }, { geo, subsidiary: dzoB.id, sources: ['open_ref', 'scada'], markings: ['INTERNAL'], version: rng.int(3, 60), materializedAt: NOW - rng.int(30, 900) * 1000, meta: { pipeline: openMeta('pipelines.route'), capacity_mt: openMeta('pipelines.capacity_mt'), stock_pct: metaSrc('scada.terminal.stock', 60) } })
            termByName.set(w.name, t)
            link('operates', dzoB.id, t.id, { source: 'manual' })
            if (w.kind === 'терминал') for (let k = 0; k < 6; k++) { const tk = add('Tank', `РВС-${50000 + rng.int(1, 999)} · ${w.place}`, { code: `РВС-${k + 1}`, volume: rng.pick([20000, 30000, 50000]), level: +rng.float(22, 88).toFixed(1), product: 'нефть', temperature: +rng.float(8, 24).toFixed(1) }, { geo: [geo[0] + (k % 3) * 1.2 - 1.2, geo[1] + Math.floor(k / 3) * 1.2 + 2], subsidiary: dzoB.id, sources: ['scada', 'lims'], version: rng.int(200, 900), materializedAt: NOW - rng.int(2, 50) * 1000, meta: { level: metaSrc('scada.tank.level', 30) } }); tanks.push(tk); link('located_on', tk.id, t.id, { source: 'manual', markings: ['GEO'] }) }
          }
          link('connects', po.id, t.id, { source: 'opo_registry', markings: ['GEO'] })
        } else if (w.kind === 'НПЗ') {
          const key = w.name.split(' ')[0].replace('Ангарская', 'Ангарская'); const r = refineries.find(x => x.label.startsWith(key)) || refineries.find(x => x.label.includes(w.place))
          if (r) link('connects', po.id, r.id, { source: 'opo_registry', markings: ['GEO'] })
        }
      })
      const segCount = Math.max(3, Math.min(12, Math.round(p.length_km / 200)))
      for (let s = 0; s < segCount; s++) {
        const so = add('PipelineSegment', `${p.name} км ${Math.round(s * p.length_km / segCount)}–${Math.round((s + 1) * p.length_km / segCount)}`, { km_from: Math.round(s * p.length_km / segCount), km_to: Math.round((s + 1) * p.length_km / segCount), category: rng.pick(['I', 'II', 'III', 'B']), defects: rng.chance(0.3) ? rng.int(1, 14) : 0 }, { subsidiary: dzoB.id, sources: ['vtd', 'sap_pm'] })
        segments.push(so)
        link('located_on', so.id, po.id, { source: 'opo_registry', markings: ['GEO'] })
      }
    }
    if (!focus || !second) throw new Error('focus pump station missing in pipelines.json')
    // camera home: centre of all projected assets
    const all = [...fields, ...refineries, ...npsByName.values()].filter(o => o.geo)
    const cx = all.reduce((a, o) => a + o.geo![0], 0) / all.length, cy = all.reduce((a, o) => a + o.geo![1], 0) / all.length
    home = { x: +cx.toFixed(1), y: +cy.toFixed(1), z: 1.3 }
    // holding-level open series (JODI, EIA)
    const jodi = seriesJson.jodi; const steo = (seriesJson as unknown as { steo?: { months: string[]; values: number[]; source: string } | null }).steo
    holding.series = [
      ...(steo ? [{ key: 'steo', label: 'Добыча нефти и конденсата РФ (EIA STEO, оценка и прогноз)', unit: 'млн барр/сут', source: steo.source, x: steo.months, y: steo.values }] : []),
      { key: 'prod', label: 'Добыча нефти РФ (JODI)', unit: 'млн т/мес', source: jodi.source, x: jodi.months, y: jodi.production_kt.map(v => v == null ? null : +(v / 1000).toFixed(2)) },
      { key: 'ref', label: 'Переработка (поставка на НПЗ) РФ (JODI)', unit: 'млн т/мес', source: jodi.source, x: jodi.months, y: jodi.refinery_intake_kt.map(v => v == null ? null : +(v / 1000).toFixed(2)) },
      { key: 'exp', label: 'Экспорт нефти РФ (JODI)', unit: 'млн т/мес', source: jodi.source, x: jodi.months, y: jodi.exports_kt.map(v => v == null ? null : +(v / 1000).toFixed(2)) },
      { key: 'brent', label: 'Brent, среднемесячная (EIA)', unit: '$/барр', source: seriesJson.brent.source, x: seriesJson.brent_monthly.months, y: seriesJson.brent_monthly.values },
    ]
    holding.sources = ['manual', 'jodi', 'eia']
    const hosts: HostSpec[] = []
    const npsList = [...npsByName.values()]; const termList = [...termByName.values()]
    for (const o of npsList) hosts.push({ host: o, share: 0.42 / npsList.length, sub: dzoB.id, src: 'onec_toir' })
    for (const o of refineries) hosts.push({ host: o, share: 0.25 / refineries.length, sub: dzoC.id, src: 'sap_pm' })
    for (const o of termList) hosts.push({ host: o, share: 0.05 / termList.length, sub: dzoB.id, src: 'onec_toir' })
    for (const o of tanks) hosts.push({ host: o, share: 0.05 / tanks.length, sub: dzoB.id, src: 'onec_toir' })
    for (const o of segments) hosts.push({ host: o, share: 0.2 / segments.length, sub: dzoB.id, src: 'onec_toir' })
    for (const o of wells) hosts.push({ host: o, share: 0.03 / wells.length, sub: dzoA.id, src: 'sap_pm' })
    return {
      hosts, focusAsset: focus, secondAsset: second,
      focusEq: { cls: D.equipmentClasses[0], name: 'Насос-104', inv: '10004412', health: 0.41, id: 'eq_01J8ZK3V9Q7R6X4M2N1P0S8T7A', hours: 61240, onecKey: 'ОБ-004412 «Насос магистральный НМ-10000-210»', passportKey: 'Паспорт НМ 10000-210 № 4412', erBefore: 'ОБ-004412' },
      sensorClasses: ['PUMP', 'COMPRESSOR', 'MOTOR'], focusSensorValue: 6.92, anomalyKind: 'pressure_rise',
      focusContractSubject: 'ТОиР насосного оборудования НПС-21 «Сковородино»', secondContractSubject: 'Ремонт резервуаров', cartelSubjects: ['ТОиР насосного оборудования', 'Ремонт резервуаров', 'Поставка запорной арматуры', 'Изоляционные работы'],
      vehicleKinds: ['АЦ', 'Спецтехника', 'Вахтовый автобус', 'Бортовой', 'Кран'], withShipments: true,
    }
  }

  // ---------- Asset layer: power grid ----------
  function buildEnergy(): AssetLayer {
    const areaDefs = [
      { code: 'АРХ', name: 'Архангельский РЭС', geo: [150, 130] as [number, number], consumers: 184200 },
      { code: 'СДВ', name: 'Северодвинский РЭС', geo: [310, 80] as [number, number], consumers: 96400 },
      { code: 'КТЛ', name: 'Котласский РЭС', geo: [430, 170] as [number, number], consumers: 61800 },
      { code: 'ВЛС', name: 'Вельский РЭС', geo: [220, 280] as [number, number], consumers: 38900 },
    ]
    const areas: SpObject[] = []; const feeders: SpObject[] = []; const ps35: SpObject[] = []
    let fdrNo = 1
    const overloaded = new Set<number>()
    while (overloaded.size < Math.max(1, Math.round(8 * scale))) overloaded.add(rng.int(0, N.units - 1))
    for (const a of areaDefs) {
      const ao = add('GridArea', a.name, { code: a.code, name: a.name, consumers: a.consumers, saidi: +rng.float(28, 96).toFixed(1), operator: `АО «${dzoB.label}»` }, { geo: a.geo, subsidiary: dzoB.id, sources: ['manual', 'askue'], version: 2, meta: { saidi: { derived_by: 'functions.reliability_indices@1.0.0', sourceTs: NOW - 86400 * 1000 } } })
      areas.push(ao)
      link('operates', dzoB.id, ao.id, { source: 'manual' })
      const psCount = 5
      for (let p = 0; p < psCount; p++) {
        const ang = (p / psCount) * Math.PI * 2 + rng.float(-0.3, 0.3); const r = rng.float(28, 52)
        const geo: [number, number] = [a.geo[0] + Math.cos(ang) * r, a.geo[1] + Math.sin(ang) * r * 0.7]
        const here = Math.max(1, Math.round(N.units / (areaDefs.length * psCount)))
        const cap = rng.pick([6.3, 10, 16, 25])
        const ps = add('Substation', `ПС 35 кВ ${a.code}-${p + 1}`, { code: `ПС-35-${a.code}-${p + 1}`, voltage_kv: 35, capacity_mva: cap, load_mw: +(cap * rng.float(0.3, 0.8)).toFixed(1), load_pct: +rng.float(30, 80).toFixed(1), mode: 'нормальный', transformer_anomaly_score: +rng.float(0.01, 0.2).toFixed(2), open_incidents: 0 }, { geo, subsidiary: dzoB.id, sources: ['scada', 'sap_pm'], version: rng.int(50, 400) })
        ps35.push(ps)
        link('located_on', ps.id, ao.id, { source: 'manual', markings: ['GEO'] })
        for (let w = 0; w < here && feeders.length < N.units; w++) {
          const idx = feeders.length
          const wang = rng.float(0, Math.PI * 2); const wr = rng.float(6, 16)
          const fgeo: [number, number] = [geo[0] + Math.cos(wang) * wr, geo[1] + Math.sin(wang) * wr * 0.7]
          const kind = rng.chance(0.8) ? 'распределительный' : 'резервный'
          const status = rng.chance(0.86) ? 'под нагрузкой' : rng.chance(0.5) ? 'в ремонте' : 'отключён'
          const over = overloaded.has(idx)
          const load = status === 'под нагрузкой' ? +(rng.float(60, 320) * (over ? 1.45 : 1)).toFixed(0) : 0
          const fo = add('Feeder', `Ф-${fdrNo}`, { number: String(fdrNo), kind, status, load_a: load, consumers: rng.int(120, 4200), commissioned: fmtD(NOW - rng.int(400, 9000) * DAY), trend_30d: over ? +rng.float(18, 31).toFixed(1) : +rng.float(-2.5, 3).toFixed(1) }, { geo: fgeo, subsidiary: dzoB.id, sources: ['askue', 'scada', 'sap_pm'], meta: { load_a: metaSrc('askue.feeders.i', 900), status: metaSrc('scada.feeder.status', 300) } })
          fdrNo++
          feeders.push(fo)
          link('located_on', fo.id, ps.id, { source: 'manual', markings: ['GEO'] })
          link('feeds', ps.id, fo.id, { source: 'manual' })
        }
      }
    }
    const hub1 = add('Substation', 'ПС 220 кВ Заречная', { code: 'Заречная-220', voltage_kv: 220, capacity_mva: 500, load_mw: 262.4, load_pct: 58.3, mode: 'нормальный', transformer_anomaly_score: 0.05, open_incidents: 0 }, { id: 'ps_01J8SN0000000000000000ZARE', geo: [540, 300], subsidiary: dzoA.id, sources: ['scada', 'sap_pm'], version: 812, materializedAt: NOW - 4000, meta: { load_mw: metaSrc('scada.ps.p', 6), load_pct: metaSrc('scada.ps.load', 6), mode: metaSrc('scada.ps.mode', 6), transformer_anomaly_score: { derived_by: 'pipelines.anomaly_v3@3.2.1', sourceTs: NOW - 40000 } } })
    const hub2 = add('Substation', 'ПС 220 кВ Северная', { code: 'Северная-220', voltage_kv: 220, capacity_mva: 400, load_mw: 318.4, load_pct: 88.4, mode: 'перегрузка АТ-1', transformer_anomaly_score: 0.87, open_incidents: 2 }, { id: 'ps_01J8SN0000000000000000SEVE', geo: [700, 385], subsidiary: dzoA.id, sources: ['scada', 'sap_pm'], version: 1204, materializedAt: NOW - 3000, meta: { load_mw: metaSrc('scada.ps.p', 5), load_pct: metaSrc('scada.ps.load', 5), mode: metaSrc('scada.ps.mode', 5), transformer_anomaly_score: { derived_by: 'pipelines.anomaly_v3@3.2.1', sourceTs: NOW - 52000, rawRid: 'raw_scada_telemetry:88412' } } })
    link('operates', dzoA.id, hub1.id, { source: 'manual' }); link('operates', dzoA.id, hub2.id, { source: 'manual' })
    const ps110: SpObject[] = []
    const city: [number, number] = [870, 480]
    for (let i = 0; i < 18; i++) {
      const col = i % 6, row = Math.floor(i / 6)
      const geo: [number, number] = [city[0] - 45 + col * 18, city[1] - 20 + row * 20]
      const cap = rng.pick([40, 63, 80, 126])
      const t = add('Substation', `ПС 110 кВ Город-${i + 1}`, { code: `Город-${i + 1}`, voltage_kv: 110, capacity_mva: cap, load_mw: +(cap * rng.float(0.25, 0.85)).toFixed(1), load_pct: +rng.float(22, 88).toFixed(1), mode: 'нормальный', transformer_anomaly_score: +rng.float(0.01, 0.3).toFixed(2), open_incidents: 0 }, { geo, subsidiary: dzoB.id, sources: ['scada', 'sap_pm'], version: rng.int(200, 900), materializedAt: NOW - rng.int(2, 50) * 1000, meta: { load_pct: metaSrc('scada.ps.load', 30), load_mw: metaSrc('scada.ps.p', 30) } })
      ps110.push(t)
      link('operates', dzoB.id, t.id, { source: 'manual' })
      link('feeds', hub2.id, t.id, { source: 'manual' })
    }
    const lineDefs: { code: string; points: [number, number][]; from: string; to: string; flow: number; hot: boolean; kv: number }[] = [
      { code: 'ВЛ-220 «АРХ — ВЛС — Заречная»', points: [[150, 130], [200, 210], [220, 280], [380, 300], [540, 300]], from: areas[0].id, to: hub1.id, flow: 148, hot: false, kv: 220 },
      { code: 'ВЛ-220 «СДВ — КТЛ — Заречная»', points: [[310, 80], [380, 120], [430, 170], [500, 250], [540, 300]], from: areas[1].id, to: hub1.id, flow: 121, hot: false, kv: 220 },
      { code: 'ВЛ-220 «Заречная — Северная»', points: [[540, 300], [610, 330], [660, 370], [700, 385]], from: hub1.id, to: hub2.id, flow: 269, hot: false, kv: 220 },
      { code: 'ВЛ-110 «Северная — Город»', points: [[700, 385], [760, 420], [820, 460], [870, 480]], from: hub2.id, to: ps110[0].id, flow: 260, hot: true, kv: 110 },
      { code: 'ВЛ-110 «КТЛ — Северная» (транзит)', points: [[430, 170], [520, 200], [620, 280], [700, 385]], from: areas[2].id, to: hub2.id, flow: 42, hot: false, kv: 110 },
    ]
    const segments: SpObject[] = []
    for (const p of lineDefs) {
      let len = 0
      for (let i = 1; i < p.points.length; i++) len += Math.hypot(p.points[i][0] - p.points[i - 1][0], p.points[i][1] - p.points[i - 1][1])
      const km = +(len * 0.42).toFixed(1)
      const po = add('PowerLine', p.code.split(' «')[0] + ' ' + p.code.split('«')[1].replace('»', '').split(' (')[0], { code: p.code, voltage_kv: p.kv, length: km, load_mw: p.flow, load_pct: +(p.flow / (p.kv === 220 ? 3.2 : 3)).toFixed(1), commissioned: rng.int(1975, 2015) }, { geo: p.points[Math.floor(p.points.length / 2)], subsidiary: dzoA.id, sources: ['opo_registry', 'sap_pm'], meta: { load_mw: metaSrc('scada.line.p', 20) } })
      pipelines.push({ id: po.id, points: p.points, flow: p.flow, hot: p.hot, code: p.code, unit: D.linearUnit })
      link('operates', dzoA.id, po.id, { source: 'manual' })
      link('connects', po.id, p.from, { source: 'opo_registry', markings: ['GEO'] }); link('connects', po.id, p.to, { source: 'opo_registry', markings: ['GEO'] })
      const segCount = Math.max(4, Math.round(km / 15))
      for (let s = 0; s < segCount; s++) {
        const so = add('LineSegment', `${po.label} км ${Math.round(s * km / segCount)}–${Math.round((s + 1) * km / segCount)}`, { km_from: +(s * km / segCount).toFixed(1), km_to: +((s + 1) * km / segCount).toFixed(1), towers: rng.int(30, 60), defects: rng.chance(0.3) ? rng.int(1, 14) : 0 }, { subsidiary: dzoA.id, sources: ['vtd', 'sap_pm'] })
        segments.push(so)
        link('located_on', so.id, po.id, { source: 'opo_registry', markings: ['GEO'] })
      }
    }
    const hosts: HostSpec[] = []
    for (const f of feeders) hosts.push({ host: f, share: 0.22 / feeders.length, sub: dzoB.id, src: 'sap_pm' })
    for (const p of ps35) hosts.push({ host: p, share: 0.08 / ps35.length, sub: dzoB.id, src: 'sap_pm' })
    hosts.push({ host: hub1, share: 0.11, sub: dzoA.id, src: 'onec_toir' })
    hosts.push({ host: hub2, share: 0.11, sub: dzoA.id, src: 'onec_toir' })
    for (const t of ps110) hosts.push({ host: t, share: 0.2 / ps110.length, sub: dzoB.id, src: 'onec_toir' })
    for (const s of segments) hosts.push({ host: s, share: 0.28 / segments.length, sub: dzoA.id, src: 'onec_toir' })
    return {
      hosts, focusAsset: hub2, secondAsset: hub1,
      focusEq: { cls: D.equipmentClasses[0], name: 'АТ-1', inv: '20007731', health: 0.41, id: 'eq_01J8ZK3V9Q7R6X4M2N1P0S8T7B', hours: 61240, onecKey: 'ОБ-007731 «Автотрансформатор АТДЦТН-250000/220»', passportKey: 'Паспорт АТДЦТН-250000/220 № 7731', erBefore: 'ОБ-007731' },
      sensorClasses: ['TRANSFORMER', 'BREAKER', 'REACTOR'], focusSensorValue: 84.2, anomalyKind: 'oil_temp_rise',
      focusContractSubject: 'ТОиР силовых трансформаторов ПС Северная-220', secondContractSubject: 'Замена опор ВЛ', cartelSubjects: ['ТОиР силовых трансформаторов', 'Замена опор ВЛ', 'Поставка выключателей 110 кВ', 'Расчистка просек ВЛ'],
      vehicleKinds: ['ОВБ', 'Автовышка', 'Бригадный автомобиль', 'Бурильно-крановая', 'Кран'], withShipments: false,
    }
  }

  const L = D.key === 'energy' ? buildEnergy() : buildOilGas()
  const focusAsset = L.focusAsset
  const focusCode = String(focusAsset.props.code)

  // ---------- Equipment ----------
  const EQ_CLASSES = D.equipmentClasses
  const equipment: SpObject[] = []
  const eqCounter: Record<string, number> = {}
  function pickClass(r: Rng) { let x = r.next(); for (const c of EQ_CLASSES) { x -= c[2]; if (x <= 0) return c } return EQ_CLASSES[EQ_CLASSES.length - 1] }
  function mkEquipment(host: SpObject, sub: string, src: string, forced?: AssetLayer['focusEq']) {
    const cls = forced?.cls ?? pickClass(rng)
    eqCounter[cls[0]] = (eqCounter[cls[0]] || 0) + 1
    const n = forced ? forced.name : `${cls[1]}-${eqCounter[cls[0]] + (cls[0] === 'PUMP' ? 100 : 0)}`
    const hours = forced?.hours ?? rng.int(200, 78000)
    let health = forced?.health ?? Math.max(0.12, Math.min(0.99, +(0.97 - hours / 150000 + rng.gauss(0, 0.09)).toFixed(3)))
    if (!forced && rng.chance(0.03)) health = +rng.float(0.15, 0.39).toFixed(3)
    const sources = src === 'sap_pm' ? ['sap_pm', 'passports'] : rng.chance(0.35) ? ['sap_pm', 'onec_toir'] : ['onec_toir', 'passports']
    const inv = forced?.inv ?? String(10000000 + rng.int(1, 8999999))
    const o = add('Equipment', n, { inventory_no: inv, name: n, equipment_class: cls[0], operating_hours: hours, health_index: health, criticality: health < 0.4 ? 'высокая' : rng.pick(['средняя', 'средняя', 'высокая', 'низкая']), purchase_cost: rng.int(120, 48000) * 1000, commissioned: fmtD(NOW - Math.round(hours / 12) * DAY - rng.int(0, 300) * DAY) }, { id: forced?.id, geo: host.geo ? [host.geo[0] + rng.float(-3, 3), host.geo[1] + rng.float(-3, 3)] : undefined, subsidiary: sub, sources, version: forced ? 37 : undefined, meta: { inventory_no: metaSrc(sources[0] === 'sap_pm' ? 'sap_pm.equi.equnr' : 'onec_toir.oborudovanie.inv_nomer', 900), operating_hours: metaSrc(sources[0] === 'sap_pm' ? 'sap_pm.equi.oper_hours' : 'onec_toir.oborudovanie.narabotka', 900), health_index: { derived_by: 'functions.equipment_health_index@2.1.0', sourceTs: NOW - rng.int(60, 800) * 1000 }, purchase_cost: metaSrc('sap_pm.anla.answl', 86400) }, crosswalk: sources.length > 1 ? [{ system: 'sap_pm', key: inv, score: 1, rule: 'inventory_no exact' }, { system: 'onec_toir', key: `ОБ-${inv.slice(-6)}`, score: 0.97, rule: 'inventory_no + functional location' }] : undefined })
    equipment.push(o)
    link('has_equipment', host.id, o.id, { source: 'sap_pm' })
    return o
  }
  let focusEq: SpObject | null = null
  for (const h of L.hosts) {
    const count = Math.max(1, Math.round(N.equipment * h.share))
    for (let i = 0; i < count; i++) {
      if (h.host === focusAsset && i === 3 && !focusEq) focusEq = mkEquipment(focusAsset, h.sub, h.src, L.focusEq)
      else mkEquipment(h.host, h.sub, h.src)
    }
  }
  if (!focusEq) focusEq = mkEquipment(focusAsset, focusAsset.subsidiary!, 'onec_toir', L.focusEq)
  focusEq.markings = ['CONFIDENTIAL', 'PROD', 'SYNTHETIC']
  focusEq.sources = ['sap_pm', 'onec_toir', 'passports']
  focusEq.crosswalk = [{ system: 'sap_pm', key: L.focusEq.inv, score: 1, rule: 'inventory_no exact' }, { system: 'onec_toir', key: L.focusEq.onecKey, score: 0.97, rule: `inventory_no + функциональное место ${focusCode}` }, { system: 'passports', key: L.focusEq.passportKey, score: 0.91, rule: 'серийный номер' }]
  focusEq.meta.inventory_no = { source: 'sap_pm.equi.equnr', sourceTs: NOW - 640 * 1000, rawRid: `raw_sap_equi:${L.focusEq.inv.slice(-4)}` }
  focusEq.materializedAt = NOW - 700 * 1000
  focusEq.history = [
    { version: 37, ts: NOW - 700 * 1000, cause: 'materialize_equipment@build 9f3c', causeKind: 'pipeline', diff: [{ prop: 'health_index', before: 0.47, after: 0.41 }, { prop: 'operating_hours', before: 61226, after: 61240 }] },
    { version: 36, ts: NOW - 2 * HOUR, cause: 'materialize_equipment@build 9f3c', causeKind: 'pipeline', diff: [{ prop: 'health_index', before: 0.52, after: 0.47 }] },
    { version: 35, ts: NOW - 1 * DAY, cause: 'change_order_priority', causeKind: 'action', actor: 'toir_eng', diff: [{ prop: 'criticality', before: 'средняя', after: 'высокая' }] },
    { version: 34, ts: NOW - 3 * DAY, cause: 'er_equipment@build 7c1a', causeKind: 'er', diff: [{ prop: 'inventory_no', before: L.focusEq.erBefore, after: L.focusEq.inv }] },
    { version: 33, ts: NOW - 9 * DAY, cause: 'materialize_equipment@build 8b2e', causeKind: 'pipeline', diff: [{ prop: 'health_index', before: 0.58, after: 0.52 }] },
  ] satisfies HistoryEntry[]

  // ---------- Sensors ----------
  const sensors: SpObject[] = []
  const sensorKinds = D.sensorKinds
  const withSensors = [focusEq, ...equipment.filter(e => e !== focusEq && L.sensorClasses.includes(e.props.equipment_class as string))]
  let sensorNo = 0
  const focusSensors: Record<string, SpObject> = {}
  for (const e of withSensors) {
    if (sensors.length >= Math.round(1200 * scale) && e !== focusEq) break
    const tagNo = e === focusEq ? 104 : 200 + sensorNo
    for (const k of sensorKinds) {
      const bad = rng.chance(0.02)
      const s = add('Sensor', `${k[0]}-${tagNo}`, { tag: `${k[0]}-${tagNo}`, kind: k[1], unit: k[2], last_value: +rng.float(k[3], k[4]).toFixed(2), quality: bad ? 'bad' : 'good' }, { subsidiary: e.subsidiary, geo: e.geo, sources: ['opcua', 'historian'], version: rng.int(1000, 90000), materializedAt: NOW - rng.int(1, 5) * 1000, meta: { last_value: metaSrc('opcua.node.value', 5) } })
      if (e === focusEq) { focusSensors[k[0]] = s; if (k === sensorKinds[0]) s.props.last_value = L.focusSensorValue }
      sensors.push(s)
      link('measured_by', e.id, s.id, { source: 'scada' })
    }
    sensorNo++
  }
  const focusSensor = focusSensors[sensorKinds[0][0]]

  // ---------- Anomalies ----------
  const anomalies: SpObject[] = []
  const focusAnomaly = add('Anomaly', `${D.anomalyLabel} ${focusCode}`, { kind: L.anomalyKind, score: 0.87, window_from: fmtDT(NOW - 15 * MIN), window_to: fmtDT(NOW - 2 * MIN), model: 'anomaly_v3 (isolation forest + CUSUM)' }, { id: 'an_01J8SN000000000000000AN0002', created: NOW - 14 * MIN, version: 1, materializedAt: NOW - 90 * 1000, subsidiary: focusAsset.subsidiary, sources: ['pipelines.anomaly_v3'], meta: { score: { derived_by: 'pipelines.anomaly_v3@3.2.1', rawRid: 'raw_scada_telemetry:88412' } } })
  anomalies.push(focusAnomaly)
  link('detected_on', focusAnomaly.id, focusSensor.id, { source: 'pipelines.anomaly_v3' }); link('detected_on', focusAnomaly.id, focusEq.id, { source: 'pipelines.anomaly_v3' }); link('detected_on', focusAnomaly.id, focusAsset.id, { source: 'pipelines.anomaly_v3' })
  for (let i = 0; i < 24; i++) {
    const s = rng.pick(sensors); const ts = NOW - rng.int(1, 30 * 24) * HOUR
    const a = add('Anomaly', `Аномалия ${s.label}`, { kind: rng.pick(['vibration_spike', 'temperature_drift', 'pressure_drop', 'signal_loss']), score: +rng.float(0.55, 0.93).toFixed(2), window_from: fmtDT(ts), window_to: fmtDT(ts + rng.int(5, 90) * MIN), model: 'anomaly_v3' }, { created: ts, version: 1, subsidiary: s.subsidiary, sources: ['pipelines.anomaly_v3'] })
    anomalies.push(a)
    link('detected_on', a.id, s.id, { source: 'pipelines.anomaly_v3' })
    const eqL = linksTo.get(s.id)?.find(l => l.type === 'measured_by'); if (eqL) link('detected_on', a.id, eqL.from, { source: 'pipelines.anomaly_v3' })
  }

  // ---------- Persons & organizations with affiliation chains ----------
  const orgs: SpObject[] = []
  const persons: SpObject[] = []
  const usedNames = new Set<string>()
  function orgName(r: Rng, force?: string) {
    for (let k = 0; k < 20; k++) {
      const form = force ? 'ООО' : r.pick(FORMS)
      const base = force ?? r.pick(ORG_WORDS) + (r.chance(0.5) ? r.pick(ORG_SUFFIX) : '')
      const name = form === 'ИП' ? `ИП ${person(r).short}` : `${form} «${base}»`
      if (!usedNames.has(name)) { usedNames.add(name); return name }
    }
    return `ООО «${r.pick(ORG_WORDS)}-${r.int(2, 99)}»`
  }
  function mkPerson(r: Rng, roles: string, force?: { full: string; short: string }) {
    const p = force ?? person(r)
    const o = add('Person', p.short, { full_name: p.full, inn: makeInn12(r), roles, orgs_count: 1 }, { sources: ['egrul'], version: rng.int(1, 6), meta: { full_name: metaSrc('egrul.fl.fio', 86400), inn: metaSrc('egrul.fl.inn', 86400) } })
    persons.push(o); return o
  }
  function mkOrg(r: Rng, opts: { name?: string; region?: string; address?: string; phone?: string; shell?: boolean; risk?: number; id?: string; sources?: string[]; registered?: number }) {
    const region = opts.region ?? r.pick(REGIONS)
    const city = r.pick(CITIES[region])
    const address = opts.address ?? `${region}, г. ${city}, ул. ${r.pick(STREETS)}, д. ${r.int(1, 120)}${r.chance(0.4) ? `, оф. ${r.int(1, 400)}` : ''}`
    const phone = opts.phone ?? `+7 ${r.int(900, 999)} ${r.int(100, 999)}-${r.int(10, 99)}-${r.int(10, 99)}`
    const registered = opts.registered ?? NOW - r.int(opts.shell ? 40 : 400, opts.shell ? 200 : 9000) * DAY
    const name = opts.name ?? orgName(r)
    const sources = opts.sources ?? (r.chance(0.55) ? ['sap_mm', 'onec', 'egrul'] : r.chance(0.5) ? ['sap_mm', 'egrul'] : ['onec', 'egrul'])
    const inn = makeInn(r)
    const o = add('Organization', name, { name, inn, ogrn: makeOgrn(r), status: opts.shell && r.chance(0.3) ? 'в процессе ликвидации' : r.chance(0.96) ? 'действующая' : 'ликвидирована', region, address, phone, risk_score: opts.risk ?? +Math.max(0.02, Math.min(0.97, r.gauss(0.22, 0.14))).toFixed(2), contracts_total: 0, registered: fmtD(registered), control_flag: false }, { id: opts.id, sources, version: r.int(2, 30), meta: { name: metaSrc('egrul.ul.name', 86400), inn: metaSrc('egrul.ul.inn', 86400), status: metaSrc('egrul.ul.status', 86400), phone: metaSrc('onec.kontragenty.telefon', 3600), address: metaSrc('egrul.ul.address', 86400), risk_score: { derived_by: 'functions.counterparty_risk_score@1.4.0', sourceTs: NOW - r.int(60, 3600) * 1000 }, control_flag: metaSrc('crm.counterparty.block_status', 600) }, crosswalk: sources.map(s => ({ system: s, key: s === 'egrul' ? inn : s === 'sap_mm' ? `LIFNR ${r.int(100000, 999999)}` : `К-${r.int(10000, 99999)}`, score: s === 'egrul' ? 1 : 1, rule: 'ИНН exact' })) })
    orgs.push(o); return o
  }
  // named scenario chain: Иванов И.И. founds Вектор and Стрела (same in every domain — the core scenario is about counterparties)
  const homeRegion = D.dzo[0].region
  const homeCity = CITIES[homeRegion][0]
  const ivanov = mkPerson(rng, 'учредитель, директор', { full: 'Иванов Игорь Иванович', short: 'Иванов И.И.' })
  ivanov.props.orgs_count = 2
  const vektor = mkOrg(rng, { name: 'ООО «Вектор»', region: homeRegion, address: `${homeRegion}, г. ${homeCity}, ул. Энергетиков, д. 14, оф. 207`, phone: '+7 3462 55-01-14', risk: 0.71, id: 'org_01J8SN00000000000000VEKTOR', sources: ['sap_mm', 'onec', 'egrul'], registered: NOW - 2140 * DAY })
  const strela = mkOrg(rng, { name: 'ООО «Стрела»', region: homeRegion, address: `${homeRegion}, г. ${homeCity}, ул. Энергетиков, д. 14, оф. 207`, phone: '+7 3462 55-01-14', risk: 0.68, id: 'org_01J8SN00000000000000STRELA', sources: ['sap_mm', 'egrul'], registered: NOW - 1380 * DAY })
  vektor.crosswalk = [
    { system: 'sap_mm', key: 'LIFNR 0000418823', score: 1, rule: 'ИНН exact' }, { system: 'onec', key: 'К-00017714 «Вектор ООО»', score: 1, rule: 'ИНН exact' },
    { system: 'egrul', key: vektor.props.inn as string, score: 1, rule: 'первичный источник' }, { system: 'mail', key: '3 письма (mention)', score: 0.94, rule: 'Jaro-Winkler 0.96 + регион' },
  ]
  vektor.history = [
    { version: 41, ts: NOW - 55 * MIN, cause: 'materialize_organization@build 5d21', causeKind: 'pipeline', diff: [{ prop: 'risk_score', before: 0.64, after: 0.71 }] },
    { version: 40, ts: NOW - 3 * DAY, cause: 'er_organization@build 4a90 (merge)', causeKind: 'er', diff: [{ prop: 'sources', before: 'sap_mm, egrul', after: 'sap_mm, onec, egrul' }, { prop: 'phone', before: null, after: '+7 3462 55-01-14' }] },
    { version: 39, ts: NOW - 12 * DAY, cause: 'materialize_organization@build 4a11', causeKind: 'pipeline', diff: [{ prop: 'status', before: 'действующая', after: 'действующая' }, { prop: 'address', before: `г. ${homeCity}, ул. Мира, д. 3`, after: `г. ${homeCity}, ул. Энергетиков, д. 14, оф. 207` }] },
  ]
  vektor.version = 41
  link('founder_of', ivanov.id, vektor.id, { source: 'egrul', markings: ['CONFIDENTIAL'], props: { share: 100 }, validFrom: NOW - 2140 * DAY })
  link('founder_of', ivanov.id, strela.id, { source: 'egrul', markings: ['CONFIDENTIAL'], props: { share: 60 }, validFrom: NOW - 1380 * DAY })
  link('director_of', ivanov.id, vektor.id, { source: 'egrul', markings: ['CONFIDENTIAL'], validFrom: NOW - 2140 * DAY })
  const strelaDir = mkPerson(rng, 'директор')
  link('director_of', strelaDir.id, strela.id, { source: 'egrul', markings: ['CONFIDENTIAL'] })
  link('director_of', strelaDir.id, strela.id, { source: 'nlp', confidence: 0.82, markings: ['CONFIDENTIAL'] })
  // 40 affiliated chains
  const chains: SpObject[][] = [[vektor, strela]]
  for (let c = 1; c < Math.max(2, Math.round(40 * scale)); c++) {
    const size = rng.int(2, 4)
    const founder = mkPerson(rng, 'учредитель')
    founder.props.orgs_count = size
    const region = rng.pick(REGIONS)
    const shared = rng.pick(['address', 'phone', 'both', 'none'])
    const addr = `${region}, г. ${rng.pick(CITIES[region])}, ул. ${rng.pick(STREETS)}, д. ${rng.int(1, 120)}`
    const phone = `+7 ${rng.int(900, 999)} ${rng.int(100, 999)}-${rng.int(10, 99)}-${rng.int(10, 99)}`
    const chain: SpObject[] = []
    for (let i = 0; i < size; i++) {
      const o = mkOrg(rng, { region, address: shared === 'address' || shared === 'both' ? addr : undefined, phone: shared === 'phone' || shared === 'both' ? phone : undefined, risk: +rng.float(0.45, 0.82).toFixed(2) })
      chain.push(o)
      link('founder_of', founder.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'], props: { share: rng.pick([100, 51, 60, 75]) } })
      if (rng.chance(0.5)) { const d = mkPerson(rng, 'директор'); link('director_of', d.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'] }) }
      else link('director_of', founder.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'] })
    }
    if (size > 2 && rng.chance(0.5)) link('founder_of', chain[0].id, chain[1].id, { source: 'egrul', markings: ['CONFIDENTIAL'], props: { share: 30 } })
    chains.push(chain)
  }
  // shells
  for (let i = 0; i < 15; i++) { const o = mkOrg(rng, { shell: true, risk: +rng.float(0.7, 0.95).toFixed(2), address: 'Москва, г. Москва, ул. Промышленная, д. 11, стр. 2' }); const d = mkPerson(rng, 'директор (массовый)'); d.props.orgs_count = rng.int(6, 22); link('director_of', d.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'] }) }
  while (orgs.length < N.orgs) { const o = mkOrg(rng, {}); if (rng.chance(0.7)) { const f = mkPerson(rng, 'учредитель'); link('founder_of', f.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'], props: { share: 100 } }); if (rng.chance(0.6)) link('director_of', f.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'] }); else { const d = mkPerson(rng, 'директор'); link('director_of', d.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'] }) } } }
  while (persons.length < N.persons) { const p = mkPerson(rng, rng.pick(['учредитель', 'директор', 'бенефициар', 'представитель'])); const o = rng.pick(orgs); link(rng.chance(0.6) ? 'founder_of' : 'director_of', p.id, o.id, { source: rng.chance(0.85) ? 'egrul' : 'nlp', confidence: rng.chance(0.85) ? 1 : +rng.float(0.6, 0.9).toFixed(2), markings: ['CONFIDENTIAL'] }) }

  // ---------- Contracts, procurements, bids ----------
  const contracts: SpObject[] = []
  const orgContracts = new Map<string, SpObject[]>()
  function mkContract(org: SpObject, sub: SpObject, opts: { subject?: string; amount?: number; status?: string; id?: string; signed?: number; overdue?: number } = {}) {
    const signed = opts.signed ?? NOW - rng.int(30, 1400) * DAY
    const amount = opts.amount ?? Math.round(Math.exp(rng.gauss(16.5, 1.1)) / 1000) * 1000
    const status = opts.status ?? (rng.chance(0.55) ? 'исполняется' : rng.chance(0.85) ? 'закрыт' : 'просрочен')
    const overdue = opts.overdue ?? (status === 'просрочен' ? rng.int(5, 120) : 0)
    const c = add('Contract', `Договор ${rng.int(1000, 9999)}/${new Date(signed).getFullYear() % 100}-${rng.pick(['ТР', 'ДБ', 'ПР'])}`, { number: '', subject: opts.subject ?? rng.pick(D.contractSubjects), amount, signed: fmtD(signed), valid_to: fmtD(signed + rng.int(180, 900) * DAY), status, execution: status === 'закрыт' ? 100 : rng.int(5, 95), overdue_days: overdue }, { id: opts.id, created: signed, subsidiary: sub.id, sources: rng.chance(0.6) ? ['sap_mm', 'sed'] : ['onec', 'sed'], meta: { amount: metaSrc('sap_mm.ekko.netwr', 900), status: metaSrc('sap_mm.ekko.status', 900), execution: { derived_by: 'functions.contract_execution_status@1.2.0' } } })
    c.props.number = c.label.replace('Договор ', '')
    contracts.push(c)
    link('party_to', org.id, c.id, { source: 'sap_mm', markings: ['CONFIDENTIAL'], props: { role: 'исполнитель' } })
    link('party_to', sub.id, c.id, { source: 'sap_mm', markings: ['CONFIDENTIAL'], props: { role: 'заказчик' } })
    let a = orgContracts.get(org.id); if (!a) { a = []; orgContracts.set(org.id, a) } a.push(c)
    return c
  }
  const focusSub = objects.get(focusAsset.subsidiary!)!
  const focusContract = mkContract(vektor, focusSub, { subject: L.focusContractSubject, amount: 184_500_000, status: 'просрочен', overdue: 23, id: 'ctr_01J8SN00000000000000VEKT01', signed: NOW - 410 * DAY })
  mkContract(vektor, focusSub, { subject: D.contractSubjects[1], amount: 62_300_000, status: 'закрыт', signed: NOW - 800 * DAY })
  mkContract(vektor, dzoA, { subject: D.contractSubjects[7], amount: 41_800_000, status: 'исполняется', signed: NOW - 120 * DAY })
  mkContract(strela, focusSub, { subject: L.secondContractSubject, amount: 97_000_000, status: 'просрочен', overdue: 41, signed: NOW - 300 * DAY })
  mkContract(strela, dzoC, { subject: D.contractSubjects[9], amount: 28_400_000, status: 'закрыт', signed: NOW - 600 * DAY })
  while (contracts.length < N.contracts) mkContract(rng.pick(orgs), rng.pick(dzo))
  for (const o of orgs) { const cs = orgContracts.get(o.id) || []; o.props.contracts_total = cs.reduce((a, c) => a + (c.props.amount as number), 0) }

  const procs: SpObject[] = []
  const cartelProcs: string[] = []
  const sharedProcs: string[] = []
  function mkProc(participants: SpObject[], winnerIdx: number, opts: { cartel?: number; sub?: SpObject; subject?: string; nmc?: number; published?: number; tight?: boolean } = {}) {
    const sub = opts.sub ?? rng.pick(dzo)
    const published = opts.published ?? NOW - rng.int(20, 900) * DAY
    const nmc = opts.nmc ?? Math.round(Math.exp(rng.gauss(17, 1)) / 10000) * 10000
    const disc = opts.tight ? rng.float(0.3, 1.8) : rng.float(0.5, 24)
    const winnerPrice = Math.round(nmc * (1 - disc / 100))
    const p = add('Procurement', `Закупка ${String(rng.int(31000000000000, 32999999999999))}`, { notice_no: '', subject: opts.subject ?? rng.pick(D.contractSubjects), nmc, method: rng.pick(['запрос предложений', 'открытый конкурс', 'аукцион', 'запрос котировок']), published: fmtD(published), bids_count: participants.length, winner_discount: +disc.toFixed(1), cartel_pattern: opts.cartel ?? +Math.max(0.01, Math.min(0.4, rng.gauss(0.12, 0.09))).toFixed(2), status: 'завершена' }, { created: published, subsidiary: sub.id, sources: ['eis', 'etp'], meta: { nmc: metaSrc('eis.notice.nmc', 3600), cartel_pattern: { derived_by: 'functions.cartel_pattern@1.0.0' } } })
    p.props.notice_no = p.label.replace('Закупка ', '')
    procs.push(p)
    participants.forEach((org, i) => {
      const price = i === winnerIdx ? winnerPrice : Math.round(winnerPrice * (1 + (opts.tight ? rng.float(0.2, 1.5) : rng.float(0.5, 12)) / 100))
      const b = add('Bid', `Заявка ${org.label}`, { price, result: i === winnerIdx ? 'победитель' : 'отклонена/2-е место', submitted: fmtDT(published + rng.int(3, 20) * DAY) }, { created: published, sources: ['etp'] })
      link('participated_in', org.id, p.id, { source: 'eis', props: { bid: b.id, price, winner: i === winnerIdx } })
    })
    const c = mkContract(participants[winnerIdx], sub, { subject: p.props.subject as string, amount: winnerPrice, signed: published + 30 * DAY })
    link('awarded', p.id, c.id, { source: 'eis', markings: ['CONFIDENTIAL'] })
    return p
  }
  // 6 procurements shared by Вектор and Стрела (rotation of winners, tight prices)
  for (let i = 0; i < 6; i++) {
    const third = rng.pick(orgs.slice(50))
    const parts = rng.chance(0.5) ? [vektor, strela, third] : [strela, vektor]
    const p = mkProc(parts, i % 2 === 0 ? parts.indexOf(vektor) : parts.indexOf(strela), { cartel: +(0.66 + rng.float(0, 0.12)).toFixed(2), sub: focusSub, tight: true, published: NOW - (60 + i * 75) * DAY, subject: rng.pick(L.cartelSubjects) })
    sharedProcs.push(p.id); cartelProcs.push(p.id)
  }
  procs[procs.length - 1].props.cartel_pattern = 0.72
  // other cartels from chains
  for (let i = 0; i < Math.max(2, Math.round(19 * scale)); i++) {
    const chain = chains[1 + (i % (chains.length - 1))]
    if (chain.length < 2) continue
    const p = mkProc(chain.slice(0, 3), i % Math.min(3, chain.length), { cartel: +rng.float(0.55, 0.9).toFixed(2), tight: true })
    cartelProcs.push(p.id)
  }
  while (procs.length < N.procs) {
    const n = rng.int(1, 5); const parts: SpObject[] = []
    while (parts.length < n) { const o = rng.pick(orgs); if (!parts.includes(o)) parts.push(o) }
    mkProc(parts, rng.int(0, n - 1))
  }

  // ---------- Employees ----------
  const employees: SpObject[] = []
  for (let i = 0; i < N.employees; i++) {
    const sub = rng.pick(dzo); const p = person(rng)
    const e = add('Employee', p.short, { tab_no: String(100000 + rng.int(1, 89999)), full_name: p.full, position: rng.pick(POSITIONS[D.key]), unit: rng.pick(UNITS[D.key]), clearance: rng.pick(['INTERNAL', 'INTERNAL', 'CONFIDENTIAL', 'CONFIDENTIAL+FIN', 'CONFIDENTIAL+PII+FIN']) }, { subsidiary: sub.id, sources: [sub === dzoA ? 'sap_hcm' : 'onec_zup'] })
    employees.push(e)
  }

  // ---------- Maintenance orders ----------
  const orders: SpObject[] = []
  const contractorsByEq = new Map<string, SpObject>()
  const orderKinds = ['ТО-1', 'ТО-2', 'Текущий ремонт', 'Капитальный ремонт', 'Диагностика', 'Внеплановый ремонт', 'Замена узла']
  const prios = ['Низкий', 'Средний', 'Средний', 'Высокий', 'Критический']
  const focusOrders: string[] = []
  const perEq = Math.max(1, Math.round(N.orders / equipment.length))
  const contractorPool = orgs.slice(0, 260)
  let orderNo = 4000
  for (const e of equipment) {
    let contractor = contractorsByEq.get(e.id)
    if (!contractor) { contractor = rng.chance(0.6) ? rng.pick(contractorPool) : undefined as unknown as SpObject; if (contractor) contractorsByEq.set(e.id, contractor) }
    const src = e.sources.includes('onec_toir') ? 'onec_toir' : 'sap_pm'
    const isFocus = e === focusEq
    const cnt = isFocus ? 14 : Math.max(1, Math.round(perEq * rng.float(0.4, 1.6)))
    for (let i = 0; i < cnt; i++) {
      const planned = NOW - rng.int(-20, 1100) * DAY
      let status = planned > NOW - 3 * DAY ? rng.pick(['открыта', 'в работе', 'согласование']) : rng.chance(0.93) ? 'закрыта' : rng.pick(['открыта', 'в работе', 'просрочена'])
      let kind = rng.pick(orderKinds)
      if (isFocus) { if (i < 3) { status = ['открыта', 'в работе', 'согласование'][i]; kind = ['Внеплановый ремонт', 'Диагностика', 'Замена узла'][i] } else status = 'закрыта' }
      const cost = Math.round(rng.float(40, 4800)) * 1000
      const num = isFocus && i === 0 ? '4412-17' : `${orderNo++}-${rng.int(1, 30)}`
      const o = add('MaintenanceOrder', `Заявка ${num}`, { number: num, kind, priority: isFocus && i < 3 ? ['Критический', 'Высокий', 'Средний'][i] : rng.pick(prios), status, planned: fmtD(planned), actual: status === 'закрыта' ? fmtD(planned + rng.int(0, 20) * DAY) : null, cost, source_system: src === 'sap_pm' ? 'SAP PM' : '1С:ТОиР' }, { id: isFocus && i === 0 ? 'mo_01J8SN0000000000000000441217' : undefined, created: planned - rng.int(2, 30) * DAY, subsidiary: e.subsidiary, sources: [src], version: rng.int(1, 12), materializedAt: NOW - rng.int(5, 280) * 1000, meta: isFocus ? { status: metaSrc(src === 'sap_pm' ? 'sap_pm.aufk.stat' : 'onec_toir.zayavki.status', 300), cost: metaSrc(src === 'sap_pm' ? 'sap_pm.aufk.cost' : 'onec_toir.zayavki.summa', 300) } : EMPTY_META })
      orders.push(o)
      link('maintains', o.id, e.id, { source: src })
      const performer = isFocus && i < 3 ? vektor : contractor
      if (performer) { link('performed_by', o.id, performer.id, { source: src }); const cs = orgContracts.get(performer.id); if (cs && cs.length && rng.chance(0.5)) link('under_contract', o.id, (isFocus ? focusContract : rng.pick(cs)).id, { source: src, markings: ['CONFIDENTIAL'] }) }
      else if (rng.chance(0.3)) link('performed_by', o.id, rng.pick(employees).id, { source: src })
      if (isFocus && i < 3) { focusOrders.push(o.id); link('under_contract', o.id, focusContract.id, { source: src, markings: ['CONFIDENTIAL'] }) }
    }
    if (orders.length >= N.orders) break
  }

  // ---------- Incidents ----------
  const incidents: SpObject[] = []
  const focusIncidents: string[] = []
  const focusEquipment = equipment.filter(e => linksTo.get(e.id)?.some(l => l.type === 'has_equipment' && l.from === focusAsset.id)).slice(0, 40)
  for (let i = 0; i < N.incidents; i++) {
    const atFocus = i < 6
    const host = atFocus ? (i < 2 ? focusAsset : rng.pick(focusEquipment)) : rng.pick(equipment)
    const ts = atFocus && i === 0 ? NOW - 6 * DAY : NOW - rng.int(1, 700) * DAY
    const inc = add('Incident', `Инцидент ${2026 - Math.floor((NOW - ts) / (365 * DAY))}-${rng.int(100, 999)}`, { class: atFocus && i === 0 ? D.incidentClasses[0] : rng.pick(D.incidentClasses), date: fmtDT(ts), status: ts > NOW - 30 * DAY ? rng.pick(['расследование', 'открыт']) : 'закрыт', consequences: rng.pick(['Без последствий', 'Остановка на 4 ч', 'Снижение производительности', D.key === 'energy' ? 'Отключение 1 200 потребителей, восстановлено' : 'Локальная утечка, устранена']), damage: rng.int(0, 2400) * 10000 }, { created: ts, subsidiary: host.subsidiary, sources: ['incident_log', 'sed'] })
    incidents.push(inc)
    if (atFocus) focusIncidents.push(inc.id)
    link('occurred_at', inc.id, host.id, { source: 'incident_log', markings: ['CONFIDENTIAL'] })
  }

  // ---------- Documents & mentions ----------
  const docs: SpObject[] = []
  const focusLetters: string[] = []
  function mkDoc(kind: string, title: string, date: number, opts: { attach?: SpObject; mentions?: SpObject[]; source?: string; ocr?: boolean; id?: string } = {}) {
    const ocr = opts.ocr ?? rng.chance(0.3)
    const d = add('Document', title, { kind, title, date: fmtD(date), source: opts.source ?? rng.pick(['СЭД Directum', 'СЭД Directum', 'Почта', 'Файловое хранилище']), pages: rng.int(1, 24), ocr, mentions_count: opts.mentions?.length ?? 0 }, { id: opts.id, created: date, sources: [opts.source === 'Почта' ? 'mail' : 'sed'], version: 1 })
    docs.push(d)
    if (opts.attach) link('attached_to', d.id, opts.attach.id, { source: 'sed' })
    for (const m of opts.mentions || []) {
      const conf = +rng.float(0.71, 0.99).toFixed(2)
      link('mentions', d.id, m.id, { source: 'nlp', confidence: conf })
      const men = add('Mention', `«${m.label}» в ${title}`, { span: `…${kind === 'Письмо' ? 'просим согласовать перенос сроков по' : 'работы выполнены силами'} ${m.label}…`, confidence: conf, model: 'natasha-ner v1.4' }, { created: date, sources: ['nlp'], version: 1 })
      link('mentions', men.id, m.id, { source: 'nlp', confidence: conf })
      link('attached_to', men.id, d.id, { source: 'nlp' })
    }
    return d
  }
  const focusDoc = mkDoc('Акт', 'Акт выполненных работ № 118 по заявке 4412-17', NOW - 2 * DAY, { attach: objects.get(focusOrders[0])!, mentions: [vektor, focusEq], source: 'СЭД Directum', ocr: true, id: 'doc_01J8SN0000000000000000ACT118' })
  for (let i = 0; i < 3; i++) focusLetters.push(mkDoc('Письмо', [`Письмо о переносе сроков ремонта ${focusCode}`, 'Письмо-претензия по договору ТОиР', 'Гарантийное письмо ООО «Вектор»'][i], NOW - (5 + i * 11) * DAY, { attach: focusContract, mentions: [vektor, ivanov], source: 'Почта' }).id)
  mkDoc('Протокол', `Протокол вскрытия конвертов, закупка ${focusCode}`, NOW - 60 * DAY, { attach: contracts[0], mentions: [vektor, strela] })
  while (docs.length < N.docs) {
    const kind = rng.pick(DOC_KINDS)
    const target = rng.chance(0.5) ? rng.pick(contracts) : rng.chance(0.5) ? rng.pick(orders) : rng.pick(incidents)
    const mentions: SpObject[] = rng.chance(0.6) ? [rng.pick(orgs)] : []
    if (rng.chance(0.3)) mentions.push(rng.pick(persons))
    mkDoc(kind, `${kind} № ${rng.int(1, 9999)} ${kind === 'Письмо' ? 'исх.' : ''}`, NOW - rng.int(1, 900) * DAY, { attach: target, mentions })
  }

  // ---------- Vehicles & shipments ----------
  const vehicles: SpObject[] = []
  for (let i = 0; i < N.vehicles; i++) {
    const p = rng.pick(pipelines); const t = rng.next(); const idx = Math.floor(t * (p.points.length - 1)); const a = p.points[idx], b = p.points[idx + 1]; const f = t * (p.points.length - 1) - idx
    const v = add('Vehicle', `${rng.pick(['А', 'В', 'Е', 'К', 'М', 'Н', 'О', 'Р', 'С', 'Т', 'У', 'Х'])}${rng.int(100, 999)}${rng.pick(['АВ', 'ЕК', 'МН', 'ОР', 'СТ'])} ${D.key === 'energy' ? '29' : '86'}`, { plate: '', kind: rng.pick(L.vehicleKinds), status: rng.pick(['в движении', 'в движении', 'стоянка', 'на объекте']) }, { geo: [a[0] + (b[0] - a[0]) * f + rng.float(-10, 10), a[1] + (b[1] - a[1]) * f + rng.float(-10, 10)], subsidiary: dzoB.id, sources: ['glonass'], materializedAt: NOW - rng.int(2, 28) * 1000 })
    v.props.plate = v.label; vehicles.push(v)
  }
  if (L.withShipments) {
    const lineObjs = byType.get(D.linearType) || []
    for (let i = 0; i < N.shipments; i++) {
      const s = add('Shipment', `Партия ${rng.int(10000, 99999)}`, { product: rng.pick(['нефть', 'ДТ', 'бензин АИ-92', 'мазут']), volume: rng.int(200, 6000), status: rng.pick(['в пути', 'отгружена', 'принята', 'план']) }, { subsidiary: dzoC.id, sources: ['sap_sd'] })
      link('transports', s.id, rng.chance(0.7) ? rng.pick(lineObjs).id : rng.pick(vehicles).id, { source: 'sap_sd' })
    }
  }

  // ---------- Purposes ----------
  const purposeDefs = [
    { key: 'situation_monitoring', name: 'Мониторинг ситуации на активах', basis: 'Приказ № 117 ФСТЭК; регламент СЦ-2026', cats: 'PROD, GEO', exp: '2027-03-31', owner: 'Руководитель СЦ', members: 42 },
    { key: 'procurement_check', name: 'Проверка закупок и контрагентов (procurement_check)', basis: '223-ФЗ ст. 3; положение о СЭБ', cats: 'FIN, PII, CONFIDENTIAL', exp: '2026-12-31', owner: 'Начальник СЭБ', members: 9 },
    { key: 'toir_planning', name: 'Планирование ТОиР', basis: 'Регламент ТОиР-04', cats: 'PROD, INTERNAL', exp: '2027-06-30', owner: 'Главный инженер', members: 118 },
    { key: 'finance_control', name: 'Финансовый контроль ДЗО', basis: 'Положение о бюджетировании', cats: 'FIN, CONFIDENTIAL', exp: '2026-12-31', owner: 'Финансовый директор', members: 14 },
    { key: 'incident_investigation_2026_Q3', name: 'Расследование инцидентов Q3 2026', basis: '187-ФЗ; приказ о расследовании № 88', cats: 'LEGAL, CONFIDENTIAL, PII', exp: '2026-10-15', owner: 'Директор по ПБ', members: 6 },
    { key: 'situation_wall', name: 'Видеостена СЦ (сервисная)', basis: 'Регламент СЦ-2026', cats: 'INTERNAL', exp: '2027-12-31', owner: 'Руководитель СЦ', members: 1 },
  ]
  const purposes: Record<string, string> = {}
  for (const p of purposeDefs) {
    const o = add('Purpose', p.name, { name: p.name, legal_basis: p.basis, categories: p.cats, expires_at: p.exp, owner: p.owner, members: p.members }, { id: `pur_${p.key}`, sources: ['pbac_registry'], version: 1, materializedAt: NOW })
    purposes[p.key] = o.id
    for (let i = 0; i < Math.min(p.members, 6); i++) link('accessed_under', rng.pick(employees).id, o.id, { source: 'pbac_registry' })
  }

  // ---------- Events (ticker) ----------
  const evTemplates: [EventItem['kind'], () => string, () => string | undefined][] = [
    ['order', () => { const o = rng.pick(orders); return `Заявка ${o.props.number} обновлена: ${o.props.status}` }, () => undefined],
    ['anomaly', () => { const a = rng.pick(anomalies); return `${a.label}: score ${a.props.score}` }, () => undefined],
    ['freshness', () => `Свежесть ${rng.pick(['Sensor', D.distType, D.unitType, 'MaintenanceOrder'])} в SLO`, () => undefined],
    ['er', () => `ER: слияние ${rng.pick(orgs).label} по ИНН`, () => undefined],
    ['action', () => `Действие change_order_priority выполнено (toir_eng)`, () => undefined],
    ['policy', () => 'PDP: политика abac_fin_v12 перезагружена', () => undefined],
    ['info', () => `Materializer: ${rng.int(120, 900)} объектов/с, лаг ${rng.int(2, 9)} с`, () => undefined],
  ]
  for (let i = 0; i < 120; i++) { const t = rng.pick(evTemplates); events.push({ id: `ev_${i}`, ts: NOW - rng.int(30, 7200) * 1000, kind: t[0], text: t[1](), objectId: undefined }) }
  events.push({ id: 'ev_focus', ts: NOW - 31 * 1000, kind: 'anomaly', text: `${focusAnomaly.label} · score 0.87 · датчик ${focusSensor.label}`, objectId: focusAsset.id })
  events.push({ id: 'ev_4412', ts: NOW - 62 * 1000, kind: 'order', text: 'Заявка 4412-17 обновлена: в работе (1С:ТОиР)', objectId: focusOrders[0] })
  events.push({ id: 'ev_inc', ts: NOW - 6 * DAY, kind: 'incident', text: `Открыт инцидент на ${focusCode}: ${D.incidentClasses[0].toLowerCase()}`, objectId: focusIncidents[0] })
  events.sort((a, b) => b.ts - a.ts)

  const stats: Record<string, number> = {}
  for (const [t, arr] of byType) stats[t] = arr.length
  stats.links = links.length
  stats.genMs = Math.round(performance.now() - t0)

  const focusSensorIds: Record<string, string> = {}
  for (const [k, s] of Object.entries(focusSensors)) focusSensorIds[k] = s.id
  return {
    domain: D, basemap, home, objects, byType, links, linksFrom, linksTo, pipelines, events, stats, scale,
    named: {
      holding: holding.id, dzo: dzo.map(d => d.id), focusAsset: focusAsset.id, secondAsset: L.secondAsset.id, focusEquipment: focusEq.id, focusSensor: focusSensor.id, focusSensors: focusSensorIds,
      focusAnomaly: focusAnomaly.id, focusOrg: vektor.id, focusOrg2: strela.id, focusPerson: ivanov.id, sharedProcs, cartelProcs, focusDoc: focusDoc.id, focusLetters, focusIncidents, focusOrders, focusContract: focusContract.id, purposes,
    },
  }
}
void (null as unknown as Marking)

function fmtD(ts: number) { const d = new Date(ts); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
function fmtDT(ts: number) { return new Date(ts).toISOString().slice(0, 16).replace('T', ' ') }

/** Base level, daily amplitude and anomaly ramp per sensor kind (both domain packs). */
const TELE: Record<string, [number, number, number]> = {
  'давление': [4.6, 0.35, 2.3], 'вибрация': [2.4, 0.5, 2.9], 'температура': [58, 6, 14],
  'температура масла': [62, 4, 22], 'ток': [520, 40, 260], 'напряжение': [226, 2, -7],
}
const SPIKE_KINDS = new Set(['вибрация', 'ток'])

/** Deterministic telemetry series for a sensor over [from, to] with step (ms). Anomaly injected for the focus equipment sensors. */
export function telemetry(sensorTag: string, kind: string, from: number, to: number, step: number, opts: { anomaly?: boolean } = {}): { t: number; v: number }[] {
  const [base, amp, ramp] = TELE[kind] || TELE['температура']
  const h = hash32(sensorTag)
  const out: { t: number; v: number }[] = []
  const anomalyStart = to - 15 * MIN
  for (let t = from; t <= to; t += step) {
    const x = t / HOUR
    const r = new Rng(h ^ Math.floor(t / step))
    let v = base + amp * Math.sin(x / 3.8 + h % 7) + amp * 0.4 * Math.sin(x / 0.7 + (h % 13)) + r.gauss(0, amp * 0.12)
    if (opts.anomaly && t > anomalyStart) { const k = (t - anomalyStart) / (15 * MIN); v += ramp * Math.pow(k, 1.6) }
    if (opts.anomaly && t > to - 6 * HOUR && t < to - 5.2 * HOUR && SPIKE_KINDS.has(kind)) v += amp * 2.8
    out.push({ t, v: +v.toFixed(3) })
  }
  return out
}
