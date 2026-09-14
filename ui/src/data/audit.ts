// Cryptographic audit (spec 5.3 §3.5): signed events, hash chain h_i = H(h_{i-1} || event_i),
// Merkle tree per batch, root anchored to WORM, inclusion proof verifiable in the browser (WebCrypto).

import { hash32, Rng, fmtIso } from './rng'

export interface AuditEvent {
  seq: number
  id: string
  ts: number
  actor: string
  actorKind: 'user' | 'service' | 'agent'
  purpose: string
  action: string            // read | search | traverse | explain | export | copy | action:execute:<type> | login | policy.change | agent.tool | denied
  resource_ids: string[]
  resource_label?: string
  policy_decision_id: string
  request_hash: string
  response_digest: string
  prev_hash: string
  hash: string
  signature: string
  batch?: number
  outcome: 'allow' | 'deny'
  detail?: string
}

export interface MerkleBatch { index: number; from: number; to: number; root: string; anchoredAt: number; anchor: string; leaves: string[]; tree: string[][] }

const enc = new TextEncoder()
export async function sha256(s: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(s))
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // fallback (non-secure): pseudo hash
  const r = new Rng(hash32(s)); let out = ''; for (let i = 0; i < 64; i++) out += '0123456789abcdef'[r.int(0, 15)]; return out
}

export class AuditLog {
  events: AuditEvent[] = []
  batches: MerkleBatch[] = []
  private lastHash = '0'.repeat(64)
  private pending: AuditEvent[] = []
  private queue: Promise<void> = Promise.resolve()
  private listeners = new Set<() => void>()
  batchSize = 16
  tampered = false

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() { for (const l of this.listeners) l() }

  /** Append an event; hashing runs async but in order. */
  append(e: Omit<AuditEvent, 'seq' | 'id' | 'prev_hash' | 'hash' | 'signature' | 'request_hash' | 'response_digest'> & { request_hash?: string; response_digest?: string }): AuditEvent {
    const seq = this.events.length
    const ev: AuditEvent = { ...e, seq, id: `ae_${(seq + 1).toString().padStart(6, '0')}`, request_hash: e.request_hash || '', response_digest: e.response_digest || '', prev_hash: '', hash: '', signature: '' }
    this.events.push(ev)
    this.queue = this.queue.then(async () => {
      ev.prev_hash = this.lastHash
      if (!ev.request_hash) ev.request_hash = (await sha256(`req:${ev.action}:${ev.resource_ids.join(',')}:${ev.ts}`)).slice(0, 32)
      if (!ev.response_digest) ev.response_digest = (await sha256(`resp:${ev.id}:${ev.resource_ids.length}`)).slice(0, 32)
      ev.hash = await sha256(`${ev.prev_hash}|${canonical(ev)}`)
      ev.signature = 'svid:' + (await sha256(`sign:${ev.hash}:spiffe://spectr/object-api`)).slice(0, 40)
      this.lastHash = ev.hash
      this.pending.push(ev)
      if (this.pending.length >= this.batchSize) await this.seal()
      this.emit()
    })
    return ev
  }

  async seal() {
    if (!this.pending.length) return
    const leaves = this.pending.map(e => e.hash)
    const tree = await merkleTree(leaves)
    const root = tree[tree.length - 1][0]
    const idx = this.batches.length
    const anchor = 'worm://spectr-audit-worm/roots/' + fmtIso(Date.now()).replace(/[:T]/g, '-') + '.json'
    const b: MerkleBatch = { index: idx, from: this.pending[0].seq, to: this.pending[this.pending.length - 1].seq, root, anchoredAt: Date.now(), anchor, leaves, tree }
    for (const e of this.pending) e.batch = idx
    this.batches.push(b)
    this.pending = []
  }

  async flush() { await this.queue; await this.seal(); this.emit() }

  /** Inclusion proof for an event: sibling path from leaf to root. */
  proofFor(ev: AuditEvent): { batch: MerkleBatch; path: { hash: string; side: 'left' | 'right' }[]; leafIndex: number } | null {
    if (ev.batch == null) return null
    const b = this.batches[ev.batch]
    let idx = b.leaves.indexOf(ev.hash)
    if (idx < 0) return null
    const leafIndex = idx
    const path: { hash: string; side: 'left' | 'right' }[] = []
    for (let level = 0; level < b.tree.length - 1; level++) {
      const layer = b.tree[level]
      const sibIdx = idx % 2 === 0 ? idx + 1 : idx - 1
      const sib = layer[Math.min(sibIdx, layer.length - 1)]
      path.push({ hash: sib, side: idx % 2 === 0 ? 'right' : 'left' })
      idx = Math.floor(idx / 2)
    }
    return { batch: b, path, leafIndex }
  }

  /** Verify: recompute leaf hash from event content + prev, walk the path, compare with anchored root. */
  async verify(ev: AuditEvent, onLevel?: (level: number, hash: string) => Promise<void> | void): Promise<{ ok: boolean; computedRoot: string; leaf: string; steps: string[] }> {
    const proof = this.proofFor(ev)
    const content = this.tampered && ev.seq % 3 === 0 ? canonical({ ...ev, resource_ids: [...ev.resource_ids, 'TAMPERED'] }) : canonical(ev)
    let h = await sha256(`${ev.prev_hash}|${content}`)
    const leaf = h
    const steps = [h]
    await onLevel?.(0, h)
    if (!proof) return { ok: false, computedRoot: h, leaf, steps }
    let level = 1
    for (const p of proof.path) {
      h = await sha256(p.side === 'right' ? h + p.hash : p.hash + h)
      steps.push(h)
      await onLevel?.(level++, h)
    }
    return { ok: h === proof.batch.root, computedRoot: h, leaf, steps }
  }
}

function canonical(ev: AuditEvent): string {
  return JSON.stringify({ ts: ev.ts, actor: ev.actor, purpose: ev.purpose, action: ev.action, resource_ids: ev.resource_ids, policy_decision_id: ev.policy_decision_id, request_hash: ev.request_hash, response_digest: ev.response_digest })
}

export async function merkleTree(leaves: string[]): Promise<string[][]> {
  const tree: string[][] = [leaves.slice()]
  let layer = leaves.slice()
  while (layer.length > 1) {
    const next: string[] = []
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i], b = layer[i + 1] ?? layer[i]
      next.push(await sha256(a + b))
    }
    tree.push(next); layer = next
  }
  return tree
}
