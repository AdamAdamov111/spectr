import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Map as MapIcon, Share2, Zap, ChevronRight } from 'lucide-react'
import { get as getObject, neighbors, linkCounts, history, audit, subscribeWorkflows, allWorkflows, traverse } from '../data/api'
import { TYPES, ACTIONS, LINK_BY_TYPE, srcLabel, type PropDef } from '../data/ontology'
import { viewProps, canExecute, decide, PURPOSE_LABELS } from '../data/security'
import { useStore, useSimulatedSession, reducedMotion } from '../app/store'
import { Markings, Freshness, ObjectChip, Masked, formatProp, Scramble, PolicyDenied, CopyButton, PinButton, TypeIcon, SourceTag, Confidence, Empty, Stamp } from '../components/ui'
import { ExplainView } from './Explain'
import { ForceGraph, type GNode, type GLink } from '../graph/ForceGraph'
import { fmtDateTime, fmtAgo } from '../data/rng'
import type { SpObject } from '../data/types'

type TabKey = 'props' | 'links' | 'history' | 'docs' | 'actions' | 'explain' | 'audit'
const SRC_BADGE: Record<string, string> = { sap_pm: 'SAP', sap_mm: 'SAP', sap_sd: 'SAP', sap_hcm: 'SAP', onec: '1С', onec_toir: '1С', onec_zup: '1С', egrul: 'ЕГРЮЛ', eis: 'ЕИС', etp: 'ЭТП', scada: 'SCADA', opcua: 'OPC UA', sed: 'СЭД', mail: 'ПОЧТА', passports: 'ПАСПОРТ', nlp: 'NLP', lims: 'LIMS', glonass: 'ГЛОНАСС', manual: 'СПРАВ.', rosnedra: 'РОСНЕДРА', prod_registry: 'ДОБЫЧА', measurements: 'ЗАМЕРЫ', historian: 'HIST', 'pipelines.anomaly_v3': 'ML', incident_log: 'ЖУРНАЛ', vtd: 'ВТД', opo_registry: 'ОПО', it_landscape: 'ИТ', pbac_registry: 'PBAC', crm: 'CRM', hr: 'HR', mail_: 'MAIL' }

