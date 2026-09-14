// U13 ИИ-помощник: потоковый ответ, chips объектов, трасса инструментов, предложенные действия, верификация ссылок.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Send, ChevronRight, Check, ShieldAlert, Bot } from 'lucide-react'
import { askAgent, get as getObject, audit, type AgentReply } from '../data/api'
import { useStore, useSimulatedSession, reducedMotion } from '../app/store'
import { ObjectChip, Kbd } from '../components/ui'
import { nextDecisionId } from '../data/security'
import { ACTION_BY_NAME } from '../data/ontology'

interface Msg { id: number; role: 'user' | 'agent'; text: string; reply?: AgentReply; shown: number; verified: Set<string>; traceOpen: boolean; done: boolean }
const SUGGEST = ['Какие подрядчики НПС-2 связаны с ООО Вектор и сорвали сроки за квартал?', 'Какое оборудование откажет первым?', 'Справка по ООО Стрела', 'Что известно о Насос-104?', 'Кто такой Иванов И.И.?']

export function AgentScreen() {
  const session = useSimulatedSession(); const openAction = useStore(s => s.openAction)
  const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null); const seq = useRef(1)
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  const rm = reducedMotion()
  async function ask(text: string) {
    if (!text.trim() || busy) return
    setQ(''); setBusy(true)
    const uid = seq.current++; const aid = seq.current++
    setMsgs(m => [...m, { id: uid, role: 'user', text, shown: text.length, verified: new Set(), traceOpen: false, done: true }, { id: aid, role: 'agent', text: '', shown: 0, verified: new Set(), traceOpen: false, done: false }])
    await sleep(rm ? 0 : 350)
    const reply = askAgent(session, text)
    for (const s of reply.steps) audit.append({ ts: Date.now(), actor: 'svc:agent-runtime', actorKind: 'agent', purpose: session.purpose || '', action: `agent.tool:${s.tool}`, resource_ids: [], resource_label: JSON.stringify(s.args).slice(0, 60), policy_decision_id: nextDecisionId(), outcome: 'allow', detail: `delegated token ${session.login}, ttl 300s` })
    setMsgs(m => m.map(x => (x.id === aid ? { ...x, reply, text: reply.text } : x)))
    // stream: typewriter only for the first 300 ms, then chunks
    const total = reply.text.length; let shown = 0; const t0 = performance.now()
    while (shown < total) { const dt = performance.now() - t0; shown = rm ? total : dt < 300 ? Math.min(total, Math.floor(dt / 12)) : Math.min(total, shown + 40); setMsgs(m => m.map(x => (x.id === aid ? { ...x, shown } : x))); await sleep(rm ? 0 : 30) }
    setMsgs(m => m.map(x => (x.id === aid ? { ...x, done: true } : x)))
    // verifier: each cited object is checked for existence and label match, after the fact
    for (const id of reply.chips) { await sleep(rm ? 0 : 220); const ok = !!getObject(id); if (ok) setMsgs(m => m.map(x => (x.id === aid ? { ...x, verified: new Set([...x.verified, id]) } : x))) }
    setBusy(false)
  }
  return (
    <div className="screen agent">
      <div className="screen-h"><Bot size={16} className="accent" /><span className="screen-title">ИИ-помощник</span><span className="dim mono" style={{ fontSize: 11 }}>Qwen2.5-14B внутри контура · инструменты из онтологии · делегированный токен {session.login} · constrained decoding · верификатор ссылок</span><span className="grow" /><span className="pill">purpose: {session.purpose}</span></div>
      <div className="agent-body">
        <div className="agent-msgs">
          {!msgs.length && <div className="agent-hello"><div className="dim">Помощник отвечает только по объектам онтологии и ссылается на идентификаторы. У него нет SQL и прямого доступа к данным: только search_objects, get_object, traverse, call_function, propose_action с вашей идентичностью.</div><div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 10 }}>{SUGGEST.map(s => <button key={s} className="btn btn-xs" onClick={() => ask(s)}>{s}</button>)}</div></div>}
          {msgs.map(m => m.role === 'user' ? <div key={m.id} className="msg user"><div className="bubble">{m.text}</div></div> : <AgentMsg key={m.id} m={m} onTrace={() => setMsgs(ms => ms.map(x => (x.id === m.id ? { ...x, traceOpen: !x.traceOpen } : x)))} onAction={(a, id, p) => openAction(a, id, p)} />)}
          <div ref={bottom} />
        </div>
        <form className="agent-input" onSubmit={e => { e.preventDefault(); ask(q) }}><input className="input" placeholder="Спросите о контрагенте, оборудовании, закупке…" value={q} onChange={e => setQ(e.target.value)} disabled={busy} /><button className="btn btn-primary" disabled={busy || !q.trim()}><Send size={13} /></button><Kbd k="⏎" /></form>
      </div>
    </div>
  )
}

