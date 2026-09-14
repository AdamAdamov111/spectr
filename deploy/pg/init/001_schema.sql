-- OLTP объектов и реестры (спец. 2.2/2.3): состояние объектов, ActionEvent, реестр онтологии, цели PBAC.
create extension if not exists vector;
create schema if not exists spectr;
create table if not exists spectr.object_state (
  object_id text primary key, object_type text not null, version int not null, ontology_version text not null,
  markings int[] not null, props jsonb not null, materialized_at timestamptz not null, status text not null default 'ok',
  snapshot_id text, updated_at timestamptz not null default now());
create index if not exists object_state_type_idx on spectr.object_state(object_type);
create table if not exists spectr.link (
  link_id text primary key, link_type text not null, from_id text not null, to_id text not null,
  confidence numeric(4,3) not null default 1, markings int[] not null, source text, valid_from timestamptz, valid_to timestamptz);
create index if not exists link_from_idx on spectr.link(from_id); create index if not exists link_to_idx on spectr.link(to_id);
create table if not exists spectr.action_event (
  event_id text primary key, action_type text not null, actor text not null, purpose text not null, object_id text not null,
  before jsonb, after jsonb, policy_decision_id text not null, workflow_id text, status text not null, ts timestamptz not null default now());
create table if not exists spectr.ontology_release (version text primary key, released_at timestamptz not null, author text, notes text, spec jsonb not null);
create table if not exists spectr.purpose (id text primary key, name text not null, legal_basis text, allowed_categories text[] not null, owner text, expires_at date not null, active bool not null default true);
create table if not exists spectr.entity_crosswalk (source_system text, source_key text, golden_id text not null, match_score numeric(4,3), rule_id text, decided_at timestamptz not null default now(), primary key(source_system, source_key));
