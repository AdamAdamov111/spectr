// Synthetic holding generator — in-browser twin of demo/generator (spec 7.6).
// Deterministic: same seed → same world for every viewer. All data carries marking SYNTHETIC.

import { Rng, makeId, makeInn, makeInn12, makeOgrn, hash32, DAY, HOUR, MIN } from './rng'
import type { SpObject, SpLink, EventItem, HistoryEntry, PropMeta } from './types'
import type { ObjectType, LinkType, Marking } from './ontology'
import { TYPES } from './ontology'

export const SIM_EPOCH = Date.UTC(2026, 8, 14, 11, 2, 11) // 14.09.2026 14:02:11 MSK
const LOAD_TIME = Date.now()
const EMPTY_META: Record<string, PropMeta> = {}
export const simNow = () => SIM_EPOCH + (Date.now() - LOAD_TIME)

export interface PipelineGeom { id: string; points: [number, number][]; flow: number; pressure: number; code: string }
export interface Named {
  holding: string; dobycha: string; transport: string; pererabotka: string
  nps1: string; nps2: string; pump104: string; sensorP104: string; sensorV104: string; sensorT104: string
  anomalyNps2: string; vektor: string; strela: string; ivanov: string; sharedProcs: string[]; cartelProcs: string[]
  lastAct: string; vektorLetters: string[]; incidentNps2: string[]; openOrders104: string[]; contractVektor: string
  purposes: Record<string, string>
}

