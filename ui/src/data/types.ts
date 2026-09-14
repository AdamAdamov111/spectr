import type { Marking, ObjectType, LinkType } from './ontology'

export interface PropMeta {
  source?: string           // sap_pm.equi.equnr
  sourceTs?: number         // when the source row was captured
  derived_by?: string
  confidence?: number
  rawRid?: string
}

export interface SpObject {
  type: ObjectType
  id: string
  version: number
  label: string
  markings: Marking[]
  props: Record<string, unknown>
  meta: Record<string, PropMeta>
  sources: string[]          // systems this golden object was assembled from
  subsidiary?: string        // Subsidiary id
  geo?: [number, number]     // schematic map coordinates
  materializedAt: number
  created: number
  status?: 'ok' | 'pending_writeback' | 'rejected'
  crosswalk?: { system: string; key: string; score: number; rule: string }[]
  history?: HistoryEntry[]
}

export interface HistoryEntry {
  version: number
  ts: number
  cause: string              // pipeline name or action
  causeKind: 'pipeline' | 'action' | 'er'
  actor?: string
  diff: { prop: string; before: unknown; after: unknown }[]
}

export interface SpLink {
  id: string
  type: LinkType
  from: string
  to: string
  confidence: number
  markings: Marking[]
  source: string
  props?: Record<string, unknown>
  validFrom?: number
  validTo?: number
}

export interface EventItem {
  id: string
  ts: number
  kind: 'anomaly' | 'order' | 'action' | 'incident' | 'er' | 'policy' | 'freshness' | 'info'
  text: string
  objectId?: string
}

export interface Session {
  login: string
  name: string
  role: string
  roleLabel: string
  clearance: { level: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'SECRET'; categories: Marking[] }
  purposes: string[]        // purpose ids available
  purpose?: string          // current purpose id
  subsidiary?: string
}

export interface FreshnessInfo { lagSec: number; sloSec: number; status: 'ok' | 'warn' | 'stale'; source: string; pipeline: string; index: string; chain: { stage: string; lagSec: number }[] }
