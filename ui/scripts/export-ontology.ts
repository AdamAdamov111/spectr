// Emits ontology/*.yaml (ontology-as-code, ADR-12) from the single source of truth in ui/src/data/ontology.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { TYPES, LINKS, ACTIONS, FUNCTIONS, ONTOLOGY_VERSION, LEVELS, CATEGORIES } from '../src/data/ontology'
import { PURPOSE_CATEGORIES, PURPOSE_BASIS, PURPOSE_EXPIRES, PURPOSE_LABELS } from '../src/data/security'

const root = process.argv[2] || '../ontology'
const y = (v: unknown, ind = 0): string => {
  const pad = '  '.repeat(ind)
  if (Array.isArray(v)) return v.length === 0 ? '[]' : v.every(x => typeof x !== 'object') ? `[${v.map(x => str(x)).join(', ')}]` : '\n' + v.map(x => `${pad}- ${y(x, ind + 1).replace(/^\n/, '').replace(/^\s+/, '')}`).join('\n')
  if (v && typeof v === 'object') return '\n' + Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${pad}${k}: ${y(x, ind + 1)}`).join('\n')
  return str(v)
}
const str = (x: unknown) => typeof x === 'string' ? (/[:#\[\]{}'"\n,]|^\s|\s$/.test(x) || x === '' ? JSON.stringify(x) : x) : String(x)
const slo = (s: number) => s >= 86400 ? `${s / 86400}d` : s >= 3600 ? `${s / 3600}h` : s >= 60 ? `${s / 60}m` : `${s}s`
mkdirSync(`${root}/objects`, { recursive: true }); mkdirSync(`${root}/links`, { recursive: true }); mkdirSync(`${root}/actions`, { recursive: true }); mkdirSync(`${root}/functions`, { recursive: true }); mkdirSync(`${root}/schema`, { recursive: true })
for (const t of Object.values(TYPES)) {
  const doc = { object_type: t.type, version: t.version, owner: t.owner, description: t.description, primary_key: `${t.prefix}_id`, backing_dataset: t.backing, provenance: t.provenance, freshness_slo: slo(t.sloSec), markings: t.markings, sources: t.sources,
    properties: t.props.map(p => ({ name: p.name, label: p.label, type: p.type, unit: p.unit, markings: p.markings, masking: p.masking, sources: p.sources, survivorship: p.survivorship, derived_by: p.derived_by, freshness_slo: p.freshness_slo, key: p.key, live: p.live })),
    links: LINKS.filter(l => l.from.includes(t.type) || l.to.includes(t.type)).map(l => ({ name: l.type, direction: l.from.includes(t.type) ? 'out' : 'in', to: l.from.includes(t.type) ? l.to : l.from, cardinality: l.cardinality, markings: l.markings })),
    actions: ACTIONS.filter(a => a.object.includes(t.type)).map(a => a.name) }
  writeFileSync(`${root}/objects/${t.type.toLowerCase()}.yaml`, `# ontology/objects/${t.type.toLowerCase()}.yaml — generated from ui/src/data/ontology.ts (ontology ${ONTOLOGY_VERSION})${y(doc)}\n`)
}
writeFileSync(`${root}/links/links.yaml`, `# Link types (spec 3.2)${y({ ontology_version: ONTOLOGY_VERSION, links: LINKS.map(l => ({ name: l.type, label: l.label, inverse_label: l.inverseLabel, from: l.from, to: l.to, cardinality: l.cardinality, source: l.source, markings: l.markings })) })}\n`)
writeFileSync(`${root}/actions/actions.yaml`, `# Action types (spec 3.3) — write-back via Temporal workflows${y({ actions: ACTIONS.map(a => ({ name: a.name, label: a.label, object: a.object, preconditions: a.preconditions, writeback: a.writeback, risk: a.risk, confirmation: a.confirmation, role: a.role, params: a.params })) })}\n`)
writeFileSync(`${root}/functions/functions.yaml`, `# Functions (spec 3.4)${y({ functions: FUNCTIONS })}\n`)
writeFileSync(`${root}/markings.yaml`, `# Marking lattice (spec 5.3 §3.4): levels are totally ordered, categories are compartments; join = max(level) ∪ categories${y({ levels: LEVELS, categories: CATEGORIES, bitmap_ids: Object.fromEntries([...LEVELS, ...CATEGORIES].map((m, i) => [m, i])), declassification: { only_via: 'sanitizer', signatures_required: 2, audited: true } })}\n`)
writeFileSync(`${root}/purposes.yaml`, `# PBAC purposes (spec 5.3 §3.3)${y({ purposes: Object.keys(PURPOSE_CATEGORIES).map(k => ({ id: k, name: PURPOSE_LABELS[k], legal_basis: PURPOSE_BASIS[k], allowed_data_categories: PURPOSE_CATEGORIES[k], expires_at: PURPOSE_EXPIRES[k] })) })}\n`)
writeFileSync(`${root}/schema/object-type.schema.json`, JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'SPECTR ObjectType', type: 'object', required: ['object_type', 'version', 'owner', 'description', 'primary_key', 'backing_dataset', 'provenance', 'freshness_slo', 'markings', 'properties'], properties: { object_type: { type: 'string', pattern: '^[A-Z][A-Za-z]+$' }, version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' }, owner: { type: 'string' }, description: { type: 'string', minLength: 10 }, primary_key: { type: 'string' }, backing_dataset: { type: 'string', pattern: '^(gold|enrich)\\.' }, provenance: { enum: ['full', 'row', 'dataset'] }, freshness_slo: { type: 'string', pattern: '^\\d+(s|m|h|d)$' }, markings: { type: 'array', items: { enum: [...LEVELS, ...CATEGORIES] } }, properties: { type: 'array', items: { type: 'object', required: ['name', 'type'], properties: { name: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' }, type: { enum: ['string', 'number', 'money', 'decimal', 'enum', 'date', 'datetime', 'bool', 'geo', 'text', 'percent'] }, markings: { type: 'array' }, masking: { enum: ['null_for_unauthorized', 'partial'] }, derived_by: { type: 'string' } } } } } }, null, 2) + '\n')
console.log('ontology exported to', root)
