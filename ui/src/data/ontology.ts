// Ontology registry — the in-browser projection of ontology/*.yaml (spec part 3, ADR-12).
// Every object type: properties with markings and units, links, actions, freshness SLO, backing sources.

export type Level = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'SECRET'
export type Category = 'FIN' | 'PII' | 'PROD' | 'GEO' | 'HR' | 'LEGAL' | 'SYNTHETIC'
export type Marking = Level | Category
export const LEVELS: Level[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'SECRET']
export const CATEGORIES: Category[] = ['FIN', 'PII', 'PROD', 'GEO', 'HR', 'LEGAL', 'SYNTHETIC']
export const isLevel = (m: Marking): m is Level => (LEVELS as string[]).includes(m)

export type ObjectType =
  | 'Holding' | 'Subsidiary' | 'Field' | 'LicenseArea' | 'WellPad' | 'Well' | 'Pipeline' | 'PipelineSegment'
  | 'PumpStation' | 'Tank' | 'Equipment' | 'Sensor' | 'Anomaly' | 'MaintenanceOrder' | 'WorkPermit' | 'Incident'
  | 'Organization' | 'Person' | 'Employee' | 'Contract' | 'Procurement' | 'Bid' | 'Shipment' | 'Vehicle'
  | 'Document' | 'Mention' | 'Report' | 'Purpose'

export type LinkType =
  | 'owns' | 'operates' | 'located_on' | 'has_equipment' | 'measured_by' | 'detected_on' | 'maintains' | 'performed_by'
  | 'under_contract' | 'party_to' | 'founder_of' | 'director_of' | 'participated_in' | 'awarded' | 'mentions'
  | 'attached_to' | 'occurred_at' | 'transports' | 'accessed_under' | 'connects'

export type PropType = 'string' | 'number' | 'money' | 'decimal' | 'enum' | 'date' | 'datetime' | 'bool' | 'geo' | 'text' | 'percent'

export interface PropDef {
  name: string
  label: string
  type: PropType
  unit?: string
  markings?: Marking[]          // extra markings for this property
  masking?: 'null_for_unauthorized' | 'partial'
  derived_by?: string           // function name
  sources?: string[]            // e.g. sap_pm.equi.equnr
  survivorship?: string
  freshness_slo?: string
  key?: boolean                 // show in hover card / table
  live?: boolean                // has freshness indicator
}

export interface ActionDef {
  name: string
  label: string
  object: ObjectType[]
  preconditions: string[]
  writeback: string
  risk: 'Низкий' | 'Средний' | 'Высокий'
  confirmation: string
  role?: string
  params: { name: string; label: string; type: 'string' | 'enum' | 'number' | 'text' | 'date'; options?: string[]; required?: boolean; default?: unknown }[]
}

export interface FunctionDef { name: string; label: string; input: string; output: string; explain: boolean }

export interface TypeDef {
  type: ObjectType
  label: string
  plural: string
  prefix: string
  version: string
  owner: string
  description: string
  backing: string
  provenance: 'full' | 'row' | 'dataset'
  sloSec: number
  markings: Marking[]
  sources: string[]
  props: PropDef[]
  icon: string        // lucide icon name key
  color: string
  virtual?: boolean
}

export interface LinkDef {
  type: LinkType
  label: string
  from: ObjectType[]
  to: ObjectType[]
  cardinality: string
  source: string
  markings: Marking[]
  inverseLabel: string
}

const T = (d: TypeDef) => d

