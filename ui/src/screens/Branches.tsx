// U12 Ветки данных (Nessie): список, diff по датасетам, проверки, merge с анимацией слияния линий.
import { useState } from 'react'
import { GitBranch, GitMerge, Play, Plus } from 'lucide-react'
import { BRANCHES, branchDiff, addEvent, logRead, type Branch } from '../data/api'
import { useStore, useSimulatedSession, reducedMotion } from '../app/store'
import { Panel, Stamp } from '../components/ui'
import { fmtDateTime, fmtNum } from '../data/rng'

export function BranchesScreen() {
  const session = useSimulatedSession(); const toast = useStore(s => s.toast)
  const [branches, setBranches] = useState<Branch[]>(BRANCHES)
  const [sel, setSel] = useState<string>('dev/backfill-2026-08')
  const [merging, setMerging] = useState(false); const [merged, setMerged] = useState<string | null>(null)
  const [running, setRunning] = useState(0); const [runKey, setRunKey] = useState(0)
  const [newName, setNewName] = useState('')
  const b = branches.find(x => x.name === sel)!
  const diff = branchDiff(sel + (runKey ? `#${runKey}` : ''))
  const allOk = diff.every(d => d.checks.every(c => c.ok))
  const rm = reducedMotion()
  const merge = () => {
    setMerging(true)
    setTimeout(() => { setMerging(false); setMerged(sel); setBranches(bs => bs.map(x => (x.name === sel ? { ...x, status: 'merged' } : x))); addEvent({ kind: 'er', text: `Ветка ${sel} смержена в main (атомарный коммит Nessie)` }); logRead(session, 'branch.merge', [], sel); toast({ text: `Ветка ${sel} смержена в main. Индексы пересобираются из нового snapshot`, kind: 'ok' }) }, rm ? 0 : 900)
  }
  const rerun = () => { setRunning(1); const id = setInterval(() => setRunning(r => { if (r >= 100) { clearInterval(id); setRunKey(k => k + 1); toast({ text: 'Пайплайн ТОиР пересчитан в ветке: 4 датасета, build-манифест подписан', kind: 'ok' }); return 0 } return r + 4 }), rm ? 5 : 60) }
  return (
    <div className="screen branches">
      <div className="screen-h"><span className="screen-title">Ветки данных</span><span className="dim mono" style={{ fontSize: 11 }}>Nessie · каталог с семантикой git · backfill только в ветках (инвариант 11)</span><span className="grow" /><div className="row"><input className="input" style={{ width: 220 }} placeholder="exp/new-branch" value={newName} onChange={e => setNewName(e.target.value)} /><button className="btn" disabled={!newName} onClick={() => { setBranches(bs => [...bs, { name: newName, author: session.login, created: Date.now(), head: Math.random().toString(16).slice(2, 9), base: 'c9f1e2a', note: 'Новая ветка от main', status: 'open' }]); setSel(newName); setNewName('') }}><Plus size={13} /> Создать от main</button></div></div>
      <div className="screen-b">
        <aside className="branch-list">{branches.map(x => <button key={x.name} className={`branch ${sel === x.name ? 'active' : ''}`} onClick={() => { setSel(x.name); setMerged(null) }}><div className="row"><GitBranch size={13} className={x.status === 'main' ? 'accent' : 'dim'} /><span className="mono grow truncate">{x.name}</span>{x.status === 'merged' && <span className="pill" style={{ fontSize: 10 }}>merged</span>}</div><div className="dim" style={{ fontSize: 11 }}>{x.author} · {fmtDateTime(x.created)} · <span className="mono">{x.head}</span></div></button>)}</aside>
        <div className="branch-main">
          <Panel title={<span className="row"><span className="mono">{sel}</span><span className="dim">→ main</span></span>} dense>
            <div style={{ padding: 10 }} className="col">
              <div className="dim" style={{ fontSize: 12 }}>{b.note}</div>
              {b.status === 'main' ? <div className="dim">Продуктивная ветка. Diff считается относительно неё.</div> : <>
                <div className="section-h">Diff по датасетам</div>
                {diff.map((d, i) => { const total = d.added + d.changed + d.removed || 1; return <div key={d.dataset} className="diff-line" style={{ animationDelay: `${i * 60}ms` }}><span className="mono" style={{ width: 220 }}>{d.dataset}</span><div className="diff-bars"><i className="add" style={{ width: `${(d.added / total) * 100}%` }} /><i className="chg" style={{ width: `${(d.changed / total) * 100}%` }} /><i className="rem" style={{ width: `${(d.removed / total) * 100}%` }} /></div><span className="mono" style={{ fontSize: 11 }}><span className="ok-text">+{fmtNum(d.added)}</span> <span className="warn-text">~{fmtNum(d.changed)}</span> <span className="danger-text">−{fmtNum(d.removed)}</span></span></div> })}
                <div className="section-h">Проверки перед merge</div>
                <div className="grid-2">{diff[0].checks.map(c => { const ok = diff.every(d => d.checks.find(x => x.name === c.name)?.ok); const note = diff.map(d => d.checks.find(x => x.name === c.name)!).find(x => !x.ok)?.note || c.note; return <div key={c.name} className="pre"><span className={ok ? 'ok' : 'no'}>{ok ? '✓' : '✕'}</span><div><div>{c.name}</div><div className="why">{note}</div></div></div> })}</div>
                <div className="row" style={{ marginTop: 10, gap: 10 }}>
                  {sel.includes('backfill') && <button className="btn" onClick={rerun} disabled={running > 0}><Play size={13} /> Перезапустить пайплайн ТОиР в ветке</button>}
                  {running > 0 && <div className="bar" style={{ width: 200 }}><i style={{ width: `${running}%`, animation: 'none' }} /></div>}
                  <span className="grow" />
                  {b.status === 'open' && <button className="btn btn-primary" disabled={!allOk || merging} onClick={merge}><GitMerge size={13} /> Merge в main</button>}
                  {b.status === 'merged' && <Stamp text="Смержено" tone="ok" />}
                </div>
                {!allOk && <div className="dim" style={{ fontSize: 11 }}>Merge заблокирован: одна из проверок не пройдена. CI не пропускает понижение качества ER (precision ≥ 0.95).</div>}
              </>}
              {(merging || merged === sel) && <MergeAnim done={merged === sel} />}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function MergeAnim({ done }: { done: boolean }) {
  return <svg viewBox="0 0 400 80" className="merge-anim" style={{ width: 400, height: 80, marginTop: 8 }}>
    <path d="M10,20 C150,20 200,20 390,20" fill="none" stroke="var(--sp-accent)" strokeWidth="2" />
    <path className={done ? 'merge-path done' : 'merge-path'} d="M10,60 C150,60 200,60 390,60" fill="none" stroke="var(--sp-warn)" strokeWidth="2" />
    <circle cx="10" cy="20" r="4" fill="var(--sp-accent)" /><circle cx="10" cy="60" r="4" fill="var(--sp-warn)" /><circle cx="390" cy="20" r="5" fill={done ? 'var(--sp-ok)' : 'var(--sp-accent)'} />
    <text x="20" y="14" fill="var(--sp-text-3)" fontSize="9" fontFamily="monospace">main</text><text x="20" y="74" fill="var(--sp-text-3)" fontSize="9" fontFamily="monospace">branch</text>
  </svg>
}