export function ObjectCard({ id, compact }: { id: string; compact?: boolean }) {
  const o = getObject(id)
  const session = useSimulatedSession()
  const openObject = useStore(s => s.openObject); const openExplain = useStore(s => s.openExplain); const openAction = useStore(s => s.openAction); const focusMap = useStore(s => s.focusMap); const openTab = useStore(s => s.openTab)
  const presentation = useStore(s => s.settings.presentation)
  const [tab, setTab] = useState<TabKey>('props')
  const [assemble, setAssemble] = useState(false)
  const [, force] = useState(0)
  useEffect(() => subscribeWorkflows(() => force(x => x + 1)), [])
  useEffect(() => { setTab('props'); if (o && useStore.getState().markAssembled(o.id) && !reducedMotion()) { setAssemble(true); const t = setTimeout(() => setAssemble(false), 700); return () => clearTimeout(t) } }, [id])
  if (!o) return <Empty text="Объект не найден или удалён" />
  const dec = decide(session, o.markings)
  if (!dec.allow) return <div style={{ padding: 16 }}><PolicyDenied markings={o.markings} alternative={dec.alternativePurpose} title={`${TYPES[o.type].label}: доступ запрещён`} /></div>
  const def = TYPES[o.type]
  const counts = linkCounts(session, o.id)
  const linksN = counts.reduce((a, c) => a + c.count, 0)
  const docsN = neighbors(session, o.id, { types: ['mentions', 'attached_to'] }).filter(n => n.other.type === 'Document').length
  const hist = history(o)
  const actions = ACTIONS.filter(a => a.object.includes(o.type))
  const auditN = audit.events.filter(e => e.resource_ids.includes(o.id)).length
  const wf = allWorkflows().find(w => w.objectId === o.id && (w.status === 'running' || w.status === 'rejected'))
  const merged = o.history?.some(h => h.causeKind === 'er')
  return (
    <div className={`objcard ${compact ? 'objcard-compact' : ''}`}>
      <header className="objcard-h">
        <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <span className="obj-type"><TypeIcon type={o.type} size={compact ? 14 : 18} /><span>{def.label}</span></span>
          <span className="grow" />
          <Freshness o={o} />
          <span className="dim mono" style={{ fontSize: 11 }}>v{o.version}</span>
          <PinButton id={o.id} />
          {compact && <button className="btn-icon" title="Открыть во вкладке" onClick={() => openObject(o.id, { tab: true })}><ExternalLink size={14} /></button>}
        </div>
        <div className="obj-title-row">
          <h2 className="obj-title"><Scramble text={o.label} once={`title:${o.id}`} /></h2>
          {assemble && <span className="assemble">{o.sources.map((s, i) => <span key={s} className="assemble-badge" style={{ ['--i' as string]: i, ['--n' as string]: o.sources.length }}>{SRC_BADGE[s] || s.toUpperCase()}</span>)}</span>}
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <Markings list={o.markings} />
          <span className="mono dim" style={{ fontSize: 11 }}>{o.id}</span>
          <CopyButton text={o.id} label="ID" confidential={o.markings.includes('CONFIDENTIAL')} />
          <span className="dim" style={{ fontSize: 11 }}>источники: {o.sources.map(srcLabel).join(' · ')}</span>
        </div>
        {o.status === 'pending_writeback' && <div className="pending-bar" style={{ marginTop: 8 }}>◔ Ожидает подтверждения источником ({wf?.target?.split(':')[0] || '1С'}) · статус pending_writeback · версия {o.version}</div>}
        {o.status === 'rejected' && <div className="pending-bar rejected-bar" style={{ marginTop: 8 }}>✕ Источник отклонил запись. Локальные изменения откачены компенсацией. <button className="btn btn-xs" onClick={() => wf && openTab({ kind: 'action', action: wf.action, objectId: o.id, title: `Действие: ${o.label}`, params: wf.params })}>Открыть воркфлоу</button></div>}
        {merged && <div className="er-banner">⧉ Golden-объект собран Entity Resolution из {o.sources.length} источников · <button className="link" onClick={() => setTab('history')}>история слияний</button></div>}
      </header>
      <div className="tabs">
        {([['props', 'Свойства', def.props.length], ['links', 'Связи', linksN], ['history', 'История', hist.length], ['docs', 'Документы', docsN], ['actions', 'Действия', actions.length], ['explain', 'Explain', null], ['audit', 'Аудит', auditN]] as [TabKey, string, number | null][]).map(([k, l, n]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}{n != null && <span className="n">{n}</span>}</button>)}
      </div>
      <div className="objcard-b xfade" key={tab}>
        {tab === 'props' && <PropsTab o={o} compact={compact} />}
        {tab === 'links' && <LinksTab o={o} compact={compact} />}
        {tab === 'history' && <div className="tl">{hist.map((h, i) => <div key={h.version} className={`tl-item ${h.causeKind}`} style={{ animationDelay: `${i * 30}ms` }}><div className="row"><b>v{h.version}</b><span className="dim mono" style={{ fontSize: 11 }}>{fmtDateTime(h.ts)}</span><span className={`pill ${h.causeKind === 'action' ? 'accent' : ''}`} style={{ fontSize: 10 }}>{h.causeKind === 'action' ? '⚡ ' : h.causeKind === 'er' ? '⧉ ' : '⟲ '}{h.cause}{h.actor ? ` · ${h.actor}` : ''}</span></div><div className="diff" style={{ marginTop: 4 }}>{h.diff.map(d => <div key={d.prop}><span className="dim">{d.prop}: </span><span className="del">{String(d.before ?? '∅')}</span> → <span className="add">{String(d.after ?? '∅')}</span></div>)}</div></div>)}</div>}
        {tab === 'docs' && <DocsTab o={o} />}
        {tab === 'actions' && (
          <div className="col" style={{ gap: 8 }}>
            {!actions.length && <Empty text="Для этого типа действия не определены" />}
            {actions.map(a => { const ok = canExecute(session, a.name); return <div key={a.name} className="action-row"><div><div className="row"><Zap size={13} className={ok ? 'accent' : 'dim'} /><b>{a.label}</b><span className={`pill ${a.risk === 'Высокий' ? 'danger' : ''}`} style={{ fontSize: 10 }}>риск: {a.risk}</span></div><div className="dim" style={{ fontSize: 11, marginTop: 2 }}>Write-back: {a.writeback} · подтверждение: {a.confirmation}</div>{!ok && <div className="dim" style={{ fontSize: 11 }}>Нет права action:execute:{a.name} у роли «{session.roleLabel}» — предпросмотр доступен</div>}</div><button className={`btn ${ok ? 'btn-primary' : ''}`} onClick={() => openAction(a.name, o.id)}>{ok ? 'Предпросмотр' : 'Открыть'}</button></div> })}
            <div className="section-h">Навигация</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => openTab({ kind: 'screen', screen: 'graph', title: 'Граф связей', id: 's:graph' })} draggable={false}><Share2 size={13} /> В граф</button>
              {o.geo && <button className="btn" onClick={() => focusMap(o.id)}><MapIcon size={13} /> На карте</button>}
              <button className="btn" onClick={() => openExplain(o.id, def.props.find(p => p.derived_by)?.name || def.props.find(p => p.key)?.name || def.props[0].name, !compact)}>Explain</button>
            </div>
          </div>
        )}
        {tab === 'explain' && <ExplainTab o={o} compact={compact} />}
        {tab === 'audit' && <AuditTab o={o} />}
      </div>
    </div>
  )
  function PropsTab({ o, compact }: { o: SpObject; compact?: boolean }) {
    const vp = viewProps(session, o, presentation)
    return (
      <div>
        {vp.map(p => { const d = def.props.find(x => x.name === p.name)!; return <PropRow key={p.name} o={o} d={d} value={p.value} masked={p.masked} partial={p.partial} reason={p.reason} onExplain={() => openExplain(o.id, p.name, !compact)} /> })}
        {o.crosswalk && (<><div className="section-h">Entity Resolution · crosswalk</div><table className="xw"><thead><tr><th>Система</th><th>Ключ</th><th>Score</th><th>Правило</th></tr></thead><tbody>{o.crosswalk.map(c => <tr key={c.system + c.key}><td><SourceTag s={c.system} /></td><td className="mono">{c.key}</td><td className="mono">{c.score.toFixed(2)}</td><td className="dim">{c.rule}</td></tr>)}</tbody></table></>)}
        {o.props.control_flag === true && <div className="row" style={{ marginTop: 10 }}><Stamp text="На контроле СЭБ" tone="warn" /><span className="dim" style={{ fontSize: 11 }}>{String(o.props.control_reason || '')} · до {String(o.props.control_until || '')}</span></div>}
      </div>
    )
  }
  function LinksTab({ o, compact }: { o: SpObject; compact?: boolean }) {
    const [open, setOpen] = useState<string | null>(null)
    const [mini, setMini] = useState<string | null>(null)
    const ns = open ? neighbors(session, o.id, { types: [open.split('|')[0] as never] }).filter(n => n.direction === open.split('|')[1]) : []
    const g = useMemo(() => { if (!mini) return null; const t = traverse(session, [o.id], 1, { types: [mini.split('|')[0] as never], maxPerNode: 30 }); const nodes: GNode[] = t.nodes.map(n => ({ id: n.id, label: n.label, type: n.type, color: TYPES[n.type].color, hidden: t.hidden.has(n.id), root: n.id === o.id, parent: n.id === o.id ? undefined : o.id })); const links: GLink[] = t.links.map(l => ({ id: l.id, from: l.from, to: l.to, confidence: l.confidence, type: l.type, label: LINK_BY_TYPE[l.type].label })); return { nodes, links } }, [mini, o.id])
    return (
      <div>
        {!counts.length && <Empty text="Связей, доступных под текущей целью, нет" />}
        {counts.map(c => { const key = `${c.type}|${c.direction}`; return <div key={key}><div role="button" tabIndex={0} className={`link-group ${open === key ? 'active' : ''}`} onClick={() => setOpen(open === key ? null : key)} onKeyDown={e => { if (e.key === 'Enter') setOpen(open === key ? null : key) }}><ChevronRight size={12} style={{ transform: open === key ? 'rotate(90deg)' : 'none', transition: 'transform var(--mo-fast)' }} /><span>{c.label}</span><span className="dim mono" style={{ fontSize: 11 }}>{c.count}</span><span className="grow" /><span className="mk mk-cat mk-sm">{LINK_BY_TYPE[c.type].markings.join(',')}</span><button className="btn btn-xs" onClick={e => { e.stopPropagation(); setMini(mini === key ? null : key) }}>мини-граф</button></div>
          {mini === key && g && <div className="mini-graph"><ForceGraph nodes={g.nodes} links={g.links} onSelect={id => id && openObject(id)} onExpand={id => openObject(id, { tab: true })} mini theme={useStore.getState().settings.theme} /></div>}
          {open === key && <div className="link-list">{ns.slice(0, compact ? 20 : 60).map(n => <div key={n.link.id} className="row" style={{ gap: 6 }}><ObjectChip o={n.other} />{n.link.confidence < 1 && <Confidence v={n.link.confidence} note={`${n.link.source === 'nlp' ? 'модель natasha-ner v1.4' : n.link.source}, confidence ${n.link.confidence}`} />}{n.link.props?.share != null && <span className="dim mono" style={{ fontSize: 11 }}>{String(n.link.props.share)} %</span>}{n.link.props?.role != null && <span className="dim" style={{ fontSize: 11 }}>{String(n.link.props.role)}</span>}</div>)}{ns.length > (compact ? 20 : 60) && <div className="dim" style={{ fontSize: 11 }}>… ещё {ns.length - (compact ? 20 : 60)}; откройте граф для полного обхода</div>}</div>}
        </div> })}
      </div>
    )
  }
  function DocsTab({ o }: { o: SpObject }) {
    const docs = neighbors(session, o.id, { types: ['mentions', 'attached_to'] }).filter(n => n.other.type === 'Document')
    if (!docs.length) return <Empty text="Документов, связанных с объектом, нет" />
    return <div className="col" style={{ gap: 4 }}>{docs.slice(0, 50).map(n => { const d = n.other; return <div key={n.link.id} className="doc-row" onClick={() => openObject(d.id)}><span className="pill" style={{ fontSize: 10 }}>{String(d.props.kind)}</span><span className="grow truncate">{d.label}</span>{d.props.ocr === true && <span className="dim" style={{ fontSize: 10 }}>OCR</span>}<span className="dim" style={{ fontSize: 11 }}>{String(d.props.source)}</span><span className="dim mono" style={{ fontSize: 11 }}>{String(d.props.date)}</span>{n.link.confidence < 1 && <Confidence v={n.link.confidence} note={`natasha-ner v1.4, confidence ${n.link.confidence}`} />}</div> })}</div>
  }
  function ExplainTab({ o, compact }: { o: SpObject; compact?: boolean }) {
    const candidates = def.props.filter(p => p.derived_by || p.key)
    const [prop, setProp] = useState(candidates.find(p => p.derived_by)?.name || candidates[0]?.name || def.props[0].name)
    return <div className="col" style={{ height: '100%', gap: 8 }}><div className="row"><span className="label" style={{ margin: 0 }}>Свойство</span><select className="input" style={{ width: 240 }} value={prop} onChange={e => setProp(e.target.value)}>{def.props.map(p => <option key={p.name} value={p.name}>{p.label}{p.derived_by ? ' ƒ' : ''}</option>)}</select>{!compact ? null : <button className="btn btn-xs" onClick={() => openExplain(o.id, prop, true)}>Во вкладку</button>}</div><div style={{ flex: 1, minHeight: 320 }}><ExplainView id={o.id} prop={prop} key={prop} /></div></div>
  }
  function AuditTab({ o }: { o: SpObject }) {
    const evs = audit.events.filter(e => e.resource_ids.includes(o.id)).slice(-30).reverse()
    if (!evs.length) return <Empty text="Событий аудита по объекту пока нет" />
    return <table className="xw"><thead><tr><th>Время</th><th>Субъект</th><th>Цель</th><th>Действие</th><th>Решение</th></tr></thead><tbody>{evs.map(e => <tr key={e.id}><td className="mono dim">{fmtDateTime(e.ts)}</td><td>{e.actor}</td><td className="dim">{PURPOSE_LABELS[e.purpose] || e.purpose}</td><td className="mono">{e.action}</td><td><span className={e.outcome === 'allow' ? 'ok-text' : 'danger-text'}>{e.outcome}</span> <span className="dim mono" style={{ fontSize: 10 }}>{e.policy_decision_id}</span></td></tr>)}</tbody></table>
  }
}

