import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardAccess } from '../lib/core/dashboard-access.js';
import { composeDashboardSession } from '../lib/core/dashboard-session.js';

const capability = (capability_key, module_key, scope_type = 'all') => ({
  capability_key,
  module_key,
  scope_type,
  scope_key:null,
  source_key:'test',
});

test('dashboard access keeps project-wide and project-scoped meanings separate', () => {
  const scoped = buildDashboardAccess({
    capabilities:[capability('projects.view.one', 'projects', 'project')],
  });
  assert.equal(scoped.access.projectsScreen, false);
  assert.equal(scoped.access.projectScoped, true);
  assert.equal(scoped.access.projects, false);

  const all = buildDashboardAccess({
    capabilities:[capability('projects.view.all', 'projects', 'all')],
  });
  assert.equal(all.access.projectsScreen, true);
  assert.equal(all.access.projectScoped, true);
});

test('primary user remains full admin regardless of capability rows', () => {
  const result = buildDashboardAccess({ capabilities:[], isPrimaryUser:true });
  assert.equal(result.access.fullAdmin, true);
  assert.equal(result.access.projects, true);
  assert.equal(result.access.hr, true);
  assert.equal(result.access.finance, true);
  assert.equal(result.access.documents, true);
  assert.equal(result.access.admin, true);
  assert.equal(result.access.approvals, true);
});

test('module and explicit capabilities keep their previous dashboard access effects', () => {
  const result = buildDashboardAccess({
    capabilities:[
      capability('finance.read', 'finance'),
      capability('system.approvals.view', 'system'),
      capability('system.access.manage_access', 'admin'),
    ],
  });
  assert.equal(result.access.finance, true);
  assert.equal(result.access.approvals, true);
  assert.equal(result.access.manageAccess, true);
  assert.equal(result.access.admin, true);
  assert.equal(result.access.hr, false);
});

test('dashboard session returns anonymous without a session', () => {
  assert.deepEqual(composeDashboardSession({}), { kind:'anonymous' });
});

test('dashboard session preserves password-change and denied gates', () => {
  const session = { user:{ id:'u-1', email:'user@example.com' } };
  const password = composeDashboardSession({
    session,
    userQ:{ data:{ employee_id:'e-1', role:'admin', is_active:true, is_system_admin:false, must_change_password:true } },
  });
  assert.equal(password.kind, 'password_change_required');

  const denied = composeDashboardSession({
    session,
    userQ:{ data:{ employee_id:'e-1', role:null, is_active:true, is_system_admin:false, must_change_password:false } },
  });
  assert.deepEqual(denied, { kind:'denied', reason:'account_unconfigured' });
});

test('dashboard session composes the same allowed projection from infrastructure snapshot', () => {
  const decision = composeDashboardSession({
    session:{ user:{ id:'u-1', email:'user@example.com' } },
    userQ:{ data:{ employee_id:'e-1', role:'finance', is_active:true, is_system_admin:false, must_change_password:false } },
    capsQ:{ data:[capability('finance.read', 'finance')] },
    primaryQ:{ data:false },
    actionQ:{ data:{ system_actor_user_id:'u-1', system_actor_employee_id:'e-1', acting_mode:'self' } },
  });

  assert.equal(decision.kind, 'allowed');
  assert.equal(decision.me.userId, 'u-1');
  assert.equal(decision.me.email, 'user@example.com');
  assert.equal(decision.me.access.finance, true);
  assert.equal(decision.me.access.hr, false);
  assert.equal(decision.me.actionContext.actingMode, 'self');
  assert.equal(decision.me.actionContext.realActorEmployeeId, 'e-1');
});