export const TYPES: Record<ObjectType, TypeDef> = {
  Holding: T({ type: 'Holding', label: 'Холдинг', plural: 'Холдинги', prefix: 'hld', version: '1.0.0', owner: 'team-core', description: 'Головная компания холдинга', backing: 'gold.holding', provenance: 'row', sloSec: 86400, markings: ['INTERNAL'], sources: ['manual', 'egrul'], icon: 'building', color: '#abb3bf',
    props: [
      { name: 'name', label: 'Название', type: 'string', key: true, sources: ['manual.holding.name'] },
      { name: 'inn', label: 'ИНН', type: 'string', key: true, sources: ['egrul.ul.inn'] },
      { name: 'subsidiaries', label: 'ДЗО', type: 'number', key: true },
    ] }),
  Subsidiary: T({ type: 'Subsidiary', label: 'ДЗО', plural: 'ДЗО', prefix: 'dzo', version: '1.1.0', owner: 'team-core', description: 'Дочернее и зависимое общество холдинга', backing: 'gold.subsidiary', provenance: 'row', sloSec: 86400, markings: ['INTERNAL'], sources: ['egrul', 'it_landscape'], icon: 'factory', color: '#abb3bf',
    props: [
      { name: 'name', label: 'Название', type: 'string', key: true, sources: ['egrul.ul.name'] },
      { name: 'inn', label: 'ИНН', type: 'string', key: true, sources: ['egrul.ul.inn'] },
      { name: 'region', label: 'Регион', type: 'string', key: true },
      { name: 'kind', label: 'Тип', type: 'enum', key: true },
      { name: 'erp', label: 'ERP-система', type: 'string', key: true, sources: ['it_landscape.systems.erp'] },
      { name: 'employees', label: 'Сотрудников', type: 'number', markings: ['HR'] },
    ] }),
  Field: T({ type: 'Field', label: 'Месторождение', plural: 'Месторождения', prefix: 'fld', version: '1.0.0', owner: 'team-geo', description: 'Месторождение углеводородов', backing: 'gold.field', provenance: 'row', sloSec: 86400, markings: ['CONFIDENTIAL'], sources: ['rosnedra', 'manual'], icon: 'mountain', color: '#9d8be8',
    props: [
      { name: 'code', label: 'Код', type: 'string', key: true },
      { name: 'name', label: 'Название', type: 'string', key: true },
      { name: 'license', label: 'Лицензионный участок', type: 'string', key: true, markings: ['GEO'] },
      { name: 'reserves_abc1', label: 'Запасы ABC1', type: 'number', unit: 'тыс. т', markings: ['CONFIDENTIAL', 'GEO'], masking: 'null_for_unauthorized' },
      { name: 'operator', label: 'Оператор', type: 'string', key: true },
    ] }),
  LicenseArea: T({ type: 'LicenseArea', label: 'Лицензионный участок', plural: 'Лицензионные участки', prefix: 'lic', version: '1.0.0', owner: 'team-geo', description: 'Лицензия на недропользование', backing: 'gold.license_area', provenance: 'dataset', sloSec: 2592000, markings: ['CONFIDENTIAL'], sources: ['rosnedra'], icon: 'file-badge', color: '#9d8be8',
    props: [ { name: 'number', label: 'Номер лицензии', type: 'string', key: true }, { name: 'valid_to', label: 'Срок', type: 'date', key: true } ] }),
  WellPad: T({ type: 'WellPad', label: 'Куст', plural: 'Кусты', prefix: 'pad', version: '1.0.0', owner: 'team-prod', description: 'Кустовая площадка скважин', backing: 'gold.wellpad', provenance: 'row', sloSec: 86400, markings: ['INTERNAL'], sources: ['manual'], icon: 'grid', color: '#9d8be8',
    props: [ { name: 'code', label: 'Код', type: 'string', key: true }, { name: 'wells', label: 'Скважин', type: 'number', key: true }, { name: 'coords', label: 'Координаты', type: 'geo', markings: ['GEO'], masking: 'null_for_unauthorized' } ] }),
  Well: T({ type: 'Well', label: 'Скважина', plural: 'Скважины', prefix: 'well', version: '1.2.0', owner: 'team-prod', description: 'Добывающая или нагнетательная скважина', backing: 'gold.well', provenance: 'row', sloSec: 900, markings: ['CONFIDENTIAL', 'PROD'], sources: ['prod_registry', 'measurements', 'sap_pm'], icon: 'drill', color: '#9d8be8',
    props: [
      { name: 'number', label: 'Номер', type: 'string', key: true, sources: ['prod_registry.wells.no'] },
      { name: 'kind', label: 'Тип', type: 'enum', key: true },
      { name: 'status', label: 'Статус', type: 'enum', key: true, sources: ['prod_registry.wells.status'] },
      { name: 'debit', label: 'Дебит', type: 'number', unit: 'т/сут', key: true, live: true, markings: ['PROD'], sources: ['measurements.daily.debit'] },
      { name: 'water_cut', label: 'Обводнённость', type: 'percent', unit: '%', live: true, markings: ['PROD'] },
      { name: 'commissioned', label: 'Дата ввода', type: 'date' },
      { name: 'trend_30d', label: 'Тренд 30 дн', type: 'percent', unit: '%', derived_by: 'functions.well_trend' },
    ] }),
  Pipeline: T({ type: 'Pipeline', label: 'Трубопровод', plural: 'Трубопроводы', prefix: 'pipe', version: '1.0.0', owner: 'team-transport', description: 'Магистральный или промысловый трубопровод', backing: 'gold.pipeline', provenance: 'row', sloSec: 86400, markings: ['CONFIDENTIAL'], sources: ['opo_registry', 'sap_pm'], icon: 'route', color: '#8abbff',
    props: [
      { name: 'code', label: 'Код', type: 'string', key: true },
      { name: 'diameter', label: 'Диаметр', type: 'number', unit: 'мм', key: true },
      { name: 'length', label: 'Протяжённость', type: 'number', unit: 'км', key: true, markings: ['GEO'] },
      { name: 'design_pressure', label: 'Давление проектное', type: 'number', unit: 'МПа' },
      { name: 'flow', label: 'Расход', type: 'number', unit: 'м³/ч', live: true, markings: ['PROD'] },
      { name: 'commissioned', label: 'Год ввода', type: 'number' },
    ] }),
  PipelineSegment: T({ type: 'PipelineSegment', label: 'Участок', plural: 'Участки', prefix: 'seg', version: '1.0.0', owner: 'team-transport', description: 'Участок трубопровода между километрами', backing: 'gold.pipeline_segment', provenance: 'row', sloSec: 86400, markings: ['CONFIDENTIAL'], sources: ['vtd', 'sap_pm'], icon: 'minus', color: '#8abbff',
    props: [ { name: 'km_from', label: 'Км начала', type: 'number', key: true }, { name: 'km_to', label: 'Км конца', type: 'number', key: true }, { name: 'category', label: 'Категория', type: 'enum', key: true }, { name: 'defects', label: 'Дефекты ВТД', type: 'number', key: true } ] }),
  PumpStation: T({ type: 'PumpStation', label: 'НПС', plural: 'НПС', prefix: 'nps', version: '1.3.0', owner: 'team-transport', description: 'Нефтеперекачивающая станция', backing: 'gold.pump_station', provenance: 'full', sloSec: 30, markings: ['CONFIDENTIAL', 'PROD'], sources: ['scada', 'sap_pm'], icon: 'cog', color: '#4c90f0',
    props: [
      { name: 'code', label: 'Код', type: 'string', key: true, sources: ['sap_pm.iflot.tplnr'] },
      { name: 'capacity', label: 'Мощность', type: 'number', unit: 'м³/ч', key: true },
      { name: 'mode', label: 'Режим', type: 'enum', key: true, live: true, sources: ['scada.nps.mode'] },
      { name: 'pressure_in', label: 'Давление вход', type: 'number', unit: 'МПа', live: true, markings: ['PROD'], sources: ['scada.nps.p_in'] },
      { name: 'pressure_out', label: 'Давление выход', type: 'number', unit: 'МПа', live: true, markings: ['PROD'], sources: ['scada.nps.p_out'] },
      { name: 'pressure_anomaly_score', label: 'Аномалия давления', type: 'decimal', key: true, live: true, derived_by: 'pipelines.anomaly_v3' },
      { name: 'open_incidents', label: 'Открытых инцидентов', type: 'number', key: true },
    ] }),
  Tank: T({ type: 'Tank', label: 'Резервуар', plural: 'Резервуары', prefix: 'tank', version: '1.1.0', owner: 'team-transport', description: 'Резервуар хранения продукта', backing: 'gold.tank', provenance: 'row', sloSec: 60, markings: ['CONFIDENTIAL', 'PROD'], sources: ['scada', 'lims'], icon: 'cylinder', color: '#4c90f0',
    props: [
      { name: 'code', label: 'Код', type: 'string', key: true },
      { name: 'volume', label: 'Объём', type: 'number', unit: 'м³', key: true },
      { name: 'level', label: 'Уровень', type: 'percent', unit: '%', key: true, live: true, markings: ['PROD'], sources: ['scada.tank.level'] },
      { name: 'product', label: 'Продукт', type: 'enum', key: true },
      { name: 'temperature', label: 'Температура', type: 'number', unit: '°C', live: true, sources: ['scada.tank.temp'] },
    ] }),
  Equipment: T({ type: 'Equipment', label: 'Оборудование', plural: 'Оборудование', prefix: 'eq', version: '1.3.0', owner: 'team-toir', description: 'Единица оборудования на активе (насос, задвижка, компрессор, ёмкость)', backing: 'gold.equipment', provenance: 'full', sloSec: 900, markings: ['INTERNAL'], sources: ['sap_pm', 'onec_toir', 'passports'], icon: 'wrench', color: '#ec9a3c',
    props: [
      { name: 'inventory_no', label: 'Инвентарный номер', type: 'string', key: true, sources: ['sap_pm.equi.equnr', 'onec_toir.oborudovanie.inv_nomer'], survivorship: 'prefer_source(sap_pm)' },
      { name: 'name', label: 'Наименование', type: 'string', key: true, sources: ['sap_pm.equi.eqktx'] },
      { name: 'equipment_class', label: 'Класс', type: 'enum', key: true },
      { name: 'operating_hours', label: 'Наработка', type: 'number', unit: 'ч', live: true, freshness_slo: '15m', sources: ['sap_pm.equi.oper_hours'] },
      { name: 'health_index', label: 'Индекс состояния', type: 'decimal', key: true, derived_by: 'functions.equipment_health_index' },
      { name: 'criticality', label: 'Критичность', type: 'enum', key: true },
      { name: 'purchase_cost', label: 'Стоимость приобретения', type: 'money', markings: ['FIN'], masking: 'null_for_unauthorized', sources: ['sap_pm.anla.answl'] },
      { name: 'commissioned', label: 'Ввод в эксплуатацию', type: 'date' },
    ] }),
  Sensor: T({ type: 'Sensor', label: 'Датчик', plural: 'Датчики', prefix: 'sen', version: '1.0.0', owner: 'team-scada', description: 'Измерительный канал АСУ ТП', backing: 'gold.sensor', provenance: 'dataset', sloSec: 5, markings: ['INTERNAL', 'PROD'], sources: ['opcua', 'historian'], icon: 'activity', color: '#32a467',
    props: [
      { name: 'tag', label: 'Тег', type: 'string', key: true, sources: ['opcua.node.browse_name'] },
      { name: 'kind', label: 'Тип', type: 'enum', key: true },
      { name: 'unit', label: 'Единицы', type: 'string', key: true },
      { name: 'last_value', label: 'Последнее значение', type: 'number', key: true, live: true, markings: ['PROD'], sources: ['opcua.node.value'] },
      { name: 'quality', label: 'Качество', type: 'enum', key: true, live: true },
    ] }),
  Anomaly: T({ type: 'Anomaly', label: 'Аномалия', plural: 'Аномалии', prefix: 'an', version: '1.0.0', owner: 'team-ml', description: 'Наблюдение ML-пайплайна', backing: 'enrich.anomaly', provenance: 'full', sloSec: 60, markings: ['INTERNAL'], sources: ['pipelines.anomaly_v3'], icon: 'alert-triangle', color: '#e76a6e',
    props: [
      { name: 'kind', label: 'Тип', type: 'enum', key: true },
      { name: 'score', label: 'Score', type: 'decimal', key: true, derived_by: 'pipelines.anomaly_v3' },
      { name: 'window_from', label: 'Окно с', type: 'datetime', key: true },
      { name: 'window_to', label: 'Окно по', type: 'datetime', key: true },
      { name: 'model', label: 'Модель', type: 'string', key: true },
    ] }),
  MaintenanceOrder: T({ type: 'MaintenanceOrder', label: 'Заявка ТОиР', plural: 'Заявки ТОиР', prefix: 'mo', version: '1.2.0', owner: 'team-toir', description: 'Заявка на техническое обслуживание или ремонт', backing: 'gold.maintenance_order', provenance: 'full', sloSec: 300, markings: ['INTERNAL'], sources: ['sap_pm', 'onec_toir'], icon: 'clipboard-list', color: '#ec9a3c',
    props: [
      { name: 'number', label: 'Номер', type: 'string', key: true, sources: ['sap_pm.aufk.aufnr', 'onec_toir.zayavki.nomer'] },
      { name: 'kind', label: 'Тип', type: 'enum', key: true },
      { name: 'priority', label: 'Приоритет', type: 'enum', key: true },
      { name: 'status', label: 'Статус', type: 'enum', key: true, live: true, sources: ['sap_pm.aufk.stat', 'onec_toir.zayavki.status'] },
      { name: 'planned', label: 'План', type: 'date', key: true },
      { name: 'actual', label: 'Факт', type: 'date' },
      { name: 'cost', label: 'Стоимость', type: 'money', markings: ['FIN'], masking: 'null_for_unauthorized', sources: ['sap_pm.aufk.cost'] },
      { name: 'source_system', label: 'Система-источник', type: 'string' },
    ] }),
  WorkPermit: T({ type: 'WorkPermit', label: 'Наряд-допуск', plural: 'Наряды-допуски', prefix: 'wp', version: '1.0.0', owner: 'team-toir', description: 'Наряд-допуск на работы', backing: 'gold.work_permit', provenance: 'row', sloSec: 900, markings: ['INTERNAL'], sources: ['sed'], icon: 'badge-check', color: '#ec9a3c',
    props: [ { name: 'number', label: 'Номер', type: 'string', key: true }, { name: 'work', label: 'Вид работ', type: 'string', key: true }, { name: 'valid_to', label: 'Срок', type: 'date', key: true } ] }),
  Incident: T({ type: 'Incident', label: 'Инцидент', plural: 'Инциденты', prefix: 'inc', version: '1.1.0', owner: 'team-hse', description: 'Инцидент на активе', backing: 'gold.incident', provenance: 'full', sloSec: 60, markings: ['CONFIDENTIAL'], sources: ['incident_log', 'sed'], icon: 'siren', color: '#e76a6e',
    props: [
      { name: 'class', label: 'Класс', type: 'enum', key: true },
      { name: 'date', label: 'Дата', type: 'datetime', key: true },
      { name: 'status', label: 'Статус расследования', type: 'enum', key: true },
      { name: 'consequences', label: 'Последствия', type: 'text', markings: ['LEGAL'] },
      { name: 'damage', label: 'Ущерб', type: 'money', markings: ['FIN', 'LEGAL'], masking: 'null_for_unauthorized' },
    ] }),
  Organization: T({ type: 'Organization', label: 'Контрагент', plural: 'Контрагенты', prefix: 'org', version: '2.0.0', owner: 'team-er', description: 'Юридическое лицо: golden-объект после Entity Resolution из SAP, 1С, ЕГРЮЛ, ЕИС', backing: 'gold.organization', provenance: 'full', sloSec: 3600, markings: ['INTERNAL'], sources: ['sap_mm', 'onec', 'egrul', 'eis'], icon: 'briefcase', color: '#8abbff',
    props: [
      { name: 'name', label: 'Наименование', type: 'string', key: true, sources: ['egrul.ul.name', 'sap_mm.lfa1.name1', 'onec.kontragenty.naimenovanie'], survivorship: 'ЕГРЮЛ > SAP > 1С > Mention' },
      { name: 'inn', label: 'ИНН', type: 'string', key: true, sources: ['egrul.ul.inn', 'sap_mm.lfa1.stcd1'] },
      { name: 'ogrn', label: 'ОГРН', type: 'string', sources: ['egrul.ul.ogrn'] },
      { name: 'status', label: 'Статус', type: 'enum', key: true, sources: ['egrul.ul.status'], survivorship: 'ЕГРЮЛ' },
      { name: 'region', label: 'Регион', type: 'string', key: true },
      { name: 'address', label: 'Адрес', type: 'string', sources: ['egrul.ul.address'] },
      { name: 'phone', label: 'Телефон', type: 'string', masking: 'partial', markings: ['PII'], sources: ['onec.kontragenty.telefon'] },
      { name: 'risk_score', label: 'Риск-скор', type: 'decimal', key: true, derived_by: 'functions.counterparty_risk_score' },
      { name: 'contracts_total', label: 'Сумма договоров', type: 'money', markings: ['FIN'], masking: 'null_for_unauthorized', derived_by: 'functions.contracts_total' },
      { name: 'registered', label: 'Дата регистрации', type: 'date', sources: ['egrul.ul.reg_date'] },
      { name: 'control_flag', label: 'На контроле', type: 'bool', key: true, sources: ['crm.counterparty.block_status'] },
    ] }),
  Person: T({ type: 'Person', label: 'Физлицо', plural: 'Физлица', prefix: 'per', version: '1.1.0', owner: 'team-er', description: 'Физическое лицо: учредитель, директор, упомянутый в документах', backing: 'gold.person', provenance: 'full', sloSec: 86400, markings: ['CONFIDENTIAL'], sources: ['egrul', 'sed', 'hr'], icon: 'user', color: '#d69fd6',
    props: [
      { name: 'full_name', label: 'ФИО', type: 'string', key: true, markings: ['PII'], masking: 'partial', sources: ['egrul.fl.fio'] },
      { name: 'inn', label: 'ИНН', type: 'string', markings: ['PII'], masking: 'partial', sources: ['egrul.fl.inn'] },
      { name: 'roles', label: 'Роли', type: 'string', key: true },
      { name: 'orgs_count', label: 'Организаций', type: 'number', key: true, derived_by: 'functions.person_orgs' },
    ] }),
  Employee: T({ type: 'Employee', label: 'Сотрудник', plural: 'Сотрудники', prefix: 'emp', version: '1.0.0', owner: 'team-hr', description: 'Сотрудник холдинга', backing: 'gold.employee', provenance: 'row', sloSec: 3600, markings: ['INTERNAL', 'HR'], sources: ['onec_zup', 'sap_hcm'], icon: 'id-card', color: '#d69fd6',
    props: [
      { name: 'tab_no', label: 'Табельный', type: 'string', key: true },
      { name: 'full_name', label: 'ФИО', type: 'string', key: true, markings: ['PII'], masking: 'partial' },
      { name: 'position', label: 'Должность', type: 'string', key: true },
      { name: 'unit', label: 'Подразделение', type: 'string', key: true },
      { name: 'clearance', label: 'Допуски', type: 'string', markings: ['HR'] },
    ] }),
  Contract: T({ type: 'Contract', label: 'Договор', plural: 'Договоры', prefix: 'ctr', version: '1.4.0', owner: 'team-procurement', description: 'Договор с контрагентом', backing: 'gold.contract', provenance: 'full', sloSec: 900, markings: ['CONFIDENTIAL'], sources: ['sap_mm', 'onec', 'sed'], icon: 'file-text', color: '#4cb98a',
    props: [
      { name: 'number', label: 'Номер', type: 'string', key: true, sources: ['sap_mm.ekko.ebeln'] },
      { name: 'subject', label: 'Предмет', type: 'string', key: true, sources: ['sed.contract.subject'] },
      { name: 'amount', label: 'Сумма', type: 'money', key: true, markings: ['FIN'], masking: 'null_for_unauthorized', sources: ['sap_mm.ekko.netwr'] },
      { name: 'signed', label: 'Подписан', type: 'date', key: true },
      { name: 'valid_to', label: 'Срок', type: 'date', key: true },
      { name: 'status', label: 'Статус', type: 'enum', key: true, live: true },
      { name: 'execution', label: 'Исполнение', type: 'percent', unit: '%', derived_by: 'functions.contract_execution_status' },
      { name: 'overdue_days', label: 'Просрочка', type: 'number', unit: 'дн', derived_by: 'functions.contract_execution_status' },
    ] }),
  Procurement: T({ type: 'Procurement', label: 'Закупка', plural: 'Закупки 223-ФЗ', prefix: 'prc', version: '1.2.0', owner: 'team-procurement', description: 'Закупочная процедура по 223-ФЗ', backing: 'gold.procurement', provenance: 'full', sloSec: 3600, markings: ['INTERNAL'], sources: ['eis', 'etp'], icon: 'gavel', color: '#4cb98a',
    props: [
      { name: 'notice_no', label: 'Номер извещения', type: 'string', key: true, sources: ['eis.notice.number'] },
      { name: 'subject', label: 'Предмет', type: 'string', key: true },
      { name: 'nmc', label: 'НМЦ', type: 'money', key: true, markings: ['FIN'], masking: 'null_for_unauthorized', sources: ['eis.notice.nmc'] },
      { name: 'method', label: 'Способ', type: 'enum', key: true },
      { name: 'published', label: 'Опубликована', type: 'date', key: true },
      { name: 'bids_count', label: 'Заявок', type: 'number', key: true },
      { name: 'winner_discount', label: 'Снижение', type: 'percent', unit: '%' },
      { name: 'cartel_pattern', label: 'Картельный паттерн', type: 'decimal', key: true, derived_by: 'functions.cartel_pattern' },
      { name: 'status', label: 'Статус', type: 'enum', key: true },
    ] }),
  Bid: T({ type: 'Bid', label: 'Заявка участника', plural: 'Заявки участников', prefix: 'bid', version: '1.0.0', owner: 'team-procurement', description: 'Заявка участника закупки', backing: 'gold.bid', provenance: 'row', sloSec: 3600, markings: ['INTERNAL'], sources: ['etp'], icon: 'ticket', color: '#4cb98a',
    props: [ { name: 'price', label: 'Цена', type: 'money', key: true, markings: ['FIN'], masking: 'null_for_unauthorized' }, { name: 'result', label: 'Результат', type: 'enum', key: true }, { name: 'submitted', label: 'Подана', type: 'datetime', key: true } ] }),
  Shipment: T({ type: 'Shipment', label: 'Отгрузка', plural: 'Отгрузки', prefix: 'shp', version: '1.0.0', owner: 'team-logistics', description: 'Партия продукта', backing: 'gold.shipment', provenance: 'row', sloSec: 900, markings: ['CONFIDENTIAL'], sources: ['sap_sd', 'onec'], icon: 'package', color: '#4cb98a',
    props: [ { name: 'product', label: 'Продукт', type: 'enum', key: true }, { name: 'volume', label: 'Объём', type: 'number', unit: 'т', key: true }, { name: 'status', label: 'Статус', type: 'enum', key: true } ] }),
  Vehicle: T({ type: 'Vehicle', label: 'Транспорт', plural: 'Транспорт', prefix: 'veh', version: '1.0.0', owner: 'team-logistics', description: 'Единица техники с телематикой', backing: 'gold.vehicle', provenance: 'dataset', sloSec: 30, markings: ['INTERNAL'], sources: ['glonass'], icon: 'truck', color: '#abb3bf',
    props: [ { name: 'plate', label: 'Госномер', type: 'string', key: true }, { name: 'kind', label: 'Тип', type: 'enum', key: true }, { name: 'status', label: 'Статус', type: 'enum', key: true, live: true }, { name: 'position', label: 'Позиция', type: 'geo', markings: ['GEO'], masking: 'null_for_unauthorized' } ] }),
  Document: T({ type: 'Document', label: 'Документ', plural: 'Документы', prefix: 'doc', version: '1.1.0', owner: 'team-nlp', description: 'Документ из СЭД, почты или файлового хранилища', backing: 'gold.document', provenance: 'row', sloSec: 300, markings: ['INTERNAL'], sources: ['sed', 'mail', 'files'], icon: 'file', color: '#abb3bf',
    props: [
      { name: 'kind', label: 'Тип', type: 'enum', key: true },
      { name: 'title', label: 'Заголовок', type: 'string', key: true },
      { name: 'date', label: 'Дата', type: 'date', key: true },
      { name: 'source', label: 'Источник', type: 'string', key: true },
      { name: 'pages', label: 'Страниц', type: 'number' },
      { name: 'ocr', label: 'OCR', type: 'bool' },
      { name: 'mentions_count', label: 'Упоминаний', type: 'number', key: true },
    ] }),
  Mention: T({ type: 'Mention', label: 'Упоминание', plural: 'Упоминания', prefix: 'men', version: '1.0.0', owner: 'team-nlp', description: 'Извлечённое NLP упоминание сущности в документе', backing: 'enrich.mention', provenance: 'full', sloSec: 300, markings: ['INTERNAL'], sources: ['nlp'], icon: 'quote', color: '#abb3bf',
    props: [ { name: 'span', label: 'Фрагмент', type: 'text', key: true }, { name: 'confidence', label: 'Confidence', type: 'decimal', key: true }, { name: 'model', label: 'Модель', type: 'string', key: true } ] }),
  Report: T({ type: 'Report', label: 'Отчёт регулятору', plural: 'Отчёты', prefix: 'rep', version: '1.0.0', owner: 'team-fin', description: 'Форма отчётности', backing: 'gold.report', provenance: 'row', sloSec: 86400, markings: ['INTERNAL'], sources: ['sed', 'gas_upravlenie'], icon: 'file-spreadsheet', color: '#abb3bf',
    props: [ { name: 'form', label: 'Форма', type: 'string', key: true }, { name: 'period', label: 'Период', type: 'string', key: true }, { name: 'status', label: 'Статус', type: 'enum', key: true } ] }),
  Purpose: T({ type: 'Purpose', label: 'Цель доступа', plural: 'Цели доступа', prefix: 'pur', version: '1.0.0', owner: 'team-security', description: 'Цель обработки данных (PBAC)', backing: 'gold.purpose', provenance: 'row', sloSec: 0, markings: ['INTERNAL'], sources: ['pbac_registry'], icon: 'target', color: '#4c90f0',
    props: [
      { name: 'name', label: 'Название', type: 'string', key: true },
      { name: 'legal_basis', label: 'Правовое основание', type: 'string', key: true },
      { name: 'categories', label: 'Категории данных', type: 'string', key: true },
      { name: 'expires_at', label: 'Срок', type: 'date', key: true },
      { name: 'owner', label: 'Владелец', type: 'string', key: true },
      { name: 'members', label: 'Участников', type: 'number', key: true },
    ] }),
}

