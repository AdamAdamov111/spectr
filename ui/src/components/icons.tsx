import { Building2, Factory, Mountain, FileBadge, Grid3x3, Drill, Route, Minus, Cog, Cylinder, Wrench, Activity, TriangleAlert, ClipboardList, BadgeCheck, Siren, Briefcase, User, IdCard, FileText, Gavel, Ticket, Package, Truck, File, Quote, FileSpreadsheet, Target, LayoutDashboard, Search, Share2, Map, Settings, Bot, GitBranch, ShieldCheck, Network, ScrollText, type LucideProps } from 'lucide-react'
import type { ObjectType } from '../data/ontology'
import type { ScreenKey } from '../app/store'
import type { ComponentType } from 'react'

export const TYPE_ICONS: Record<ObjectType, ComponentType<LucideProps>> = {
  Holding: Building2, Subsidiary: Factory, Field: Mountain, LicenseArea: FileBadge, WellPad: Grid3x3, Well: Drill, Pipeline: Route, PipelineSegment: Minus, PumpStation: Cog, Tank: Cylinder,
  Equipment: Wrench, Sensor: Activity, Anomaly: TriangleAlert, MaintenanceOrder: ClipboardList, WorkPermit: BadgeCheck, Incident: Siren, Organization: Briefcase, Person: User, Employee: IdCard,
  Contract: FileText, Procurement: Gavel, Bid: Ticket, Shipment: Package, Vehicle: Truck, Document: File, Mention: Quote, Report: FileSpreadsheet, Purpose: Target,
  GridArea: Mountain, Substation: Cog, PowerLine: Route, LineSegment: Minus, Feeder: Drill,
}
export const SCREEN_ICONS: Record<ScreenKey, ComponentType<LucideProps>> = {
  situation: LayoutDashboard, search: Search, graph: Share2, map: Map, toir: Wrench, procurement: Gavel, audit: ShieldCheck, ontology: Network, branches: GitBranch, agent: Bot, admin: Settings,
}
export const MiscIcons = { ScrollText }