export function PropRow({ o, d, value, masked, partial, reason, onExplain }: { o: SpObject; d: PropDef; value: unknown; masked: boolean; partial?: boolean; reason?: string; onExplain: () => void }) {
  const meta = o.meta[d.name]
  const src = meta?.source || d.sources?.[0]
  const derived = meta?.derived_by || d.derived_by
  const title = derived ? `ƒ ${derived}` : src ? `${srcLabel(src)} · ${src}${meta?.sourceTs ? ' · ' + fmtDateTime(meta.sourceTs) : ''}` : 'источник: справочник'
  return (
    <div className="prop-row" title={`${title} · клик: Explain`} onClick={onExplain}>
      <span className="pl">{d.label}{derived && <span className="fx" title={derived}>ƒ</span>}{d.markings?.length ? <span className="mk mk-cat mk-sm">{d.markings.join(',')}</span> : null}</span>
      <span className="pv">{masked && !partial ? <Masked reason={reason} markings={d.markings} /> : <span className={masked ? 'dim' : ''}>{formatProp(value, d.type, d.unit)}</span>}{d.live && !masked && <span className="prop-src">{meta?.sourceTs ? fmtAgo((Date.now() - meta.sourceTs) / 1000) : ''}</span>}{src && !derived && <span className="prop-src">{srcLabel(src)}</span>}</span>
    </div>
  )
}