export const LINKS: LinkDef[] = [
  { type: 'owns', label: 'владеет', inverseLabel: 'принадлежит', from: ['Holding'], to: ['Subsidiary'], cardinality: '1:N', source: 'ЕГРЮЛ (доля > 50%)', markings: ['INTERNAL'] },
  { type: 'operates', label: 'эксплуатирует', inverseLabel: 'эксплуатируется', from: ['Subsidiary'], to: ['Field', 'Pipeline', 'PumpStation', 'Tank'], cardinality: '1:N', source: 'Справочники', markings: ['INTERNAL'] },
  { type: 'located_on', label: 'расположен на', inverseLabel: 'содержит', from: ['Well', 'WellPad'], to: ['WellPad', 'Field'], cardinality: 'N:1', source: 'Справочники', markings: ['GEO'] },
  { type: 'has_equipment', label: 'имеет оборудование', inverseLabel: 'установлено на', from: ['Well', 'PumpStation', 'Tank', 'PipelineSegment'], to: ['Equipment'], cardinality: '1:N', source: 'SAP PM функциональные места', markings: ['INTERNAL'] },
  { type: 'measured_by', label: 'измеряется', inverseLabel: 'измеряет', from: ['Equipment'], to: ['Sensor'], cardinality: '1:N', source: 'Конфигурация SCADA', markings: ['INTERNAL'] },
  { type: 'detected_on', label: 'обнаружена на', inverseLabel: 'аномалии', from: ['Anomaly'], to: ['Sensor', 'Equipment', 'PumpStation'], cardinality: 'N:1', source: 'ML-пайплайн', markings: ['INTERNAL'] },
  { type: 'maintains', label: 'обслуживает', inverseLabel: 'заявки ТОиР', from: ['MaintenanceOrder'], to: ['Equipment'], cardinality: 'N:1', source: 'SAP PM', markings: ['INTERNAL'] },
  { type: 'performed_by', label: 'выполняет', inverseLabel: 'выполняет заявки', from: ['MaintenanceOrder'], to: ['Organization', 'Employee'], cardinality: 'N:1', source: 'SAP PM, 1С', markings: ['INTERNAL'] },
  { type: 'under_contract', label: 'по договору', inverseLabel: 'включает', from: ['MaintenanceOrder', 'Shipment'], to: ['Contract'], cardinality: 'N:1', source: 'SAP, ER по номеру', markings: ['CONFIDENTIAL'] },
  { type: 'party_to', label: 'сторона договора', inverseLabel: 'стороны', from: ['Organization', 'Subsidiary'], to: ['Contract'], cardinality: 'N:M', source: 'SAP MM, СЭД', markings: ['CONFIDENTIAL'] },
  { type: 'founder_of', label: 'учредитель', inverseLabel: 'учредители', from: ['Person', 'Organization'], to: ['Organization'], cardinality: 'N:M', source: 'ЕГРЮЛ', markings: ['CONFIDENTIAL'] },
  { type: 'director_of', label: 'директор', inverseLabel: 'директор', from: ['Person'], to: ['Organization'], cardinality: 'N:M', source: 'ЕГРЮЛ, Mention (с confidence)', markings: ['CONFIDENTIAL'] },
  { type: 'participated_in', label: 'участвовал в закупке', inverseLabel: 'участники', from: ['Organization'], to: ['Procurement'], cardinality: 'N:M', source: 'ЕИС, ЭТП', markings: ['INTERNAL'] },
  { type: 'awarded', label: 'заключён договор', inverseLabel: 'по закупке', from: ['Procurement'], to: ['Contract'], cardinality: '1:1', source: 'ЕИС', markings: ['CONFIDENTIAL'] },
  { type: 'mentions', label: 'упоминает', inverseLabel: 'упомянут в', from: ['Document'], to: ['Organization', 'Person', 'Contract', 'Equipment'], cardinality: 'N:M', source: 'NLP + ER, confidence', markings: ['INTERNAL'] },
  { type: 'attached_to', label: 'приложен к', inverseLabel: 'документы', from: ['Document'], to: ['Contract', 'Incident', 'MaintenanceOrder'], cardinality: 'N:M', source: 'СЭД', markings: ['INTERNAL'] },
  { type: 'occurred_at', label: 'произошёл на', inverseLabel: 'инциденты', from: ['Incident'], to: ['Equipment', 'PipelineSegment', 'PumpStation'], cardinality: 'N:1', source: 'Журнал', markings: ['CONFIDENTIAL'] },
  { type: 'transports', label: 'транспортируется', inverseLabel: 'отгрузки', from: ['Shipment'], to: ['Pipeline', 'Vehicle'], cardinality: 'N:1', source: 'SAP SD, телематика', markings: ['INTERNAL'] },
  { type: 'accessed_under', label: 'доступ под целью', inverseLabel: 'участники', from: ['Employee'], to: ['Purpose'], cardinality: 'N:M', source: 'PBAC', markings: ['INTERNAL'] },
  { type: 'connects', label: 'соединяет', inverseLabel: 'соединён', from: ['Pipeline'], to: ['PumpStation', 'Field', 'Tank'], cardinality: 'N:M', source: 'Реестр ОПО', markings: ['GEO'] },
]
export const LINK_BY_TYPE: Record<string, LinkDef> = Object.fromEntries(LINKS.map(l => [l.type, l]))

