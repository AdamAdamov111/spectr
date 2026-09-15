// Domain packs (industry ontology packages). The core (Object API, PDP, explain, actions, audit) is domain-agnostic;
// a pack contributes asset types, a synthetic holding, KPI definitions and demo scenario texts.
import type { ObjectType } from './ontology'

export type DomainKey = 'oilgas' | 'energy'

export interface DzoSpec { key: string; name: string; kind: string; erp: string; region: string; emp: number }
export interface DomainSpec {
  key: DomainKey
  label: string                 // «Нефтегаз и трубопроводный транспорт»
  holding: string               // «Северная нефть»
  holdingFull: string
  dzo: DzoSpec[]
  hubType: ObjectType           // PumpStation | Substation — the asset with the demo anomaly
  distType: ObjectType          // Tank | Substation(110) — small dots on the map
  unitType: ObjectType          // Well | Feeder
  areaType: ObjectType          // Field | GridArea
  linearType: ObjectType        // Pipeline | PowerLine
  linearUnit: string            // м³/ч | МВт
  legend: { color: string; label: string }[]
  focusProp: string             // pressure_anomaly_score | transformer_anomaly_score
  anomalyLabel: string
  contractSubjects: string[]
  incidentClasses: string[]
  equipmentClasses: readonly (readonly [string, string, number])[]
  sensorKinds: readonly (readonly [string, string, string, number, number])[]
  agentSuggest: string[]
  scenarioQuestion: string
  scenarioKeywords: string[]
  savedQueries: { label: string; type: ObjectType; pred?: string }[]
  unitLabelInWork: string       // «скважин в работе» | «фидеров под нагрузкой»
  layerLabels: Record<string, string> // map layer names (keys of MapLayers)
  incidentsKpi: string          // «Инциденты» | «Тех. нарушения»
}