export interface World {
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
const REGIONS = ['ХМАО — Югра', 'ЯНАО', 'Тюменская область', 'Томская область', 'Москва', 'Санкт-Петербург', 'Татарстан', 'Башкортостан', 'Пермский край', 'Самарская область', 'Омская область', 'Красноярский край']
const CITIES: Record<string, string[]> = { 'ХМАО — Югра': ['Сургут', 'Нижневартовск', 'Ханты-Мансийск', 'Нефтеюганск'], 'ЯНАО': ['Новый Уренгой', 'Ноябрьск', 'Салехард'], 'Тюменская область': ['Тюмень', 'Тобольск'], 'Томская область': ['Томск', 'Стрежевой'], 'Москва': ['Москва'], 'Санкт-Петербург': ['Санкт-Петербург'], 'Татарстан': ['Казань', 'Альметьевск'], 'Башкортостан': ['Уфа', 'Салават'], 'Пермский край': ['Пермь', 'Березники'], 'Самарская область': ['Самара', 'Новокуйбышевск'], 'Омская область': ['Омск'], 'Красноярский край': ['Красноярск'] }
const STREETS = ['Ленина', 'Мира', 'Нефтяников', 'Промышленная', 'Индустриальная', 'Энергетиков', 'Республики', 'Геологов', 'Строителей', 'Магистральная', 'Северная', 'Заводская']
const LAST = ['Иванов', 'Петров', 'Сидоров', 'Кузнецов', 'Смирнов', 'Попов', 'Волков', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Фёдоров', 'Михайлов', 'Егоров', 'Орлов', 'Макаров', 'Захаров', 'Гусев', 'Титов', 'Беляев', 'Тарасов', 'Жуков', 'Фролов', 'Комаров', 'Шестаков', 'Мельников', 'Абдуллин', 'Хасанов', 'Галиев', 'Сафин', 'Ахметов', 'Нургалиев', 'Шевченко', 'Ковалёв', 'Бондарь', 'Дорофеев', 'Кириллов', 'Медведев', 'Панов', 'Рябов', 'Селезнёв', 'Ушаков', 'Чернов', 'Яковлев']
const FIRST_M = ['Иван', 'Пётр', 'Сергей', 'Андрей', 'Алексей', 'Дмитрий', 'Николай', 'Михаил', 'Владимир', 'Олег', 'Артём', 'Руслан', 'Тимур', 'Рустам', 'Марат', 'Евгений', 'Константин', 'Павел', 'Роман', 'Юрий']
const FIRST_F = ['Анна', 'Елена', 'Ольга', 'Мария', 'Татьяна', 'Наталья', 'Ирина', 'Светлана', 'Юлия', 'Екатерина', 'Гульнара', 'Алия', 'Дарья', 'Ксения']
const PATR_M = ['Иванович', 'Петрович', 'Сергеевич', 'Андреевич', 'Алексеевич', 'Дмитриевич', 'Николаевич', 'Михайлович', 'Владимирович', 'Олегович', 'Рустамович', 'Маратович', 'Юрьевич']
const PATR_F = ['Ивановна', 'Петровна', 'Сергеевна', 'Андреевна', 'Алексеевна', 'Дмитриевна', 'Николаевна', 'Михайловна', 'Владимировна', 'Рустамовна']
const EQ_CLASSES = [
  ['PUMP', 'Насос', 0.13], ['VALVE', 'Задвижка', 0.2], ['COMPRESSOR', 'Компрессор', 0.05], ['TANK', 'Ёмкость', 0.06], ['MOTOR', 'Электродвигатель', 0.1],
  ['HEAT_EXCHANGER', 'Теплообменник', 0.05], ['FILTER', 'Фильтр', 0.08], ['SEPARATOR', 'Сепаратор', 0.05], ['METER', 'Расходомер', 0.08], ['DRIVE', 'Привод', 0.08], ['TRANSFORMER', 'Трансформатор', 0.04], ['OTHER', 'Прочее', 0.08],
] as const
const CONTRACT_SUBJECTS = ['ТОиР насосного оборудования', 'Поставка запорной арматуры', 'Внутритрубная диагностика', 'Строительно-монтажные работы', 'Транспортные услуги', 'Капитальный ремонт скважин', 'Поставка КИПиА', 'Сервис компрессорного оборудования', 'Ремонт резервуаров', 'Изоляционные работы', 'Электромонтажные работы', 'Геофизические исследования', 'Поставка труб', 'Экспертиза промышленной безопасности', 'Аренда спецтехники', 'Охрана объектов', 'Услуги по обращению с отходами', 'Проектно-изыскательские работы']
const DOC_KINDS = ['Акт', 'Договор', 'Письмо', 'Протокол', 'Счёт', 'Отчёт', 'Дефектная ведомость', 'Наряд-допуск']
const INC_CLASSES = ['Отклонение параметров', 'Отказ оборудования', 'Утечка', 'Нарушение режима', 'Возгорание', 'Остановка']
const POSITIONS = ['Инженер ТОиР', 'Мастер участка', 'Оператор НПС', 'Диспетчер', 'Геолог', 'Механик', 'Электромонтёр', 'Начальник цеха', 'Специалист по закупкам', 'Аналитик СЭБ', 'Инженер АСУ ТП', 'Экономист', 'Юрист', 'Специалист по ИБ', 'Начальник смены']
const UNITS = ['ЦДНГ-1', 'ЦДНГ-2', 'ЦППН', 'НПС-1', 'НПС-2', 'РВС-парк', 'ОТиПБ', 'Служба ТОиР', 'Отдел закупок', 'СЭБ', 'ИТ-отдел', 'Диспетчерская', 'ПТО', 'Финансовый отдел']

export function generateWorld(seed = 2026, scale = 1): World {
  const t0 = performance.now()
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
    wells: Math.round(120 * scale), equipment: Math.round(4000 * scale), orgs: Math.round(900 * scale), persons: Math.round(2500 * scale),
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

  // ---------- Holding & subsidiaries ----------
  const holding = add('Holding', 'Северная нефть', { name: 'ПАО «Северная нефть»', inn: makeInn(rng), subsidiaries: 3 }, { id: 'hld_01J8SN0000000000000000000A', version: 3, sources: ['manual', 'egrul'] })
  const dzoDefs = [
    { key: 'dobycha', name: 'СН-Добыча', kind: 'добыча', erp: 'SAP ECC 6.0', region: 'ХМАО — Югра', emp: 4200 },
    { key: 'transport', name: 'СН-Транспорт', kind: 'транспорт', erp: '1С:ERP + 1С:ТОиР', region: 'ХМАО — Югра', emp: 2100 },
    { key: 'pererabotka', name: 'СН-Переработка', kind: 'переработка', erp: '1С:ERP', region: 'Тюменская область', emp: 3300 },
  ]
  const dzo: Record<string, SpObject> = {}
  for (const d of dzoDefs) {
    const o = add('Subsidiary', d.name, { name: `АО «${d.name}»`, inn: makeInn(rng), region: d.region, kind: d.kind, erp: d.erp, employees: d.emp }, { id: `dzo_01J8SN00000000000000${d.key.toUpperCase().slice(0, 6).padEnd(6, '0')}`, version: 5, sources: ['egrul', 'it_landscape'], meta: { erp: metaSrc('it_landscape.systems.erp', 86400), inn: metaSrc('egrul.ul.inn', 86400) } })
    dzo[d.key] = o
    link('owns', holding.id, o.id, { source: 'egrul', props: { share: 100 } })
  }

  // ---------- Fields, pads, wells ----------
  const fieldDefs = [
    { code: 'ЮГ-1', name: 'Южно-Пуровское', geo: [150, 130] as [number, number], reserves: 48200 },
    { code: 'СВ-2', name: 'Северо-Варьёганское', geo: [310, 80] as [number, number], reserves: 31900 },
    { code: 'ТГ-3', name: 'Тагульское', geo: [430, 170] as [number, number], reserves: 27400 },
    { code: 'ЛН-4', name: 'Ленское', geo: [220, 280] as [number, number], reserves: 19800 },
  ]
  const fields: SpObject[] = []
  const pads: SpObject[] = []
  const wells: SpObject[] = []
  let wellNo = 1
  const declining = new Set<number>()
  while (declining.size < Math.max(1, Math.round(8 * scale))) declining.add(rng.int(0, N.wells - 1))
  for (const f of fieldDefs) {
    const fo = add('Field', f.name, { code: f.code, name: `${f.name} месторождение`, license: `ХМН ${rng.int(10000, 19999)} НЭ`, reserves_abc1: f.reserves, operator: 'АО «СН-Добыча»' }, { geo: f.geo, subsidiary: dzo.dobycha.id, sources: ['rosnedra', 'manual'], version: 2, meta: { reserves_abc1: metaSrc('rosnedra.balance.abc1', 86400 * 30) } })
    fields.push(fo)
    link('operates', dzo.dobycha.id, fo.id, { source: 'manual' })
    const padCount = 5
    for (let p = 0; p < padCount; p++) {
      const ang = (p / padCount) * Math.PI * 2 + rng.float(-0.3, 0.3); const r = rng.float(28, 52)
      const geo: [number, number] = [f.geo[0] + Math.cos(ang) * r, f.geo[1] + Math.sin(ang) * r * 0.7]
      const wellsHere = Math.max(1, Math.round(N.wells / (fieldDefs.length * padCount)))
      const pad = add('WellPad', `Куст ${f.code}-${p + 1}`, { code: `${f.code}-К${p + 1}`, wells: wellsHere, coords: `${(61 + geo[1] / 900).toFixed(4)}, ${(73 + geo[0] / 400).toFixed(4)}` }, { geo, subsidiary: dzo.dobycha.id, sources: ['manual'] })
      pads.push(pad)
      link('located_on', pad.id, fo.id, { source: 'manual', markings: ['GEO'] })
      for (let w = 0; w < wellsHere && wells.length < N.wells; w++) {
        const idx = wells.length
        const wang = rng.float(0, Math.PI * 2); const wr = rng.float(6, 16)
        const wgeo: [number, number] = [geo[0] + Math.cos(wang) * wr, geo[1] + Math.sin(wang) * wr * 0.7]
        const kind = rng.chance(0.8) ? 'добывающая' : 'нагнетательная'
        const status = rng.chance(0.86) ? 'в работе' : rng.chance(0.5) ? 'в ремонте' : 'в бездействии'
        const base = rng.float(18, 140)
        const decl = declining.has(idx)
        const debit = kind === 'добывающая' && status === 'в работе' ? +(base * (decl ? 0.62 : 1)).toFixed(1) : 0
        const wo = add('Well', `Скв. ${wellNo}`, { number: String(wellNo), kind, status, debit, water_cut: +rng.float(12, 78).toFixed(1), commissioned: fmtD(NOW - rng.int(400, 9000) * DAY), trend_30d: decl ? +rng.float(-31, -18).toFixed(1) : +rng.float(-3, 2.5).toFixed(1) }, { geo: wgeo, subsidiary: dzo.dobycha.id, sources: ['prod_registry', 'measurements', 'sap_pm'], meta: { debit: metaSrc('measurements.daily.debit', 900), status: metaSrc('prod_registry.wells.status', 3600) } })
        wellNo++
        wells.push(wo)
        link('located_on', wo.id, pad.id, { source: 'manual', markings: ['GEO'] })
      }
    }
  }

  // ---------- Pump stations, tanks, pipelines ----------
  const nps1 = add('PumpStation', 'НПС-1', { code: 'НПС-1', capacity: 4200, mode: 'номинальный', pressure_in: 2.31, pressure_out: 5.84, pressure_anomaly_score: 0.06, open_incidents: 0 }, { id: 'nps_01J8SN000000000000000NPS01', geo: [540, 300], subsidiary: dzo.transport.id, sources: ['scada', 'sap_pm'], version: 812, materializedAt: NOW - 4000, meta: { pressure_in: metaSrc('scada.nps1.p_in', 6), pressure_out: metaSrc('scada.nps1.p_out', 6), mode: metaSrc('scada.nps1.mode', 6), pressure_anomaly_score: { derived_by: 'pipelines.anomaly_v3@3.2.1', sourceTs: NOW - 40000 } } })
  const nps2 = add('PumpStation', 'НПС-2', { code: 'НПС-2', capacity: 3800, mode: 'повышенное давление', pressure_in: 2.74, pressure_out: 6.92, pressure_anomaly_score: 0.87, open_incidents: 2 }, { id: 'nps_01J8SN000000000000000NPS02', geo: [700, 385], subsidiary: dzo.transport.id, sources: ['scada', 'sap_pm'], version: 1204, materializedAt: NOW - 3000, meta: { pressure_in: metaSrc('scada.nps2.p_in', 5), pressure_out: metaSrc('scada.nps2.p_out', 5), mode: metaSrc('scada.nps2.mode', 5), pressure_anomaly_score: { derived_by: 'pipelines.anomaly_v3@3.2.1', sourceTs: NOW - 52000, rawRid: 'raw_scada_telemetry:88412' } } })
  link('operates', dzo.transport.id, nps1.id, { source: 'manual' }); link('operates', dzo.transport.id, nps2.id, { source: 'manual' })
  const tanks: SpObject[] = []
  const farm: [number, number] = [870, 480]
  for (let i = 0; i < 18; i++) {
    const col = i % 6, row = Math.floor(i / 6)
    const geo: [number, number] = [farm[0] - 45 + col * 18, farm[1] - 20 + row * 20]
    const t = add('Tank', `РВС-${20000 + (i + 1) * 100}`, { code: `РВС-${i + 1}`, volume: rng.pick([10000, 20000, 30000, 50000]), level: +rng.float(22, 88).toFixed(1), product: rng.pick(['нефть', 'нефть', 'ДТ', 'бензин АИ-92', 'мазут']), temperature: +rng.float(8, 24).toFixed(1) }, { geo, subsidiary: dzo.pererabotka.id, sources: ['scada', 'lims'], version: rng.int(200, 900), materializedAt: NOW - rng.int(2, 50) * 1000, meta: { level: metaSrc('scada.tank.level', 30), temperature: metaSrc('scada.tank.temp', 30) } })
    tanks.push(t)
    link('operates', dzo.pererabotka.id, t.id, { source: 'manual' })
  }
  const pipeDefs: { code: string; points: [number, number][]; from: string; to: string; flow: number; pressure: number; diameter: number }[] = [
    { code: 'МН-1 «ЮГ-1 — ЛН-4 — НПС-1»', points: [[150, 130], [200, 210], [220, 280], [380, 300], [540, 300]], from: fields[0].id, to: nps1.id, flow: 1480, pressure: 5.1, diameter: 720 },
    { code: 'МН-2 «СВ-2 — ТГ-3 — НПС-1»', points: [[310, 80], [380, 120], [430, 170], [500, 250], [540, 300]], from: fields[1].id, to: nps1.id, flow: 1210, pressure: 4.8, diameter: 530 },
    { code: 'МН-3 «НПС-1 — НПС-2»', points: [[540, 300], [610, 330], [660, 370], [700, 385]], from: nps1.id, to: nps2.id, flow: 2690, pressure: 5.9, diameter: 1020 },
    { code: 'МН-4 «НПС-2 — РВС-парк»', points: [[700, 385], [760, 420], [820, 460], [870, 480]], from: nps2.id, to: tanks[0].id, flow: 2600, pressure: 6.9, diameter: 1020 },
    { code: 'ПН-5 «ТГ-3 — НПС-2» (промысловый)', points: [[430, 170], [520, 200], [620, 280], [700, 385]], from: fields[2].id, to: nps2.id, flow: 420, pressure: 3.6, diameter: 325 },
  ]
  const pipeObjs: SpObject[] = []
  const segments: SpObject[] = []
  for (const p of pipeDefs) {
    let len = 0
    for (let i = 1; i < p.points.length; i++) len += Math.hypot(p.points[i][0] - p.points[i - 1][0], p.points[i][1] - p.points[i - 1][1])
    const km = +(len * 0.42).toFixed(1)
    const po = add('Pipeline', p.code.split(' ')[0], { code: p.code, diameter: p.diameter, length: km, design_pressure: 7.5, flow: p.flow, commissioned: rng.int(1988, 2016) }, { geo: p.points[Math.floor(p.points.length / 2)], subsidiary: dzo.transport.id, sources: ['opo_registry', 'sap_pm'], meta: { flow: metaSrc('scada.pipe.flow', 20) } })
    pipeObjs.push(po)
    pipelines.push({ id: po.id, points: p.points, flow: p.flow, pressure: p.pressure, code: p.code })
    link('operates', dzo.transport.id, po.id, { source: 'manual' })
    link('connects', po.id, p.from, { source: 'opo_registry', markings: ['GEO'] }); link('connects', po.id, p.to, { source: 'opo_registry', markings: ['GEO'] })
    const segCount = Math.max(4, Math.round(km / 15))
    for (let s = 0; s < segCount; s++) {
      const so = add('PipelineSegment', `${po.label} км ${Math.round(s * km / segCount)}–${Math.round((s + 1) * km / segCount)}`, { km_from: +(s * km / segCount).toFixed(1), km_to: +((s + 1) * km / segCount).toFixed(1), category: rng.pick(['I', 'II', 'III', 'B']), defects: rng.chance(0.3) ? rng.int(1, 14) : 0 }, { subsidiary: dzo.transport.id, sources: ['vtd', 'sap_pm'] })
      segments.push(so)
      link('located_on', so.id, po.id, { source: 'opo_registry', markings: ['GEO'] })
    }
  }

  // ---------- Equipment ----------
  const equipment: SpObject[] = []
  const eqCounter: Record<string, number> = {}
  const eqHost: { host: SpObject; count: number; sub: string; src: string }[] = []
  const perWell = Math.round(N.equipment * 0.3 / Math.max(1, wells.length))
  for (const w of wells) eqHost.push({ host: w, count: perWell, sub: dzo.dobycha.id, src: 'sap_pm' })
  eqHost.push({ host: nps1, count: Math.round(N.equipment * 0.11), sub: dzo.transport.id, src: 'onec_toir' })
  eqHost.push({ host: nps2, count: Math.round(N.equipment * 0.11), sub: dzo.transport.id, src: 'onec_toir' })
  for (const t of tanks) eqHost.push({ host: t, count: Math.round(N.equipment * 0.2 / tanks.length), sub: dzo.pererabotka.id, src: 'onec_toir' })
  for (const s of segments) eqHost.push({ host: s, count: Math.round(N.equipment * 0.28 / segments.length), sub: dzo.transport.id, src: 'onec_toir' })
  function pickClass(r: Rng) { let x = r.next(); for (const c of EQ_CLASSES) { x -= c[2]; if (x <= 0) return c } return EQ_CLASSES[EQ_CLASSES.length - 1] }
  function mkEquipment(host: SpObject, sub: string, src: string, forced?: { cls: typeof EQ_CLASSES[number]; name: string; inv: string; health: number; id: string; hours: number }) {
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
  let pump104: SpObject | null = null
  for (const h of eqHost) {
    for (let i = 0; i < h.count; i++) {
      if (h.host === nps2 && i === 3 && !pump104) {
        pump104 = mkEquipment(nps2, h.sub, h.src, { cls: EQ_CLASSES[0], name: 'Насос-104', inv: '10004412', health: 0.41, id: 'eq_01J8ZK3V9Q7R6X4M2N1P0S8T7A', hours: 61240 })
      } else mkEquipment(h.host, h.sub, h.src)
    }
  }
  if (!pump104) pump104 = mkEquipment(nps2, dzo.transport.id, 'onec_toir', { cls: EQ_CLASSES[0], name: 'Насос-104', inv: '10004412', health: 0.41, id: 'eq_01J8ZK3V9Q7R6X4M2N1P0S8T7A', hours: 61240 })
  pump104.markings = ['CONFIDENTIAL', 'PROD', 'SYNTHETIC']
  pump104.sources = ['sap_pm', 'onec_toir', 'passports']
  pump104.crosswalk = [{ system: 'sap_pm', key: '10004412', score: 1, rule: 'inventory_no exact' }, { system: 'onec_toir', key: 'ОБ-004412 «Насос магистральный НМ-104»', score: 0.97, rule: 'inventory_no + функциональное место НПС-2/НАС' }, { system: 'passports', key: 'Паспорт НМ 7000-210 № 4412', score: 0.91, rule: 'серийный номер' }]
  pump104.meta.inventory_no = { source: 'sap_pm.equi.equnr', sourceTs: NOW - 640 * 1000, rawRid: 'raw_sap_equi:4412' }
  pump104.materializedAt = NOW - 700 * 1000
  pump104.history = [
    { version: 37, ts: NOW - 700 * 1000, cause: 'materialize_equipment@build 9f3c', causeKind: 'pipeline', diff: [{ prop: 'health_index', before: 0.47, after: 0.41 }, { prop: 'operating_hours', before: 61226, after: 61240 }] },
    { version: 36, ts: NOW - 2 * HOUR, cause: 'materialize_equipment@build 9f3c', causeKind: 'pipeline', diff: [{ prop: 'health_index', before: 0.52, after: 0.47 }] },
    { version: 35, ts: NOW - 1 * DAY, cause: 'change_order_priority', causeKind: 'action', actor: 'toir_eng', diff: [{ prop: 'criticality', before: 'средняя', after: 'высокая' }] },
    { version: 34, ts: NOW - 3 * DAY, cause: 'er_equipment@build 7c1a', causeKind: 'er', diff: [{ prop: 'inventory_no', before: 'ОБ-004412', after: '10004412' }] },
    { version: 33, ts: NOW - 9 * DAY, cause: 'materialize_equipment@build 8b2e', causeKind: 'pipeline', diff: [{ prop: 'health_index', before: 0.58, after: 0.52 }] },
  ]

  // ---------- Sensors ----------
  const sensors: SpObject[] = []
  const sensorKinds = [['P', 'давление', 'МПа', 2, 7], ['V', 'вибрация', 'мм/с', 0.5, 6], ['T', 'температура', '°C', 20, 95]] as const
  const withSensors = [pump104, ...equipment.filter(e => e !== pump104 && ['PUMP', 'COMPRESSOR', 'MOTOR'].includes(e.props.equipment_class as string))]
  let sensorNo = 0
  const named104: Record<string, SpObject> = {}
  for (const e of withSensors) {
    if (sensors.length >= Math.round(1200 * scale) && e !== pump104) break
    const tagNo = e === pump104 ? 104 : 200 + sensorNo
    for (const k of sensorKinds) {
      const bad = rng.chance(0.02)
      const s = add('Sensor', `${k[0]}-${tagNo}`, { tag: `${k[0]}-${tagNo}`, kind: k[1], unit: k[2], last_value: +rng.float(k[3], k[4]).toFixed(2), quality: bad ? 'bad' : 'good' }, { subsidiary: e.subsidiary, geo: e.geo, sources: ['opcua', 'historian'], version: rng.int(1000, 90000), materializedAt: NOW - rng.int(1, 5) * 1000, meta: { last_value: metaSrc('opcua.node.value', 5) } })
      if (e === pump104) { named104[k[0]] = s; if (k[0] === 'P') s.props.last_value = 6.92 }
      sensors.push(s)
      link('measured_by', e.id, s.id, { source: 'scada' })
    }
    sensorNo++
  }

  // ---------- Anomalies ----------
  const anomalies: SpObject[] = []
  const anomalyNps2 = add('Anomaly', 'Рост давления НПС-2', { kind: 'pressure_rise', score: 0.87, window_from: fmtDT(NOW - 15 * MIN), window_to: fmtDT(NOW - 2 * MIN), model: 'anomaly_v3 (isolation forest + CUSUM)' }, { id: 'an_01J8SN000000000000000AN0002', created: NOW - 14 * MIN, version: 1, materializedAt: NOW - 90 * 1000, subsidiary: dzo.transport.id, sources: ['pipelines.anomaly_v3'], meta: { score: { derived_by: 'pipelines.anomaly_v3@3.2.1', rawRid: 'raw_scada_telemetry:88412' } } })
  anomalies.push(anomalyNps2)
  link('detected_on', anomalyNps2.id, named104.P.id, { source: 'pipelines.anomaly_v3' }); link('detected_on', anomalyNps2.id, pump104.id, { source: 'pipelines.anomaly_v3' }); link('detected_on', anomalyNps2.id, nps2.id, { source: 'pipelines.anomaly_v3' })
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
  // named scenario chain: Иванов И.И. founds Вектор and Стрела
  const ivanov = mkPerson(rng, 'учредитель, директор', { full: 'Иванов Игорь Иванович', short: 'Иванов И.И.' })
  ivanov.props.orgs_count = 2
  const vektor = mkOrg(rng, { name: 'ООО «Вектор»', region: 'ХМАО — Югра', address: 'ХМАО — Югра, г. Сургут, ул. Нефтяников, д. 14, оф. 207', phone: '+7 3462 55-01-14', risk: 0.71, id: 'org_01J8SN00000000000000VEKTOR', sources: ['sap_mm', 'onec', 'egrul'], registered: NOW - 2140 * DAY })
  const strela = mkOrg(rng, { name: 'ООО «Стрела»', region: 'ХМАО — Югра', address: 'ХМАО — Югра, г. Сургут, ул. Нефтяников, д. 14, оф. 207', phone: '+7 3462 55-01-14', risk: 0.68, id: 'org_01J8SN00000000000000STRELA', sources: ['sap_mm', 'egrul'], registered: NOW - 1380 * DAY })
  vektor.crosswalk = [
    { system: 'sap_mm', key: 'LIFNR 0000418823', score: 1, rule: 'ИНН exact' }, { system: 'onec', key: 'К-00017714 «Вектор ООО»', score: 1, rule: 'ИНН exact' },
    { system: 'egrul', key: vektor.props.inn as string, score: 1, rule: 'первичный источник' }, { system: 'mail', key: '3 письма (mention)', score: 0.94, rule: 'Jaro-Winkler 0.96 + регион' },
  ]
  vektor.history = [
    { version: 41, ts: NOW - 55 * MIN, cause: 'materialize_organization@build 5d21', causeKind: 'pipeline', diff: [{ prop: 'risk_score', before: 0.64, after: 0.71 }] },
    { version: 40, ts: NOW - 3 * DAY, cause: 'er_organization@build 4a90 (merge)', causeKind: 'er', diff: [{ prop: 'sources', before: 'sap_mm, egrul', after: 'sap_mm, onec, egrul' }, { prop: 'phone', before: null, after: '+7 3462 55-01-14' }] },
    { version: 39, ts: NOW - 12 * DAY, cause: 'materialize_organization@build 4a11', causeKind: 'pipeline', diff: [{ prop: 'status', before: 'действующая', after: 'действующая' }, { prop: 'address', before: 'г. Сургут, ул. Мира, д. 3', after: 'г. Сургут, ул. Нефтяников, д. 14, оф. 207' }] },
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
  const shells: SpObject[] = []
  for (let i = 0; i < 15; i++) { const o = mkOrg(rng, { shell: true, risk: +rng.float(0.7, 0.95).toFixed(2), address: 'Москва, г. Москва, ул. Промышленная, д. 11, стр. 2' }); shells.push(o); const d = mkPerson(rng, 'директор (массовый)'); d.props.orgs_count = rng.int(6, 22); link('director_of', d.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'] }) }
  while (orgs.length < N.orgs) { const o = mkOrg(rng, {}); if (rng.chance(0.7)) { const f = mkPerson(rng, 'учредитель'); link('founder_of', f.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'], props: { share: 100 } }); if (rng.chance(0.6)) link('director_of', f.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'] }); else { const d = mkPerson(rng, 'директор'); link('director_of', d.id, o.id, { source: 'egrul', markings: ['CONFIDENTIAL'] }) } } }
  while (persons.length < N.persons) { const p = mkPerson(rng, rng.pick(['учредитель', 'директор', 'бенефициар', 'представитель'])); const o = rng.pick(orgs); link(rng.chance(0.6) ? 'founder_of' : 'director_of', p.id, o.id, { source: rng.chance(0.85) ? 'egrul' : 'nlp', confidence: rng.chance(0.85) ? 1 : +rng.float(0.6, 0.9).toFixed(2), markings: ['CONFIDENTIAL'] }) }

  // ---------- Contracts, procurements, bids ----------
  const contracts: SpObject[] = []
  const dzoList = [dzo.dobycha, dzo.transport, dzo.pererabotka]
  const orgContracts = new Map<string, SpObject[]>()
  function mkContract(org: SpObject, sub: SpObject, opts: { subject?: string; amount?: number; status?: string; id?: string; signed?: number; overdue?: number } = {}) {
    const signed = opts.signed ?? NOW - rng.int(30, 1400) * DAY
    const amount = opts.amount ?? Math.round(Math.exp(rng.gauss(16.5, 1.1)) / 1000) * 1000
    const status = opts.status ?? (rng.chance(0.55) ? 'исполняется' : rng.chance(0.85) ? 'закрыт' : 'просрочен')
    const overdue = opts.overdue ?? (status === 'просрочен' ? rng.int(5, 120) : 0)
    const c = add('Contract', `Договор ${rng.int(1000, 9999)}/${new Date(signed).getFullYear() % 100}-${rng.pick(['ТР', 'ДБ', 'ПР'])}`, { number: '', subject: opts.subject ?? rng.pick(CONTRACT_SUBJECTS), amount, signed: fmtD(signed), valid_to: fmtD(signed + rng.int(180, 900) * DAY), status, execution: status === 'закрыт' ? 100 : rng.int(5, 95), overdue_days: overdue }, { id: opts.id, created: signed, subsidiary: sub.id, sources: rng.chance(0.6) ? ['sap_mm', 'sed'] : ['onec', 'sed'], meta: { amount: metaSrc('sap_mm.ekko.netwr', 900), status: metaSrc('sap_mm.ekko.status', 900), execution: { derived_by: 'functions.contract_execution_status@1.2.0' } } })
    c.props.number = c.label.replace('Договор ', '')
    contracts.push(c)
    link('party_to', org.id, c.id, { source: 'sap_mm', markings: ['CONFIDENTIAL'], props: { role: 'исполнитель' } })
    link('party_to', sub.id, c.id, { source: 'sap_mm', markings: ['CONFIDENTIAL'], props: { role: 'заказчик' } })
    let a = orgContracts.get(org.id); if (!a) { a = []; orgContracts.set(org.id, a) } a.push(c)
    return c
  }
  const contractVektor = mkContract(vektor, dzo.transport, { subject: 'ТОиР насосного оборудования НПС-2', amount: 184_500_000, status: 'просрочен', overdue: 23, id: 'ctr_01J8SN00000000000000VEKT01', signed: NOW - 410 * DAY })
  mkContract(vektor, dzo.transport, { subject: 'Поставка запорной арматуры', amount: 62_300_000, status: 'закрыт', signed: NOW - 800 * DAY })
  mkContract(vektor, dzo.dobycha, { subject: 'Сервис компрессорного оборудования', amount: 41_800_000, status: 'исполняется', signed: NOW - 120 * DAY })
  mkContract(strela, dzo.transport, { subject: 'Ремонт резервуаров', amount: 97_000_000, status: 'просрочен', overdue: 41, signed: NOW - 300 * DAY })
  mkContract(strela, dzo.pererabotka, { subject: 'Изоляционные работы', amount: 28_400_000, status: 'закрыт', signed: NOW - 600 * DAY })
  while (contracts.length < N.contracts) mkContract(rng.pick(orgs), rng.pick(dzoList))
  for (const o of orgs) { const cs = orgContracts.get(o.id) || []; o.props.contracts_total = cs.reduce((a, c) => a + (c.props.amount as number), 0) }

  const procs: SpObject[] = []
  const bids: SpObject[] = []
  const cartelProcs: string[] = []
  const sharedProcs: string[] = []
  function mkProc(participants: SpObject[], winnerIdx: number, opts: { cartel?: number; sub?: SpObject; subject?: string; nmc?: number; published?: number; tight?: boolean } = {}) {
    const sub = opts.sub ?? rng.pick(dzoList)
    const published = opts.published ?? NOW - rng.int(20, 900) * DAY
    const nmc = opts.nmc ?? Math.round(Math.exp(rng.gauss(17, 1)) / 10000) * 10000
    const disc = opts.tight ? rng.float(0.3, 1.8) : rng.float(0.5, 24)
    const winnerPrice = Math.round(nmc * (1 - disc / 100))
    const p = add('Procurement', `Закупка ${String(rng.int(31000000000000, 32999999999999))}`, { notice_no: '', subject: opts.subject ?? rng.pick(CONTRACT_SUBJECTS), nmc, method: rng.pick(['запрос предложений', 'открытый конкурс', 'аукцион', 'запрос котировок']), published: fmtD(published), bids_count: participants.length, winner_discount: +disc.toFixed(1), cartel_pattern: opts.cartel ?? +Math.max(0.01, Math.min(0.4, rng.gauss(0.12, 0.09))).toFixed(2), status: 'завершена' }, { created: published, subsidiary: sub.id, sources: ['eis', 'etp'], meta: { nmc: metaSrc('eis.notice.nmc', 3600), cartel_pattern: { derived_by: 'functions.cartel_pattern@1.0.0' } } })
    p.props.notice_no = p.label.replace('Закупка ', '')
    procs.push(p)
    participants.forEach((org, i) => {
      const price = i === winnerIdx ? winnerPrice : Math.round(winnerPrice * (1 + (opts.tight ? rng.float(0.2, 1.5) : rng.float(0.5, 12)) / 100))
      const b = add('Bid', `Заявка ${org.label}`, { price, result: i === winnerIdx ? 'победитель' : 'отклонена/2-е место', submitted: fmtDT(published + rng.int(3, 20) * DAY) }, { created: published, sources: ['etp'] })
      bids.push(b)
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
    const p = mkProc(parts, i % 2 === 0 ? parts.indexOf(vektor) : parts.indexOf(strela), { cartel: +(0.66 + rng.float(0, 0.12)).toFixed(2), sub: dzo.transport, tight: true, published: NOW - (60 + i * 75) * DAY, subject: rng.pick(['ТОиР насосного оборудования', 'Ремонт резервуаров', 'Поставка запорной арматуры', 'Изоляционные работы']) })
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
    const sub = rng.pick(dzoList); const p = person(rng)
    const e = add('Employee', p.short, { tab_no: String(100000 + rng.int(1, 89999)), full_name: p.full, position: rng.pick(POSITIONS), unit: rng.pick(UNITS), clearance: rng.pick(['INTERNAL', 'INTERNAL', 'CONFIDENTIAL', 'CONFIDENTIAL+FIN', 'CONFIDENTIAL+PII+FIN']) }, { subsidiary: sub.id, sources: [sub === dzo.dobycha ? 'sap_hcm' : 'onec_zup'] })
    employees.push(e)
  }

  // ---------- Maintenance orders ----------
  const orders: SpObject[] = []
  const contractorsByEq = new Map<string, SpObject>()
  const orderKinds = ['ТО-1', 'ТО-2', 'Текущий ремонт', 'Капитальный ремонт', 'Диагностика', 'Внеплановый ремонт', 'Замена узла']
  const prios = ['Низкий', 'Средний', 'Средний', 'Высокий', 'Критический']
  const openOrders104: string[] = []
  const perEq = Math.max(1, Math.round(N.orders / equipment.length))
  const contractorPool = orgs.slice(0, 260)
  let orderNo = 4000
  for (const e of equipment) {
    let contractor = contractorsByEq.get(e.id)
    if (!contractor) { contractor = rng.chance(0.6) ? rng.pick(contractorPool) : undefined as unknown as SpObject; if (contractor) contractorsByEq.set(e.id, contractor) }
    const src = e.sources.includes('onec_toir') ? 'onec_toir' : 'sap_pm'
    const cnt = e === pump104 ? 14 : Math.max(1, Math.round(perEq * rng.float(0.4, 1.6)))
    for (let i = 0; i < cnt; i++) {
      const planned = NOW - rng.int(-20, 1100) * DAY
      let status = planned > NOW - 3 * DAY ? rng.pick(['открыта', 'в работе', 'согласование']) : rng.chance(0.93) ? 'закрыта' : rng.pick(['открыта', 'в работе', 'просрочена'])
      let kind = rng.pick(orderKinds)
      if (e === pump104) { if (i < 3) { status = ['открыта', 'в работе', 'согласование'][i]; kind = ['Внеплановый ремонт', 'Диагностика', 'Замена узла'][i] } else status = 'закрыта' }
      const cost = Math.round(rng.float(40, 4800)) * 1000
      const num = e === pump104 && i === 0 ? '4412-17' : `${orderNo++}-${rng.int(1, 30)}`
      const o = add('MaintenanceOrder', `Заявка ${num}`, { number: num, kind, priority: e === pump104 && i < 3 ? ['Критический', 'Высокий', 'Средний'][i] : rng.pick(prios), status, planned: fmtD(planned), actual: status === 'закрыта' ? fmtD(planned + rng.int(0, 20) * DAY) : null, cost, source_system: src === 'sap_pm' ? 'SAP PM' : '1С:ТОиР' }, { id: e === pump104 && i === 0 ? 'mo_01J8SN0000000000000000441217' : undefined, created: planned - rng.int(2, 30) * DAY, subsidiary: e.subsidiary, sources: [src], version: rng.int(1, 12), materializedAt: NOW - rng.int(5, 280) * 1000, meta: e === pump104 ? { status: metaSrc(src === 'sap_pm' ? 'sap_pm.aufk.stat' : 'onec_toir.zayavki.status', 300), cost: metaSrc(src === 'sap_pm' ? 'sap_pm.aufk.cost' : 'onec_toir.zayavki.summa', 300) } : EMPTY_META })
      orders.push(o)
      link('maintains', o.id, e.id, { source: src })
      const performer = e === pump104 && i < 3 ? vektor : contractor
      if (performer) { link('performed_by', o.id, performer.id, { source: src }); const cs = orgContracts.get(performer.id); if (cs && cs.length && rng.chance(0.5)) link('under_contract', o.id, (e === pump104 ? contractVektor : rng.pick(cs)).id, { source: src, markings: ['CONFIDENTIAL'] }) }
      else if (rng.chance(0.3)) link('performed_by', o.id, rng.pick(employees).id, { source: src })
      if (e === pump104 && i < 3) { openOrders104.push(o.id); link('under_contract', o.id, contractVektor.id, { source: src, markings: ['CONFIDENTIAL'] }) }
    }
    if (orders.length >= N.orders) break
  }

  // ---------- Incidents ----------
  const incidents: SpObject[] = []
  const incidentNps2: string[] = []
  for (let i = 0; i < N.incidents; i++) {
    const atNps2 = i < 6
    const host = atNps2 ? (i < 2 ? nps2 : rng.pick(equipment.filter(e => linksTo.get(e.id)?.some(l => l.type === 'has_equipment' && l.from === nps2.id)).slice(0, 40))) : rng.pick(equipment)
    const ts = atNps2 && i === 0 ? NOW - 6 * DAY : NOW - rng.int(1, 700) * DAY
    const inc = add('Incident', `Инцидент ${2026 - Math.floor((NOW - ts) / (365 * DAY))}-${rng.int(100, 999)}`, { class: atNps2 && i === 0 ? 'Отклонение параметров' : rng.pick(INC_CLASSES), date: fmtDT(ts), status: ts > NOW - 30 * DAY ? rng.pick(['расследование', 'открыт']) : 'закрыт', consequences: rng.pick(['Без последствий', 'Остановка на 4 ч', 'Снижение производительности', 'Локальная утечка, устранена']), damage: rng.int(0, 2400) * 10000 }, { created: ts, subsidiary: host.subsidiary, sources: ['incident_log', 'sed'] })
    incidents.push(inc)
    if (atNps2) incidentNps2.push(inc.id)
    link('occurred_at', inc.id, host.id, { source: 'incident_log', markings: ['CONFIDENTIAL'] })
  }

  // ---------- Documents & mentions ----------
  const docs: SpObject[] = []
  const vektorLetters: string[] = []
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
  const lastAct = mkDoc('Акт', 'Акт выполненных работ № 118 по заявке 4412-17', NOW - 2 * DAY, { attach: objects.get(openOrders104[0])!, mentions: [vektor, pump104], source: 'СЭД Directum', ocr: true, id: 'doc_01J8SN0000000000000000ACT118' })
  for (let i = 0; i < 3; i++) vektorLetters.push(mkDoc('Письмо', ['Письмо о переносе сроков ремонта НПС-2', 'Письмо-претензия по договору ТОиР', 'Гарантийное письмо ООО «Вектор»'][i], NOW - (5 + i * 11) * DAY, { attach: contractVektor, mentions: [vektor, ivanov], source: 'Почта' }).id)
  mkDoc('Протокол', 'Протокол вскрытия конвертов, закупка НПС-2', NOW - 60 * DAY, { attach: contracts[0], mentions: [vektor, strela] })
  while (docs.length < N.docs) {
    const kind = rng.pick(DOC_KINDS)
    const target = rng.chance(0.5) ? rng.pick(contracts) : rng.chance(0.5) ? rng.pick(orders) : rng.pick(incidents)
    const mentions: SpObject[] = rng.chance(0.6) ? [rng.pick(orgs)] : []
    if (rng.chance(0.3)) mentions.push(rng.pick(persons))
    mkDoc(kind, `${kind} № ${rng.int(1, 9999)} ${kind === 'Письмо' ? 'исх.' : ''}`, NOW - rng.int(1, 900) * DAY, { attach: target, mentions })
  }

  // ---------- Shipments & vehicles ----------
  const vehicles: SpObject[] = []
  for (let i = 0; i < N.vehicles; i++) {
    const p = rng.pick(pipelines); const t = rng.next(); const idx = Math.floor(t * (p.points.length - 1)); const a = p.points[idx], b = p.points[idx + 1]; const f = t * (p.points.length - 1) - idx
    const v = add('Vehicle', `${rng.pick(['А', 'В', 'Е', 'К', 'М', 'Н', 'О', 'Р', 'С', 'Т', 'У', 'Х'])}${rng.int(100, 999)}${rng.pick(['АВ', 'ЕК', 'МН', 'ОР', 'СТ'])} 86`, { plate: '', kind: rng.pick(['АЦ', 'Спецтехника', 'Вахтовый автобус', 'Бортовой', 'Кран']), status: rng.pick(['в движении', 'в движении', 'стоянка', 'на объекте']) }, { geo: [a[0] + (b[0] - a[0]) * f + rng.float(-10, 10), a[1] + (b[1] - a[1]) * f + rng.float(-10, 10)], subsidiary: dzo.transport.id, sources: ['glonass'], materializedAt: NOW - rng.int(2, 28) * 1000 })
    v.props.plate = v.label; vehicles.push(v)
  }
  for (let i = 0; i < N.shipments; i++) {
    const s = add('Shipment', `Партия ${rng.int(10000, 99999)}`, { product: rng.pick(['нефть', 'ДТ', 'бензин АИ-92', 'мазут']), volume: rng.int(200, 6000), status: rng.pick(['в пути', 'отгружена', 'принята', 'план']) }, { subsidiary: dzo.pererabotka.id, sources: ['sap_sd'] })
    link('transports', s.id, rng.chance(0.7) ? rng.pick(pipeObjs).id : rng.pick(vehicles).id, { source: 'sap_sd' })
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
    ['freshness', () => `Свежесть ${rng.pick(['Sensor', 'Tank', 'Well', 'MaintenanceOrder'])} в SLO`, () => undefined],
    ['er', () => `ER: слияние ${rng.pick(orgs).label} по ИНН`, () => undefined],
    ['action', () => `Действие change_order_priority выполнено (toir_eng)`, () => undefined],
    ['policy', () => 'PDP: политика abac_fin_v12 перезагружена', () => undefined],
    ['info', () => `Materializer: ${rng.int(120, 900)} объектов/с, лаг ${rng.int(2, 9)} с`, () => undefined],
  ]
  for (let i = 0; i < 120; i++) { const t = rng.pick(evTemplates); events.push({ id: `ev_${i}`, ts: NOW - rng.int(30, 7200) * 1000, kind: t[0], text: t[1](), objectId: undefined }) }
  events.push({ id: 'ev_nps2', ts: NOW - 31 * 1000, kind: 'anomaly', text: 'Аномалия давления НПС-2 · score 0.87 · датчик P-104', objectId: nps2.id })
  events.push({ id: 'ev_4412', ts: NOW - 62 * 1000, kind: 'order', text: 'Заявка 4412-17 обновлена: в работе (1С:ТОиР)', objectId: openOrders104[0] })
  events.push({ id: 'ev_inc', ts: NOW - 6 * DAY, kind: 'incident', text: 'Открыт инцидент на НПС-2: отклонение параметров', objectId: incidentNps2[0] })
  events.sort((a, b) => b.ts - a.ts)

  const stats: Record<string, number> = {}
  for (const [t, arr] of byType) stats[t] = arr.length
  stats.links = links.length
  stats.genMs = Math.round(performance.now() - t0)

  return {
    objects, byType, links, linksFrom, linksTo, pipelines, events, stats, scale,
    named: { holding: holding.id, dobycha: dzo.dobycha.id, transport: dzo.transport.id, pererabotka: dzo.pererabotka.id, nps1: nps1.id, nps2: nps2.id, pump104: pump104.id, sensorP104: named104.P.id, sensorV104: named104.V.id, sensorT104: named104.T.id, anomalyNps2: anomalyNps2.id, vektor: vektor.id, strela: strela.id, ivanov: ivanov.id, sharedProcs, cartelProcs, lastAct: lastAct.id, vektorLetters, incidentNps2, openOrders104, contractVektor: contractVektor.id, purposes },
  }
}

function fmtD(ts: number) { const d = new Date(ts); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
function fmtDT(ts: number) { return new Date(ts).toISOString().slice(0, 16).replace('T', ' ') }

/** Deterministic telemetry series for a sensor over [from, to] with step (ms). Anomaly injected for P-104 (НПС-2). */
export function telemetry(sensorTag: string, kind: string, from: number, to: number, step: number, opts: { anomaly?: boolean } = {}): { t: number; v: number }[] {
  const base = kind === 'давление' ? 4.6 : kind === 'вибрация' ? 2.4 : 58
  const amp = kind === 'давление' ? 0.35 : kind === 'вибрация' ? 0.5 : 6
  const h = hash32(sensorTag)
  const out: { t: number; v: number }[] = []
  const anomalyStart = to - 15 * MIN
  for (let t = from; t <= to; t += step) {
    const x = t / HOUR
    const r = new Rng(h ^ Math.floor(t / step))
    let v = base + amp * Math.sin(x / 3.8 + h % 7) + amp * 0.4 * Math.sin(x / 0.7 + (h % 13)) + r.gauss(0, amp * 0.12)
    if (opts.anomaly && t > anomalyStart) { const k = (t - anomalyStart) / (15 * MIN); v += (kind === 'давление' ? 2.3 : kind === 'вибрация' ? 2.9 : 14) * Math.pow(k, 1.6) }
    if (opts.anomaly && t > to - 6 * HOUR && t < to - 5.2 * HOUR && kind === 'вибрация') v += 1.4
    out.push({ t, v: +v.toFixed(3) })
  }
  return out
}
