import { PanelRightClose, ArrowLeft } from 'lucide-react'
import { useStore } from '../app/store'
import { ObjectCard } from './ObjectCard'
import { ExplainView } from './Explain'
import { get as getObject, freshnessOf } from '../data/api'
import { ObjectChip, Empty } from '../components/ui'
import { TYPES } from '../data/ontology'
import { fmtAgo } from '../data/rng'

export function Inspector() {
  const ins = useStore(s => s.inspector); const inspect = useStore(s => s.inspect); const pinned = useStore(s => s.pinned)
  const o = ins.objectId ? getObject(ins.objectId) : undefined
  return (
    <aside className="inspector">
      <div className="inspector-h">
        {ins.mode !== 'object' && <button className="btn-icon" onClick={() => inspect({ mode: 'object' })} title="Назад к объекту"><ArrowLeft size={14} /></button>}
        <span>{ins.mode === 'explain' ? 'Происхождение' : ins.mode === 'freshness' ? 'Свежесть' : ins.mode === 'summary' ? 'Сводка по выделению' : 'Объект'}</span>
        <span className="grow" />
        <button className="btn-icon" onClick={() => inspect({ open: false })} title="Свернуть инспектор"><PanelRightClose size={14} /></button>
      </div>
      {pinned.length > 0 && <div className="pinned-strip">{pinned.map(id => <ObjectChip key={id} id={id} compact onOpen={x => inspect({ objectId: x.id, mode: 'object' })} />)}</div>}
      <div className="inspector-b" key={`${ins.mode}:${ins.objectId}:${ins.prop}`}>
        {ins.mode === 'object' && (o ? <ObjectCard id={o.id} compact /> : <Empty text="Выберите объект" />)}
        {ins.mode === 'explain' && o && ins.prop && <ExplainView id={o.id} prop={ins.prop} />}
        {ins.mode === 'freshness' && o && <FreshnessPanel id={o.id} />}
        {ins.mode === 'summary' && <Summary ids={ins.summaryIds || []} />}
      </div>
    </aside>
  )
}

function FreshnessPanel({ id }: { id: string }) {
  const o = getObject(id)!; const f = freshnessOf(o)
  return (
    <div style={{ padding: 12 }}>
      <div className="row" style={{ marginBottom: 8 }}><b>{o.label}</b><span className={`fresh fresh-${f.status}`}><span className="fresh-dot" />{fmtAgo(f.lagSec)} / SLO {fmtAgo(f.sloSec)}</span></div>
      <div className="dim" style={{ fontSize: 12, marginBottom: 12 }}>Цепочка источник → пайплайн → индекс с задержками на каждом этапе. Контракт свежести типа {TYPES[o.type].label}: {fmtAgo(f.sloSec)}.</div>
      <div className="fresh-chain">{f.chain.map((c, i) => <div key={c.stage} className="fresh-stage" style={{ animationDelay: `${i * 80}ms` }}><div className="fresh-stage-n">{i + 1}</div><div><div>{c.stage}</div><div className="mono dim" style={{ fontSize: 11 }}>+{c.lagSec} с</div></div></div>)}</div>
      <table className="kv" style={{ marginTop: 12 }}><tbody><tr><td className="dim">materialized_at</td><td className="mono">{new Date(o.materializedAt).toISOString()}</td></tr><tr><td className="dim">пайплайн</td><td className="mono">{f.pipeline}</td></tr><tr><td className="dim">индекс</td><td className="mono">{f.index}</td></tr><tr><td className="dim">статус</td><td className="mono">{f.status === 'ok' ? 'в SLO' : f.status === 'warn' ? '1–3 SLO' : 'устарело'}</td></tr></tbody></table>
    </div>
  )
}

function Summary({ ids }: { ids: string[] }) {
  const objs = ids.map(getObject).filter(Boolean) as NonNullable<ReturnType<typeof getObject>>[]
  const byType = new Map<string, number>(); for (const o of objs) byType.set(o.type, (byType.get(o.type) || 0) + 1)
  const inspect = useStore(s => s.inspect)
  if (!objs.length) return <Empty text="Выделите группу активов лассо (Shift + перетаскивание) на карте" />
  return (
    <div style={{ padding: 12 }}>
      <div className="row" style={{ marginBottom: 8 }}><b>Выделено активов: {objs.length}</b></div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>{[...byType].map(([t, n]) => <span key={t} className="pill">{TYPES[t as keyof typeof TYPES].plural}: {n}</span>)}</div>
      <div className="col" style={{ gap: 4 }}>{objs.slice(0, 60).map(o => <ObjectChip key={o.id} o={o} onOpen={x => inspect({ objectId: x.id, mode: 'object' })} />)}</div>
    </div>
  )
}