export const DOMAINS: Record<DomainKey, DomainSpec> = {
  oilgas: {
    key: 'oilgas', label: 'Нефтегаз и трубопроводный транспорт', holding: 'НГК России', holdingFull: 'Демо-контур «Нефтегазовый комплекс России» (открытые данные + синтетика)',
    dzo: [
      { key: 'a', name: 'Добыча', kind: 'добыча', erp: 'SAP ECC 6.0', region: 'ХМАО — Югра', emp: 4200 },
      { key: 'b', name: 'Транспорт', kind: 'магистральный транспорт', erp: '1С:ERP + 1С:ТОиР', region: 'Москва', emp: 2100 },
      { key: 'c', name: 'Переработка', kind: 'переработка', erp: '1С:ERP', region: 'Омская область', emp: 3300 },
    ],
    hubType: 'PumpStation', distType: 'Refinery', unitType: 'Field', areaType: 'Field', linearType: 'Pipeline', linearUnit: 'тыс. т/сут',
    legend: [{ color: '#9d8be8', label: 'месторождения' }, { color: '#8abbff', label: 'НПС и нефтепроводы' }, { color: '#ec9a3c', label: 'НПЗ' }, { color: '#f6f7f9', label: 'терминалы' }, { color: '#e76a6e', label: 'аномалии и инциденты' }],
    focusProp: 'pressure_anomaly_score', anomalyLabel: 'Рост давления',
    contractSubjects: ['ТОиР насосного оборудования', 'Поставка запорной арматуры', 'Внутритрубная диагностика', 'Строительно-монтажные работы', 'Транспортные услуги', 'Капитальный ремонт скважин', 'Поставка КИПиА', 'Сервис компрессорного оборудования', 'Ремонт резервуаров', 'Изоляционные работы', 'Электромонтажные работы', 'Геофизические исследования', 'Поставка труб', 'Экспертиза промышленной безопасности', 'Аренда спецтехники', 'Охрана объектов', 'Услуги по обращению с отходами', 'Проектно-изыскательские работы'],
    incidentClasses: ['Отклонение параметров', 'Отказ оборудования', 'Утечка', 'Нарушение режима', 'Возгорание', 'Остановка'],
    equipmentClasses: [['PUMP', 'Насос', 0.13], ['VALVE', 'Задвижка', 0.2], ['COMPRESSOR', 'Компрессор', 0.05], ['TANK', 'Ёмкость', 0.06], ['MOTOR', 'Электродвигатель', 0.1], ['HEAT_EXCHANGER', 'Теплообменник', 0.05], ['FILTER', 'Фильтр', 0.08], ['SEPARATOR', 'Сепаратор', 0.05], ['METER', 'Расходомер', 0.08], ['DRIVE', 'Привод', 0.08], ['TRANSFORMER', 'Трансформатор', 0.04], ['OTHER', 'Прочее', 0.08]],
    sensorKinds: [['P', 'давление', 'МПа', 2, 7], ['V', 'вибрация', 'мм/с', 0.5, 6], ['T', 'температура', '°C', 20, 95]],
    agentSuggest: ['Какие подрядчики {focus} связаны с ООО Вектор и сорвали сроки за квартал?', 'Какое оборудование откажет первым?', 'Справка по ООО Стрела', 'Что известно о {equipment}?', 'Кто такой Иванов И.И.?'],
    scenarioQuestion: 'Какие подрядчики {focus} связаны с ООО Вектор и сорвали сроки за квартал?', scenarioKeywords: ['сковородино', 'нпс-21'],
    savedQueries: [{ label: 'Оборудование с индексом < 0.5', type: 'Equipment', pred: 'health' }, { label: 'Контрагенты с риском > 0.6', type: 'Organization', pred: 'risk' }, { label: 'Просроченные договоры', type: 'Contract', pred: 'overdue' }, { label: 'Открытые заявки ТОиР', type: 'MaintenanceOrder', pred: 'open' }, { label: 'Закупки с картельным паттерном', type: 'Procurement', pred: 'cartel' }, { label: 'Месторождения (открытые данные)', type: 'Field' }, { label: 'НПЗ по мощности', type: 'Refinery' }],
    unitLabelInWork: 'месторождений с данными добычи',
    layerLabels: { basemap: 'Подложка (Natural Earth)', fields: 'Месторождения (размер ∝ добыче)', pipelines: 'Магистральные нефтепроводы', nps: 'НПС', refineries: 'НПЗ', terminals: 'Терминалы и узлы', wells: 'Скважины (эталон Volve)', anomalies: 'Аномалии', incidents: 'Инциденты', heat: 'Тепловая карта рисков контрагентов' },
    incidentsKpi: 'Инциденты',
  },
  energy: {
    key: 'energy', label: 'Электросетевой комплекс', holding: 'Северные сети', holdingFull: 'ПАО «Северные сети»',
    dzo: [
      { key: 'a', name: 'СС-Магистраль', kind: 'передача 220 кВ', erp: 'SAP ECC 6.0', region: 'Архангельская область', emp: 3100 },
      { key: 'b', name: 'СС-Распределение', kind: 'распределение 110/10 кВ', erp: '1С:ERP + 1С:ТОиР', region: 'Архангельская область', emp: 5400 },
      { key: 'c', name: 'СС-Генерация', kind: 'генерация', erp: '1С:ERP', region: 'Вологодская область', emp: 1800 },
    ],
    hubType: 'Substation', distType: 'Substation', unitType: 'Feeder', areaType: 'GridArea', linearType: 'PowerLine', linearUnit: 'МВт',
    legend: [{ color: '#9d8be8', label: 'фидеры 10 кВ' }, { color: '#4c90f0', label: 'ПС 220 и 110 кВ' }, { color: '#e76a6e', label: 'аномалии и нарушения' }, { color: '#abb3bf', label: 'бригады ОВБ' }],
    focusProp: 'transformer_anomaly_score', anomalyLabel: 'Рост температуры масла',
    contractSubjects: ['ТОиР силовых трансформаторов', 'Поставка выключателей 110 кВ', 'Тепловизионное обследование ВЛ', 'Строительно-монтажные работы на ПС', 'Расчистка просек ВЛ', 'Капитальный ремонт ВЛ 220 кВ', 'Поставка РЗА и телемеханики', 'Сервис элегазового оборудования', 'Замена опор ВЛ', 'Модернизация АСУ ТП подстанций', 'Электромонтажные работы', 'Диагностика кабельных линий', 'Поставка провода и арматуры', 'Экспертиза промышленной безопасности', 'Аренда спецтехники', 'Охрана объектов', 'Утилизация трансформаторного масла', 'Проектно-изыскательские работы'],
    incidentClasses: ['Технологическое нарушение', 'Отключение потребителей', 'Повреждение ВЛ', 'Отказ выключателя', 'Пожар на ПС', 'Работа РЗА'],
    equipmentClasses: [['TRANSFORMER', 'Трансформатор', 0.12], ['BREAKER', 'Выключатель', 0.2], ['DISCONNECTOR', 'Разъединитель', 0.14], ['CT', 'Трансформатор тока', 0.1], ['VT', 'Трансформатор напряжения', 0.06], ['REACTOR', 'Реактор', 0.03], ['RELAY', 'Терминал РЗА', 0.1], ['BATTERY', 'Аккумуляторная батарея', 0.04], ['CAPACITOR', 'Конденсаторная установка', 0.04], ['CABLE', 'Кабельная линия', 0.07], ['TOWER', 'Опора', 0.06], ['OTHER', 'Прочее', 0.04]],
    sensorKinds: [['T', 'температура масла', '°C', 35, 85], ['I', 'ток', 'А', 120, 900], ['U', 'напряжение', 'кВ', 216, 236]],
    agentSuggest: ['Какие подрядчики ПС Северная-220 связаны с ООО Вектор и сорвали сроки за квартал?', 'Какое оборудование откажет первым?', 'Справка по ООО Стрела', 'Что известно об АТ-1?', 'Кто такой Иванов И.И.?'],
    scenarioQuestion: 'Какие подрядчики ПС Северная-220 связаны с ООО Вектор и сорвали сроки за квартал?', scenarioKeywords: ['северная-220', 'северная 220'],
    savedQueries: [{ label: 'Оборудование с индексом < 0.5', type: 'Equipment', pred: 'health' }, { label: 'Контрагенты с риском > 0.6', type: 'Organization', pred: 'risk' }, { label: 'Просроченные договоры', type: 'Contract', pred: 'overdue' }, { label: 'Открытые заявки ТОиР', type: 'MaintenanceOrder', pred: 'open' }, { label: 'Закупки с картельным паттерном', type: 'Procurement', pred: 'cartel' }, { label: 'Фидеры с перегрузкой', type: 'Feeder', pred: 'trend' }],
    unitLabelInWork: 'фидеров под нагрузкой',
    layerLabels: { basemap: 'Подложка', fields: 'Районы сетей (РЭС)', pipelines: 'ЛЭП (поток ∝ перетоку)', wells: 'Фидеры и ПС 35 кВ', nps: 'ПС 220 кВ', tanks: 'ПС 110 кВ (загрузка)', vehicles: 'Бригады ОВБ (ГЛОНАСС)', anomalies: 'Аномалии', incidents: 'Технологические нарушения', heat: 'Тепловая карта рисков контрагентов' },
    incidentsKpi: 'Тех. нарушения',
  },
}

const KEY = 'spectr.domain'
export function currentDomainKey(): DomainKey {
  try { const v = localStorage.getItem(KEY); if (v === 'energy' || v === 'oilgas') return v } catch { /* ignore */ }
  return 'oilgas'
}
export function setDomainKey(k: DomainKey) { try { localStorage.setItem(KEY, k) } catch { /* ignore */ } }
export const currentDomain = () => DOMAINS[currentDomainKey()]