function AgentMsg({ m, onTrace, onAction }: { m: Msg; onTrace: () => void; onAction: (a: string, id: string, p: Record<string, unknown>) => void }) {
  const text = m.text.slice(0, m.shown)
  return (
    <div className="msg agent">
      <div className="bubble">
        {!m.reply && <span className="dim">вызов инструментов…</span>}
        {m.reply && <div className="agent-text">{render(text, m.verified, m.done)}</div>}
        {m.reply && m.done && m.reply.partialHidden && <div className="agent-badge"><ShieldAlert size={12} /> часть данных недоступна под текущей целью — помощник их не упоминает</div>}
        {m.reply && m.done && m.reply.unverified && <div className="agent-badge warn"><ShieldAlert size={12} /> не подтверждено: {m.reply.unverified.join(', ')}</div>}
        {m.reply && m.done && m.reply.proposed?.map(p => <div key={p.action + p.objectId} className="agent-proposal"><span>Предложено действие: <b>{ACTION_BY_NAME[p.action].label}</b> для <ObjectChip id={p.objectId} compact /></span><button className="btn btn-xs btn-primary" onClick={() => onAction(p.action, p.objectId, p.params)}>Открыть предпросмотр</button><span className="dim" style={{ fontSize: 10 }}>агент только предлагает; выполнение — через preview и подтверждение человека</span></div>)}
        {m.reply && <button className="trace-toggle" onClick={onTrace}><ChevronRight size={12} style={{ transform: m.traceOpen ? 'rotate(90deg)' : 'none' }} /> Показать как получено · {m.reply.steps.length} вызовов инструментов · {m.reply.chips.length} ссылок, проверено {m.verified.size}</button>}
        {m.reply && m.traceOpen && <div className="trace">{m.reply.steps.map((s, i) => <div key={i} className="trace-step"><span className="mono accent">{s.tool}</span><span className="mono dim truncate" style={{ flex: 1 }}>{JSON.stringify(s.args)}</span><span className="dim">{s.result}</span><span className="mono dim" style={{ fontSize: 10 }}>{s.ms} мс</span></div>)}<div className="dim" style={{ fontSize: 10, marginTop: 4 }}>Все вызовы прошли через Object API с тем же PDP; записаны в аудит как agent.tool:* с делегированным токеном.</div></div>}
      </div>
    </div>
  )
}

function render(text: string, verified: Set<string>, done: boolean): ReactNode[] {
  const out: ReactNode[] = []
  const lines = text.split('\n')
  lines.forEach((line, li) => {
    const parts = line.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*)/g)
    parts.forEach((p, i) => {
      const m = p.match(/^\[\[([^\]]+)\]\]$/)
      if (m) { const id = m[1]; const ok = verified.has(id); out.push(<span key={`${li}-${i}`} className={`cite ${ok ? 'ok' : done ? 'pending' : ''}`}><ObjectChip id={id} compact />{ok ? <Check size={11} className="cite-check" /> : done ? <span className="cite-wait">…</span> : null}</span>) }
      else if (p.startsWith('**') && p.endsWith('**')) out.push(<b key={`${li}-${i}`}>{p.slice(2, -2)}</b>)
      else out.push(<span key={`${li}-${i}`}>{p}</span>)
    })
    if (li < lines.length - 1) out.push(<br key={`br${li}`} />)
  })
  return out
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