export const ACTIONS: ActionDef[] = [
  { name: 'flag_counterparty', label: 'Поставить контрагента на контроль', object: ['Organization'], preconditions: ['Нет активного legal hold', 'Роль СЭБ у инициатора', 'Контрагент ещё не на контроле'], writeback: 'CRM / SAP: статус блокировки', risk: 'Средний', confirmation: '1 человек', role: 'seb',
    params: [ { name: 'reason', label: 'Основание', type: 'enum', options: ['Аффилированность с участниками закупок', 'Признаки картельного сговора', 'Срыв сроков по договорам', 'Недостоверные сведения в ЕГРЮЛ'], required: true }, { name: 'until', label: 'Срок контроля', type: 'date', required: true, default: '2026-12-31' }, { name: 'comment', label: 'Комментарий', type: 'text' } ] },
  { name: 'create_maintenance_order', label: 'Создать заявку ТОиР', object: ['Equipment'], preconditions: ['Индекс состояния < 0.5 или есть Anomaly', 'Нет открытой заявки того же типа', 'Оборудование не выведено из эксплуатации'], writeback: 'SAP PM / 1С ТОиР: новая заявка', risk: 'Средний', confirmation: '1 человек', role: 'toir',
    params: [ { name: 'kind', label: 'Тип работ', type: 'enum', options: ['Внеплановый ремонт', 'Диагностика', 'ТО-2', 'Замена узла'], required: true, default: 'Диагностика' }, { name: 'priority', label: 'Приоритет', type: 'enum', options: ['Низкий', 'Средний', 'Высокий', 'Критический'], required: true, default: 'Высокий' }, { name: 'planned', label: 'Плановая дата', type: 'date', required: true, default: '2026-09-18' }, { name: 'description', label: 'Описание', type: 'text' } ] },
  { name: 'change_order_priority', label: 'Изменить приоритет заявки', object: ['MaintenanceOrder'], preconditions: ['Статус не «закрыта»'], writeback: 'SAP PM / 1С', risk: 'Низкий', confirmation: 'Автоматически по политике до порога стоимости',
    params: [ { name: 'priority', label: 'Новый приоритет', type: 'enum', options: ['Низкий', 'Средний', 'Высокий', 'Критический'], required: true } ] },
  { name: 'open_incident', label: 'Открыть инцидент', object: ['PumpStation', 'Equipment'], preconditions: ['Anomaly score > 0.8 или ручной триггер', 'Нет открытого инцидента по объекту'], writeback: 'Журнал инцидентов, СЭД', risk: 'Высокий', confirmation: '2 человека',
    params: [ { name: 'class', label: 'Класс', type: 'enum', options: ['Отклонение параметров', 'Отказ оборудования', 'Утечка', 'Нарушение режима'], required: true, default: 'Отклонение параметров' }, { name: 'description', label: 'Описание', type: 'text', required: true } ] },
  { name: 'request_documents', label: 'Запросить документы', object: ['Organization', 'Contract'], preconditions: ['Открытая закупка или проверка'], writeback: 'Почта / СЭД: исходящее письмо', risk: 'Низкий', confirmation: '1 человек',
    params: [ { name: 'docs', label: 'Документы', type: 'enum', options: ['Учредительные документы', 'Справка об отсутствии задолженности', 'Подтверждение опыта'], required: true }, { name: 'deadline', label: 'Срок ответа', type: 'date', required: true, default: '2026-09-28' } ] },
  { name: 'assign_purpose', label: 'Назначить цель доступа', object: ['Purpose'], preconditions: ['Правовое основание указано', 'Срок задан'], writeback: 'Реестр PBAC', risk: 'Высокий', confirmation: 'Владелец цели + офицер ИБ',
    params: [ { name: 'employee', label: 'Сотрудник', type: 'string', required: true }, { name: 'until', label: 'Срок', type: 'date', required: true } ] },
]
export const ACTION_BY_NAME: Record<string, ActionDef> = Object.fromEntries(ACTIONS.map(a => [a.name, a]))

