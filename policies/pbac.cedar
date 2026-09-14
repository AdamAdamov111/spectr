// PBAC: access bound to a purpose (spec 5.3 §3.3). The purpose claim travels in the token and in every request (X-Kern-Purpose).

@id("pbac_purpose_membership")
forbid(principal, action, resource)
unless { context.purpose.members.contains(principal) && context.purpose.active };

// pbac_purpose_expiry (pol_11): automatic revocation when the purpose expires.
@id("pbac_purpose_expiry")
forbid(principal, action, resource)
when { context.purpose.expires_at < context.now };

// Purpose-restricted view: a category is visible only when the purpose allows it. The PEP narrows the effective clearance
// to clearance ∩ purpose.allowed_data_categories before evaluating ABAC (see ui/src/data/security.ts:effectiveCategories).
@id("pbac_category_scope")
forbid(principal, action, resource)
unless {
  context.purpose.allowed_data_categories.containsAll(resource.markings.intersection(["FIN", "PII", "PROD", "GEO", "HR", "LEGAL"]))
};

// Re-purposing: derived datasets inherit purpose_scope as a marking; a request under another purpose does not see them.
@id("pbac_purpose_scope_marking")
forbid(principal, action, resource)
when {
  resource.markings.contains("purpose_scope") &&
  !(resource.markings.contains("purpose:" + context.purpose.id))
};
