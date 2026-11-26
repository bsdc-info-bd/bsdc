-- Internal metadata tables have no client-facing access path. RLS with no
-- policies denies access, but these explicit false policies make the contract
-- visible to schema audits and protect against future grants or policy edits.
-- Security-definer routines owned by the migration owner continue to operate;
-- browser roles receive no row-level access through these policies.

drop policy if exists audit_origin_keys_internal_deny on public.audit_origin_keys;
create policy audit_origin_keys_internal_deny
  on public.audit_origin_keys for all
  using (false)
  with check (false);

drop policy if exists bulk_plans_internal_deny on public.bulk_plans;
create policy bulk_plans_internal_deny
  on public.bulk_plans for all
  using (false)
  with check (false);

drop policy if exists verification_attempts_internal_deny on public.verification_attempts;
create policy verification_attempts_internal_deny
  on public.verification_attempts for all
  using (false)
  with check (false);

drop policy if exists verification_fields_internal_deny on public.verification_fields;
create policy verification_fields_internal_deny
  on public.verification_fields for all
  using (false)
  with check (false);