export const FUNCTIONS: FunctionDef[] = [
  { name: 'equipment_health_index', label: 'Индекс состояния оборудования', input: 'наработка, аномалии за 30 дней, открытые заявки, возраст', output: '0..1', explain: true },
  { name: 'counterparty_risk_score', label: 'Риск-скор контрагента', input: 'связи учредителей, совпадения адресов/телефонов, история торгов, срывы сроков', output: '0..1 + факторы', explain: true },
  { name: 'cartel_pattern', label: 'Картельный паттерн', input: 'участники, их связи, паттерны цен', output: 'score + подграф', explain: true },
  { name: 'contract_execution_status', label: 'Статус исполнения договора', input: 'заявки, отгрузки, акты', output: '% и просрочка', explain: true },
  { name: 'subsidiary_pl', label: 'P&L ДЗО', input: 'проводки SAP/1С, курсы', output: 'P&L по статьям', explain: true },
  { name: 'freshness', label: 'Свежесть', input: 'метаданные материализации', output: 'секунды и статус SLO', explain: true },
]

export const ONTOLOGY_VERSION = '1.4.2'
export const ONTOLOGY_RELEASES = [
  { version: '1.4.2', date: '2026-09-11', author: 'ontology-council', note: 'Organization.control_flag добавлен (minor); alias cond_index → health_index продлён до 2.0.0' },
  { version: '1.4.0', date: '2026-08-28', note: 'Procurement.cartel_pattern, функция cartel_pattern v1', author: 'k.semion' },
  { version: '1.3.0', date: '2026-08-12', note: 'Equipment 1.3.0: purchase_cost под FIN, PumpStation.pressure_anomaly_score', author: 'a.volkov' },
  { version: '1.2.0', date: '2026-07-30', note: 'Переименование Equipment.cond_index → health_index (alias)', author: 'a.volkov' },
  { version: '1.1.0', date: '2026-07-15', note: 'Document/Mention, связи mentions/attached_to', author: 'nlp-team' },
  { version: '1.0.0', date: '2026-07-01', note: 'Стартовый пакет: 8 типов, 6 связей', author: 'ontology-council' },
]

