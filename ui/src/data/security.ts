// Markings lattice, subjects, purposes and the PDP/PEP (spec 5.3 §3.2–3.4).
// Decision = f(subject, resource, action, environment). Deny by default; PDP unreachable ⇒ deny.

import { LEVELS, isLevel, type Marking, type Level, type ObjectType } from './ontology'
import { TYPES } from './ontology'
import type { SpObject, SpLink, Session } from './types'

export interface UserDef {
  login: string; name: string; role: string; roleLabel: string; subsidiary?: 'dobycha' | 'transport' | 'pererabotka'
  clearance: { level: Level; categories: Marking[] }
  purposes: string[]
  otp: string
}

export const USERS: UserDef[] = [
  { login: 'sc_head', name: 'Иванов А. В.', role: 'sc', roleLabel: 'Руководитель ситуационного центра', clearance: { level: 'CONFIDENTIAL', categories: ['PROD', 'GEO', 'LEGAL'] }, purposes: ['situation_monitoring', 'incident_investigation_2026_Q3', 'situation_wall'], otp: '482913' },
  { login: 'toir_eng', name: 'Галиев Р. М.', role: 'toir', roleLabel: 'Инженер ТОиР, СН-Транспорт', subsidiary: 'transport', clearance: { level: 'CONFIDENTIAL', categories: ['PROD'] }, purposes: ['toir_planning', 'situation_monitoring'], otp: '117204' },
  { login: 'seb_analyst', name: 'Смирнова Е. П.', role: 'seb', roleLabel: 'Аналитик службы экономической безопасности', clearance: { level: 'CONFIDENTIAL', categories: ['FIN', 'PII', 'LEGAL'] }, purposes: ['procurement_check', 'incident_investigation_2026_Q3'], otp: '905311' },
  { login: 'analyst_open', name: 'Козлов Д. С.', role: 'analyst', roleLabel: 'Аналитик данных (без допусков)', clearance: { level: 'INTERNAL', categories: [] }, purposes: ['toir_planning'], otp: '331870' },
]
export const DEMO_KEY = 'NickThe001'
export const MFA_ENABLED = false

export const PURPOSE_CATEGORIES: Record<string, Marking[]> = {
  situation_monitoring: ['PROD', 'GEO', 'INTERNAL', 'CONFIDENTIAL'],
  procurement_check: ['FIN', 'PII', 'CONFIDENTIAL', 'INTERNAL', 'LEGAL'],
  toir_planning: ['PROD', 'INTERNAL', 'CONFIDENTIAL'],
  finance_control: ['FIN', 'CONFIDENTIAL', 'INTERNAL'],
  incident_investigation_2026_Q3: ['LEGAL', 'CONFIDENTIAL', 'PII', 'PROD', 'GEO', 'INTERNAL'],
  situation_wall: ['INTERNAL'],
}
export const PURPOSE_LABELS: Record<string, string> = {
  situation_monitoring: 'Мониторинг ситуации', procurement_check: 'Проверка закупок', toir_planning: 'Планирование ТОиР', finance_control: 'Финансовый контроль', incident_investigation_2026_Q3: 'Расследование Q3-2026', situation_wall: 'Видеостена СЦ',
}
export const PURPOSE_BASIS: Record<string, string> = {
  situation_monitoring: 'Приказ ФСТЭК № 117, регламент СЦ-2026', procurement_check: '223-ФЗ ст. 3, положение о СЭБ', toir_planning: 'Регламент ТОиР-04', finance_control: 'Положение о бюджетировании', incident_investigation_2026_Q3: '187-ФЗ, приказ № 88', situation_wall: 'Регламент СЦ-2026',
}
export const PURPOSE_EXPIRES: Record<string, string> = {
  situation_monitoring: '31.03.2027', procurement_check: '31.12.2026', toir_planning: '30.06.2027', finance_control: '31.12.2026', incident_investigation_2026_Q3: '15.10.2026', situation_wall: '31.12.2027',
}

