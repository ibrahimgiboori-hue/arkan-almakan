import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTenantModuleEntitlements, normalizeTenantMemberships, resolveTenantContext, tenantWithModules } from '../lib/core/tenant-context.js';

const orgs = [
  { id:'org-a', slug:'a', name_ar:'أ', name_en:'A', status:'active' },
  { id:'org-b', slug:'b', name_ar:'ب', name_en:'B', status:'active' },
  { id:'org-c', slug:'c', name_ar:'ج', name_en:'C', status:'suspended' },
];

const memberships = [
  { organization_id:'org-a', membership_role:'owner', status:'active', is_default:true },
  { organization_id:'org-b', membership_role:'member', status:'active', is_default:false },
  { organization_id:'org-c', membership_role:'admin', status:'active', is_default:false },
];

test('tenant context defaults to the default active organization', () => {
  const result = resolveTenantContext({ memberships, organizations:orgs });
  assert.equal(result.mode,'multi_tenant');
  assert.equal(result.activeOrganization.id,'org-a');
  assert.equal(result.activeRole,'owner');
});

test('tenant context accepts a preferred organization only when membership is active', () => {
  const result = resolveTenantContext({
    memberships,
    organizations:orgs,
    preferredOrganizationId:'org-b',
  });
  assert.equal(result.activeOrganization.id,'org-b');
  assert.equal(result.activeRole,'member');
});

test('tenant context rejects a forged preferred organization and falls back safely', () => {
  const result = resolveTenantContext({
    memberships,
    organizations:orgs,
    preferredOrganizationId:'org-evil',
  });
  assert.equal(result.activeOrganization.id,'org-a');
});

test('suspended organizations are removed even when membership itself is active', () => {
  const normalized = normalizeTenantMemberships({ memberships, organizations:orgs });
  assert.deepEqual(normalized.map((item) => item.organizationId),['org-a','org-b']);
});

test('a user without an active organization is explicitly unassigned', () => {
  const result = resolveTenantContext({ memberships:[], organizations:orgs });
  assert.equal(result.mode,'unassigned');
  assert.equal(result.activeOrganization,null);
});

test('tenant modules expose only active and trial entitlements', () => {
  const base = resolveTenantContext({ memberships, organizations:orgs });
  const tenant = tenantWithModules(base,[
    { module_key:'core', status:'active', settings:{} },
    { module_key:'hr', status:'trial', settings:{} },
    { module_key:'projects', status:'disabled', settings:{} },
  ]);
  assert.deepEqual([...tenant.moduleKeys].sort(),['core','hr']);
});

test('module entitlements intersect with user capabilities', () => {
  const base = resolveTenantContext({ memberships, organizations:orgs });
  const tenant = tenantWithModules(base,[
    { module_key:'core', status:'active', settings:{} },
    { module_key:'hr', status:'active', settings:{} },
    { module_key:'finance_ops', status:'disabled', settings:{} },
  ]);
  const gated = applyTenantModuleEntitlements({
    projects:true,
    projectsScreen:true,
    projectScoped:true,
    hr:true,
    finance:true,
    documents:true,
    admin:true,
    manageAccess:true,
    approvals:true,
  },tenant);
  assert.equal(gated.hr,true);
  assert.equal(gated.finance,false);
  assert.equal(gated.projects,false);
  assert.equal(gated.documents,false);
  assert.equal(gated.admin,true);
  assert.equal(gated.approvals,true);
});