export const SOURCE_LABELS: Record<string, string> = {
  sap_pm: 'SAP PM', sap_mm: 'SAP MM', sap_sd: 'SAP SD', sap_hcm: 'SAP HCM', onec: '1С', onec_toir: '1С:ТОиР', onec_zup: '1С:ЗУП',
  egrul: 'ЕГРЮЛ', eis: 'ЕИС', etp: 'ЭТП', scada: 'SCADA', opcua: 'OPC UA', historian: 'Historian', sed: 'СЭД', mail: 'Почта', files: 'Файлы',
  nlp: 'NLP', lims: 'LIMS', glonass: 'ГЛОНАСС', manual: 'Справочник', rosnedra: 'Роснедра', prod_registry: 'Справочник добычи', measurements: 'Замеры',
  opo_registry: 'Реестр ОПО', vtd: 'ВТД', incident_log: 'Журнал инцидентов', passports: 'Паспорта', crm: 'CRM', it_landscape: 'ИТ-ландшафт',
  pbac_registry: 'Реестр PBAC', gas_upravlenie: 'ГАС Управление', hr: 'HR', 'pipelines.anomaly_v3': 'anomaly_v3',
}
export const srcLabel = (s: string) => SOURCE_LABELS[s] || SOURCE_LABELS[s.split('.')[0]] || s
