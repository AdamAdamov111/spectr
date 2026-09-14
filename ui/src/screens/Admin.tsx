// U14 Администрирование: реестр целей, симуляция «как видит пользователь X», журнал политик, chaos-переключатели стенда.
import { useState } from 'react'
import { world, audit, seedAudit, switchDomain } from '../data/api'
import { DOMAINS } from '../data/domain'
import { useStore } from '../app/store'
import { USERS, PURPOSE_LABELS, PURPOSE_CATEGORIES, PURPOSE_BASIS, PURPOSE_EXPIRES, POLICY_LOG } from '../data/security'
import { ONTOLOGY_VERSION, TYPES } from '../data/ontology'
import { Panel, Markings, ObjectChip } from '../components/ui'
import { fmtNum } from '../data/rng'

export function AdminScreen() {
  const simulate = useStore(s => s.simulate); const endSimulation = useStore(s => s.endSimulation); const simulation = useStore(s => s.simulation); const openAction = useStore(s => s.openAction)
  const chaos = useStore(s => s.chaos); const setChaos = useStore(s => s.setChaos); const setConnection = useStore(s => s.setConnection); const connection = useStore(s => s.connection); const toast = useStore(s => s.toast)
  const [tab, setTab] = useState<'purposes' | 'sim' | 'policies' | 'chaos' | 'stand'>('purposes')
  const [login, setLogin] = useState('analyst_open'); const [purpose, setPurpose] = useState('toir_planning')
  const w = world(); const u = USERS.find(x => x.login === login)!
  const purposes = w.byType.get('Purpose') || []
  return (
    <div className="screen admin">
      <div className="screen-h"><span className="screen-title">Администрирование</span><span className="grow" /></div>
      <div className="tabs">{([['purposes', 'Реестр целей'], ['sim', 'Как видит пользователь X'], ['policies', 'Журнал политик'], ['chaos', 'Chaos / состояния'], ['stand', 'Стенд']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="admin-body xfade" key={tab}>
        {tab === 'purposes' && <table className="xw"><thead><tr><th>Цель</th><th>Правовое основание</th><th>Категории данных</th><th>Срок</th><th>Владелец</th><th>Участников</th><th></th></tr></thead><tbody>{purposes.map(p => { const key = p.id.replace('pur_', ''); return <tr key={p.id}><td><ObjectChip o={p} compact /><div className="mono dim" style={{ fontSize: 10 }}>{key}</div></td><td className="dim">{PURPOSE_BASIS[key]}</td><td><Markings list={PURPOSE_CATEGORIES[key] || []} small /></td><td className="mono">{PURPOSE_EXPIRES[key]}</td><td>{String(p.props.owner)}</td><td className="mono">{String(p.props.members)}</td><td><button className="btn btn-xs" onClick={() => openAction('assign_purpose', p.id)}>Назначить сотрудника</button></td></tr> })}</tbody></table>}
        {tab === 'sim' && <div className="grid-2" style={{ maxWidth: 900 }}>
          <Panel title="Симуляция"><div className="col" style={{ gap: 10 }}>
            <div className="field"><label className="label">Пользователь</label><select className="input" value={login} onChange={e => { setLogin(e.target.value); setPurpose(USERS.find(x => x.login === e.target.value)!.purposes[0]) }}>{USERS.map(x => <option key={x.login} value={x.login}>{x.login} — {x.roleLabel}</option>)}</select></div>
            <div className="field"><label className="label">Цель</label><select className="input" value={purpose} onChange={e => setPurpose(e.target.value)}>{u.purposes.map(p => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}</select></div>
            <div className="dim" style={{ fontSize: 12 }}>Допуск: <b>{u.clearance.level}</b> + {u.clearance.categories.join(', ') || 'без категорий'} · под целью откроются: {(PURPOSE_CATEGORIES[purpose] || []).filter(c => u.clearance.categories.includes(c) || c === 'INTERNAL' || c === 'CONFIDENTIAL').join(', ')}</div>
            <div className="row">{!simulation ? <button className="btn btn-primary" onClick={() => { simulate(login, purpose); toast({ text: `Симуляция: интерфейс показывает данные как ${login} под целью ${purpose}. Водяной знак СИМУЛЯЦИЯ`, kind: 'warn' }) }}>Войти в режим симуляции</button> : <button className="btn btn-danger" onClick={endSimulation}>Завершить симуляцию</button>}</div>
            <div className="dim" style={{ fontSize: 11 }}>Откройте любой экран: карточка ООО «Вектор» под analyst_open покажет замки на FIN/PII, поиск не покажет CONFIDENTIAL-объекты, помощник ответит без сумм.</div>
          </div></Panel>
          <Panel title="Пользователи стенда"><table className="xw"><thead><tr><th>Логин</th><th>Роль</th><th>Допуск</th><th>Цели</th></tr></thead><tbody>{USERS.map(x => <tr key={x.login}><td className="mono">{x.login}</td><td>{x.roleLabel}</td><td><Markings list={[x.clearance.level, ...x.clearance.categories]} small /></td><td className="dim" style={{ fontSize: 11 }}>{x.purposes.map(p => PURPOSE_LABELS[p]).join(', ')}</td></tr>)}</tbody></table></Panel>
        </div>}
        {tab === 'policies' && <div className="col" style={{ gap: 10, maxWidth: 960 }}>{POLICY_LOG.map(p => <Panel key={p.id} title={<span className="row"><span className="mono">{p.name}</span><span className="dim">{p.ts} · {p.author}</span><span className="grow" /><span className="ok-text">подпись {p.signature}</span><span className="mono dim">тесты {p.tests}</span></span>}><div style={{ fontSize: 12, marginBottom: 6 }}>{p.summary}</div><div className="code">{p.diff.map((l, i) => <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l}</div>)}</div></Panel>)}<div className="dim" style={{ fontSize: 11 }}>PDP (Cedar) отказывается загрузить политику без валидной подписи и без прохождения тестов в CI. Изменение политики — аудируемое событие.</div></div>}
        {tab === 'chaos' && <div className="grid-2" style={{ maxWidth: 900 }}>
          <Panel title="Источники и свежесть"><div className="col" style={{ gap: 8 }}><label className="check"><input type="checkbox" checked={chaos.sapStale} onChange={e => setChaos({ sapStale: e.target.checked })} /> SAP-реплика молчит 14 мин (слой скважин «устарел», бейдж красный)</label><div className="dim" style={{ fontSize: 11 }}>Состояние «Устарело» (8.10): контент приглушён, слой карты штриховой, алерт F-09.</div></div></Panel>
          <Panel title="Глобальные состояния"><div className="col" style={{ gap: 8 }}><label className="check"><input type="checkbox" checked={connection === 'lost'} onChange={e => setConnection(e.target.checked ? 'lost' : 'ok')} /> Потеря соединения (верхняя полоса)</label><label className="check"><input type="checkbox" checked={connection === 'policy'} onChange={e => setConnection(e.target.checked ? 'policy' : 'ok')} /> Смена политики (push policy.invalidate)</label><label className="check"><input type="checkbox" checked={chaos.pdpDown} onChange={e => { setChaos({ pdpDown: e.target.checked }); if (e.target.checked) toast({ text: 'PDP недоступен → circuit breaker: ответ deny, никогда allow', kind: 'danger' }) }} /> PDP недоступен (circuit breaker → deny)</label></div></Panel>
        </div>}
        {tab === 'stand' && <div className="grid-2" style={{ maxWidth: 900 }}>
          <Panel title="Синтетический холдинг"><table className="kv"><tbody>{Object.entries(w.stats).filter(([k]) => k !== 'genMs' && k !== 'links').map(([k, v]) => <tr key={k}><td className="dim">{TYPES[k as keyof typeof TYPES]?.plural || k}</td><td className="mono">{fmtNum(v)}</td></tr>)}<tr><td className="dim">связей</td><td className="mono">{fmtNum(w.stats.links)}</td></tr><tr><td className="dim">генерация</td><td className="mono">{w.stats.genMs} мс · масштаб {w.scale}</td></tr><tr><td className="dim">онтология</td><td className="mono">v{ONTOLOGY_VERSION}</td></tr><tr><td className="dim">аудит</td><td className="mono">{audit.events.length} событий · {audit.batches.length} корней</td></tr></tbody></table></Panel>
          <Panel title="Отраслевой пакет онтологии"><div className="col" style={{ gap: 10, fontSize: 13 }}>
            <div className="dim">Одно ядро — разные доменные онтологии. Переключение пересобирает синтетический холдинг и перезагружает стенд; все экраны работают без изменений кода.</div>
            {Object.values(DOMAINS).map(d => <label key={d.key} className="check"><input type="radio" name="domain" checked={w.domain.key === d.key} onChange={() => switchDomain(d.key)} /> <b>{d.label}</b> · {d.holdingFull}</label>)}
          </div></Panel>
          <Panel title="Стенд"><div className="col" style={{ gap: 6, fontSize: 12 }}><div>Все данные помечены маркировкой <b>SYNTHETIC</b>; ИНН валидны по контрольной сумме, но принадлежат вымышленным организациям.</div><div className="dim">Продовый стенд: docker-compose с MinIO, Nessie, Redpanda, Debezium, Trino, OpenSearch, ClickHouse, Qdrant, Keycloak, Temporal, Dagster, PDP (Cedar), llama.cpp (см. репозиторий, часть 7).</div><button className="btn btn-xs" onClick={() => seedAudit()}>Досеять аудит</button></div></Panel>
        </div>}
      </div>
    </div>
  )
}
