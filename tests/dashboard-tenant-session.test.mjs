import test from 'node:test';
import assert from 'node:assert/strict';
import { composeDashboardSession } from '../lib/core/dashboard-session.js';

function baseSnapshot(overrides = {}) {
  return {
    session:{ user:{ id:'user-1', email:'user@example.test' } },
    tenant:{ mode:'legacy' },
    userQ:{
      data:{
        employee_id:null,
        role:'ceo',
        is_active:true,
        is_system_admin:true,
        must_change_password:false,
        access_profile:'operational',
      },
      error:null,
    },
    capsQ:{ data:[], error:null },
    primaryQ:{ data:true, error:null },
    actionQ:{ data:null, error:null },
    ...overrides,
  };
}

test('legacy mode remains allowed during transition', () => {
  const result = composeDashboardSession(baseSnapshot());
  assert.equal(result.kind,'allowed');
  assert.equal(result.me.tenant.mode,'legacy');
});

test('multi-tenant mode carries the active organization into the session', () => {
  const tenant = {
    mode:'multi_tenant',
    activeOrganization:{ id:'org-a', slug:'org-a', nameAr:'أ', nameEn:'A', status:'active' },
    activeRole:'owner',
    memberships:[],
  };
  const result = composeDashboardSession(baseSnapshot({ tenant }));
  assert.equal(result.kind,'allowed');
  assert.equal(result.me.tenant.activeOrganization.id,'org-a');
  assert.equal(result.me.tenant.activeRole,'owner');
});

test('an authenticated user with no active organization is denied', () => {
  const result = composeDashboardSession(baseSnapshot({
    tenant:{ mode:'unassigned', activeOrganization:null, memberships:[] },
  }));
  assert.deepEqual(result,{ kind:'denied', reason:'organization_unassigned' });
});

test('tenant lookup errors fail closed', () => {
  const result = composeDashboardSession(baseSnapshot({
    tenant:{ mode:'error', activeOrganization:null, memberships:[] },
  }));
  assert.deepEqual(result,{ kind:'denied', reason:'tenant_lookup_failed' });
});

test('anonymous behavior remains unchanged', () => {
  const result = composeDashboardSession(baseSnapshot({ session:null }));
  assert.deepEqual(result,{ kind:'anonymous' });
});
