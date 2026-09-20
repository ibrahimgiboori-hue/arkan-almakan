import test from 'node:test';
import assert from 'node:assert/strict';
import { canSeeArea, canUseCapability } from '../lib/access-ui.js';

function multiTenantSession(moduleKeys) {
  return {
    tenant:{
      mode:'multi_tenant',
      moduleKeys:new Set(moduleKeys),
      modules:[...moduleKeys].map((key)=>({key,status:'active'})),
    },
    access:{
      fullAdmin:true,
      moduleEntitlementsApplied:true,
      projects:false,
      projectsScreen:false,
      projectScoped:false,
      hr:true,
      finance:false,
      documents:false,
      admin:true,
      manageAccess:true,
      approvals:true,
    },
    capabilities:[],
  };
}

test('full admin cannot see a disabled tenant module', () => {
  const session = multiTenantSession(['core','hr']);
  assert.equal(canSeeArea('projects',session.access),false);
  assert.equal(canSeeArea('workforce',session.access),true);
  assert.equal(canSeeArea('finance',session.access),false);
});

test('full admin cannot invoke a capability for a disabled tenant module', () => {
  const session = multiTenantSession(['core','hr']);
  assert.equal(canUseCapability(session,'projects.projects.view'),false);
  assert.equal(canUseCapability(session,'finance.operating_budget.view'),false);
  assert.equal(canUseCapability(session,'hr.attendance.view'),true);
  assert.equal(canUseCapability(session,'system.approvals.view'),true);
});

test('legacy full admin keeps historical unrestricted navigation during migration', () => {
  const access={ fullAdmin:true };
  assert.equal(canSeeArea('projects',access),true);
  assert.equal(canSeeArea('finance',access),true);
});