export function sessionFor(u: UserDef, purpose?: string): Session {
  return { login: u.login, name: u.name, role: u.role, roleLabel: u.roleLabel, clearance: { ...u.clearance }, purposes: u.purposes, purpose: purpose ?? u.purposes[0], subsidiary: u.subsidiary }
}

/** Effective clearance = subject clearance ∩ purpose allowed categories (PBAC narrows ABAC). */
export function effectiveCategories(s: Session): Set<Marking> {
  const allowed = new Set(PURPOSE_CATEGORIES[s.purpose || ''] || [])
  const out = new Set<Marking>()
  for (const c of s.clearance.categories) if (allowed.has(c)) out.add(c)
  out.add('SYNTHETIC')
  return out
}
export function effectiveLevel(s: Session): Level {
  const allowed = PURPOSE_CATEGORIES[s.purpose || ''] || []
  const cap = allowed.includes('CONFIDENTIAL') ? 'SECRET' : allowed.includes('INTERNAL') ? 'INTERNAL' : 'PUBLIC'
  const li = LEVELS.indexOf(s.clearance.level), ci = LEVELS.indexOf(cap)
  return LEVELS[Math.min(li, ci)]
}

export interface Decision { allow: boolean; id: string; reason?: string; missing?: Marking[]; alternativePurpose?: string }
let decisionSeq = 88120
export const nextDecisionId = () => `d_${decisionSeq++}`

/** Row-level check: subject must dominate every marking of the resource (bitmap_is_subset(_mk, clearance)). */
export function decide(s: Session, markings: Marking[], _action = 'read'): Decision {
  const lvl = effectiveLevel(s); const cats = effectiveCategories(s)
  const missing: Marking[] = []
  for (const m of markings) {
    if (isLevel(m)) { if (LEVELS.indexOf(m) > LEVELS.indexOf(lvl)) missing.push(m) }
    else if (!cats.has(m)) missing.push(m)
  }
  if (!missing.length) return { allow: true, id: nextDecisionId() }
  const alt = Object.entries(PURPOSE_CATEGORIES).find(([k, v]) => k !== s.purpose && missing.every(m => isLevel(m) ? v.includes('CONFIDENTIAL') : v.includes(m)) && s.purposes.includes(k))
  return { allow: false, id: nextDecisionId(), missing, reason: `маркировка ${missing.join(', ')} вне допуска под целью ${s.purpose}`, alternativePurpose: alt?.[0] }
}

export function canSee(s: Session, o: SpObject): boolean { return decide(s, o.markings).allow }
export function canSeeLink(s: Session, l: SpLink, a?: SpObject, b?: SpObject): boolean {
  // marking of a link = join of both ends ⊔ link marking (existence itself is information)
  const all = [...l.markings, ...(a?.markings || []), ...(b?.markings || [])]
  return decide(s, all).allow
}

export interface ViewedProp { name: string; value: unknown; masked: boolean; reason?: string; markings: Marking[]; partial?: boolean }
/** Column masking (spec 9.2): masked:true with reason; never the value. */
export function viewProps(s: Session, o: SpObject, presentation = false): ViewedProp[] {
  const def = TYPES[o.type]
  const lvl = effectiveLevel(s); const cats = effectiveCategories(s)
  return def.props.map(p => {
    const mk = [...(p.markings || [])]
    const value = o.props[p.name]
    const missing = mk.filter(m => isLevel(m) ? LEVELS.indexOf(m) > LEVELS.indexOf(lvl) : !cats.has(m))
    const hideForPresentation = presentation && mk.some(m => m === 'PII' || m === 'FIN')
    if (missing.length || hideForPresentation) {
      if (p.masking === 'partial' && typeof value === 'string' && !hideForPresentation && !missing.some(isLevel)) {
        return { name: p.name, value: partialMask(value), masked: true, partial: true, reason: `marking ${missing.join(', ')} not in clearance`, markings: mk }
      }
      return { name: p.name, value: null, masked: true, reason: hideForPresentation ? 'режим презентации' : `marking ${missing.join(', ')} not in clearance`, markings: mk }
    }
    return { name: p.name, value, masked: false, markings: mk }
  })
}
export function partialMask(v: string): string {
  if (/^\+?\d[\d\s-]{6,}$/.test(v)) return v.replace(/(\d)[\d\s-]+(\d{2})$/, '$1 *** *** $2')
  if (/^\d{10,12}$/.test(v)) return v.slice(0, 2) + '*'.repeat(v.length - 4) + v.slice(-2)
  const parts = v.split(' ')
  return parts.map((w, i) => (i === 0 ? w[0] + '***' : w[0] + '.')).join(' ')
}

