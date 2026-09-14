// Deterministic PRNG and id helpers. Everything on the stand is reproducible from one seed.

export class Rng {
  private s: number
  constructor(seed: number) { this.s = seed >>> 0 || 1 }
  next(): number {
    // mulberry32
    let t = (this.s += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)) }
  float(min: number, max: number): number { return min + this.next() * (max - min) }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)] }
  chance(p: number): boolean { return this.next() < p }
  gauss(mean = 0, sd = 1): number {
    const u = 1 - this.next(); const v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
    return arr
  }
  fork(label: string): Rng { return new Rng(hash32(label) ^ this.int(0, 0x7fffffff)) }
}

export function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
/** UUIDv7-like id: time-ordered prefix + random tail, Crockford base32 (matches spec examples eq_01J8ZK...) */
export function makeId(rng: Rng, prefix: string, ts: number): string {
  let out = ''
  let t = Math.floor(ts / 1000)
  const timePart: string[] = []
  for (let i = 0; i < 8; i++) { timePart.unshift(B32[t & 31]); t = Math.floor(t / 32) }
  out = timePart.join('')
  for (let i = 0; i < 18; i++) out += B32[rng.int(0, 31)]
  return `${prefix}_${out}`
}

export function shortHash(rng: Rng, len = 7): string {
  const hex = '0123456789abcdef'; let s = ''
  for (let i = 0; i < len; i++) s += hex[rng.int(0, 15)]
  return s
}

export function hexHash(seed: string, len = 64): string {
  // deterministic pseudo-sha for display (real audit hashes use WebCrypto)
  const r = new Rng(hash32(seed)); return shortHash(r, len)
}

/** Russian INN (10 digits) with valid checksum */
export function makeInn(rng: Rng): string {
  const d: number[] = []
  for (let i = 0; i < 9; i++) d.push(i === 0 ? rng.int(1, 9) : rng.int(0, 9))
  const w = [2, 4, 10, 3, 5, 9, 4, 6, 8]
  const c = (d.reduce((a, x, i) => a + x * w[i], 0) % 11) % 10
  return d.join('') + c
}
export function makeInn12(rng: Rng): string {
  const d: number[] = []
  for (let i = 0; i < 10; i++) d.push(i === 0 ? rng.int(1, 9) : rng.int(0, 9))
  const w1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
  const c1 = (d.reduce((a, x, i) => a + x * w1[i], 0) % 11) % 10
  d.push(c1)
  const w2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]
  const c2 = (d.reduce((a, x, i) => a + x * w2[i], 0) % 11) % 10
  d.push(c2)
  return d.join('')
}
export function makeOgrn(rng: Rng): string {
  let s = '1' + String(rng.int(10, 26)) + String(rng.int(10, 99)).padStart(2, '0')
  for (let i = 0; i < 7; i++) s += rng.int(0, 9)
  const c = Number(BigInt(s) % 11n) % 10
  return s + c
}

export const pad = (n: number, w = 2) => String(n).padStart(w, '0')
export function fmtMoney(v: number): string { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v) + ' ₽' }
export function fmtNum(v: number, d = 0): string { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: d }).format(v) }
export function fmtDate(ts: number): string { const d = new Date(ts); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` }
export function fmtDateTime(ts: number): string { const d = new Date(ts); return `${fmtDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
export function fmtTime(ts: number): string { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }
export function fmtIso(ts: number): string { return new Date(ts).toISOString().replace(/\.\d{3}Z$/, 'Z') }
export function fmtAgo(sec: number): string {
  if (sec < 60) return `${Math.max(0, Math.round(sec))} с`
  if (sec < 3600) return `${Math.floor(sec / 60)} мин`
  if (sec < 86400) return `${Math.floor(sec / 3600)} ч`
  return `${Math.floor(sec / 86400)} д`
}
export const DAY = 86400_000
export const HOUR = 3600_000
export const MIN = 60_000
