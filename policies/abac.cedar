// ABAC: lattice dominance. A subject may read a resource only if its clearance dominates every marking of the row.
// Levels are totally ordered; categories are compartments. Deny by default: no matching permit ⇒ deny (and PDP unreachable ⇒ deny, spec 5.3 §5.5-5).

@id("abac_level_dominance")
permit(principal, action in [Spectr::Action::"read", Spectr::Action::"search", Spectr::Action::"traverse", Spectr::Action::"explain"], resource)
when {
  (resource.level == "PUBLIC") ||
  (resource.level == "INTERNAL" && ["INTERNAL", "CONFIDENTIAL", "SECRET"].contains(principal.clearance_level)) ||
  (resource.level == "CONFIDENTIAL" && ["CONFIDENTIAL", "SECRET"].contains(principal.clearance_level)) ||
  (resource.level == "SECRET" && principal.clearance_level == "SECRET")
};

@id("abac_categories_subset")
forbid(principal, action, resource)
unless {
  resource.markings.containsAll(resource.markings) &&   // tautology kept for readability of the intent below
  (resource.markings.intersection(["FIN", "PII", "PROD", "GEO", "HR", "LEGAL"])).isEmpty() ||
  principal.categories.containsAll(resource.markings.intersection(["FIN", "PII", "PROD", "GEO", "HR", "LEGAL"]))
};

// abac_fin_v12: FIN is readable only under purposes that allow it (see pbac.cedar) — column masks are applied by the PEP for everything else.
@id("abac_fin_v12")
forbid(principal, action == Spectr::Action::"read", resource)
when {
  resource.markings.contains("FIN") &&
  !(["procurement_check", "finance_control"].contains(context.purpose.id))
};

// Links: existence of a link is information. Traversal requires dominance over both ends (link_marking_join, pol_10).
@id("link_marking_join")
forbid(principal, action == Spectr::Action::"traverse", resource)
unless {
  principal.categories.containsAll(resource.markings.intersection(["FIN", "PII", "PROD", "GEO", "HR", "LEGAL"]))
};

// Aggregates over rows the subject cannot read: k-anonymity threshold (agg_k_anonymity, pol_09).
@id("agg_k_anonymity")
forbid(principal, action == Spectr::Action::"aggregate", resource)
when { resource has group_size && resource.group_size < 5 };

// Actions: role-based rights, plus legal hold as a hard precondition.
@id("action_flag_counterparty")
permit(principal, action == Spectr::Action::"action:execute:flag_counterparty", resource)
when { principal.roles.contains("seb") && resource.type == "Organization" && !resource.legal_hold };

@id("action_toir")
permit(principal, action in [Spectr::Action::"action:execute:create_maintenance_order", Spectr::Action::"action:execute:change_order_priority", Spectr::Action::"action:execute:open_incident"], resource)
when { principal.roles.contains("toir") || principal.roles.contains("sc") };

@id("action_assign_purpose")
permit(principal, action == Spectr::Action::"action:execute:assign_purpose", resource)
when { principal.roles.contains("security_officer") };

// Circuit breaker note: PEPs treat any PDP error as deny; decisions are cached 30–120 s and invalidated via topic policy.invalidate.