export function markingColor(m: Marking): string {
  switch (m) { case 'PUBLIC': return 'var(--mk-public)'; case 'INTERNAL': return 'var(--mk-internal)'; case 'CONFIDENTIAL': return 'var(--mk-confidential)'; case 'SECRET': return 'var(--mk-secret)'; default: return 'var(--sp-text-2)' }
}
export const MARKING_LABEL: Record<Marking, string> = { PUBLIC: 'Открыто', INTERNAL: 'Для служебного пользования', CONFIDENTIAL: 'Конфиденциально', SECRET: 'Секретно', FIN: 'Финансовые данные', PII: 'Персональные данные', PROD: 'Производственные данные', GEO: 'Геолого-промысловые данные', HR: 'Кадровые данные', LEGAL: 'Юридически значимые', SYNTHETIC: 'Синтетические данные стенда' }

export const ROLE_ACTIONS: Record<string, string[]> = {
  sc: ['open_incident', 'change_order_priority', 'request_documents'],
  toir: ['create_maintenance_order', 'change_order_priority', 'open_incident'],
  seb: ['flag_counterparty', 'request_documents'],
  analyst: [],
  admin: ['assign_purpose'],
}
export function canExecute(s: Session, action: string): boolean { return (ROLE_ACTIONS[s.role] || []).includes(action) }

/** Marking lattice join for transformations (⊔). */
export function joinMarkings(...sets: Marking[][]): Marking[] {
  let level: Level = 'PUBLIC'; const cats = new Set<Marking>()
  for (const s of sets) for (const m of s) { if (isLevel(m)) { if (LEVELS.indexOf(m) > LEVELS.indexOf(level)) level = m } else cats.add(m) }
  return [level, ...cats]
}

export const POLICY_LOG = [
  { id: 'pol_12', ts: '2026-09-13 18:40', author: 'p.orlov (Policy Eng)', name: 'abac_fin_v12', summary: 'FIN доступен только под целями procurement_check и finance_control', diff: ['- permit(principal, action == "read", resource) when { resource.markings.contains("FIN") && principal.categories.contains("FIN") };', '+ permit(principal, action == "read", resource) when { resource.markings.contains("FIN") && principal.categories.contains("FIN") && ["procurement_check","finance_control"].contains(context.purpose) };'], signature: 'ok', tests: '30/30' },
  { id: 'pol_11', ts: '2026-09-10 11:02', author: 'p.orlov (Policy Eng)', name: 'pbac_purpose_expiry', summary: 'Автоматический отзыв доступа по истечении срока цели', diff: ['+ forbid(principal, action, resource) when { context.purpose_expires_at < context.now };'], signature: 'ok', tests: '30/30' },
  { id: 'pol_10', ts: '2026-09-04 09:15', author: 'a.volkov (Security Architect)', name: 'link_marking_join', summary: 'Маркировка связи = ⊔ маркировок обоих концов', diff: ['+ // link visibility requires dominance over both ends', '+ forbid(principal, action == "traverse", resource) unless { principal.clearance.dominates(resource.from.markings) && principal.clearance.dominates(resource.to.markings) };'], signature: 'ok', tests: '28/28' },
  { id: 'pol_09', ts: '2026-08-27 16:30', author: 'p.orlov (Policy Eng)', name: 'agg_k_anonymity', summary: 'Порог k=5 для агрегатов по недоступным строкам', diff: ['+ forbid(principal, action == "aggregate", resource) when { resource.group_size < 5 && !principal.clearance.dominates(resource.markings) };'], signature: 'ok', tests: '26/26' },
]
