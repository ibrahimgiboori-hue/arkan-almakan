import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACTOR_DATE_STATE,
  CONTRACTOR_READINESS,
  INTEGRITY_ISSUE,
  LIVE_OPERATION_BLOCKER,
  auditProjectOperationIntegrity,
  buildProjectOperationRoster,
  detectOperationIntegrityIssues,
  resolveProjectOperationRoster,
  rosterContractorsAvailableForNewLiveOperation,
  rosterContractorsEligibleForSelectedDate,
  rosterContractorsReadyForDailyOperation,
  rosterLaborersAvailableForNewLiveOperation,
  rosterLaborersEligibleForSelectedDate,
} from '../lib/operations-governance.js';

const DATE='2026-08-15';
const contractor=(id='C1',active=true)=>({id,name_ar:`مقاول ${id}`,is_active:active});
const laborer=(id='L1',active=true)=>({id,full_name:`عامل ${id}`,labor_class:'worker',is_active:active});
const profile=(overrides={})=>({id:'PC1',project_id:'P1',contractor_id:'C1',start_date:'2026-01-01',end_date:null,is_active:true,...overrides});
const execution=(overrides={})=>({id:'E1',project_id:'P1',project_item_id:'I1',contractor_id:'C1',mode:'daywork',start_date:'2026-08-01',end_date:null,is_active:true,...overrides});
const assignment=(overrides={})=>({id:'A1',project_id:'P1',laborer_id:'L1',contractor_id:'C1',valid_from:'2026-08-01',valid_to:null,labor_class:'worker',...overrides});
const roster=(overrides={})=>buildProjectOperationRoster({
  projectId:'P1',date:DATE,
  projectContractors:[profile()],itemExecutions:[execution()],assignments:[assignment()],
  contractors:[contractor()],laborers:[laborer()],...overrides,
});

test('project contractor profile with zero execution and zero labor stays visible',()=>{
  const r=roster({itemExecutions:[],assignments:[],laborers:[]});
  assert.equal(r.contractors.length,1);
  assert.equal(r.contractors[0].projectProfilePresent,true);
  assert.equal(r.contractors[0].readiness,CONTRACTOR_READINESS.NEEDS_EXECUTION_ASSIGNMENT);
  assert.equal(r.contractors[0].hasNoLaborersLoaded,true);
});

test('planned item assignment is ready to start and does not require fake labor',()=>{
  const r=roster({itemExecutions:[execution({start_date:null})],assignments:[],laborers:[]});
  assert.equal(r.contractors[0].plannedExecutionAssignments.length,1);
  assert.equal(r.contractors[0].executionDateEligible,false);
  assert.equal(r.contractors[0].readiness,CONTRACTOR_READINESS.READY_TO_START);
});

test('started execution with zero labor becomes a clear needs-labor state',()=>{
  const r=roster({assignments:[],laborers:[]});
  assert.equal(r.contractors[0].executionDateEligible,true);
  assert.equal(r.contractors[0].readiness,CONTRACTOR_READINESS.NEEDS_LABOR);
  assert.equal(r.contractors[0].readyForDailyOperation,false);
});

test('started execution plus eligible labor is ready for daily operation',()=>{
  const r=roster();
  assert.equal(r.contractors[0].readiness,CONTRACTOR_READINESS.READY);
  assert.equal(r.contractors[0].readyForDailyOperation,true);
  assert.equal(r.summary.readyForDailyOperationContractorCount,1);
});

test('project_contractors dates are not historical execution authority',()=>{
  const r=roster({
    date:'2026-08-10',
    projectContractors:[profile({start_date:'2026-09-01',end_date:'2026-09-02',is_active:false})],
    itemExecutions:[execution({start_date:'2026-08-01',end_date:'2026-08-20',is_active:false})],
    assignments:[assignment({valid_from:'2026-08-05',valid_to:'2026-08-15'})],
  });
  const c=r.contractors[0];
  assert.equal(c.executionDateEligible,true);
  assert.equal(c.relationshipDateEligible,true);
  assert.equal(c.projectProfileEnabledNow,false);
  assert.equal(c.availableForNewLiveOperation,false);
  assert.equal(c.dateState,CONTRACTOR_DATE_STATE.ELIGIBLE);
  assert.equal(r.hasDataIntegrityIssues,false);
});

test('started execution without project contractor profile is a data issue',()=>{
  const r=roster({projectContractors:[],assignments:[],laborers:[]});
  const c=r.contractors[0];
  assert.equal(c.executionDateEligible,true);
  assert.equal(c.availableForNewLiveOperation,false);
  assert.equal(c.readiness,CONTRACTOR_READINESS.DATA_ISSUE);
  assert.ok(c.liveOperationBlockers.includes(LIVE_OPERATION_BLOCKER.PROJECT_PROFILE_MISSING));
  assert.ok(r.integrityIssues.some(i=>i.type===INTEGRITY_ISSUE.STARTED_EXECUTION_WITHOUT_PROJECT_CONTRACTOR_PROFILE));
});

test('planned execution without profile is visible but is not historical corruption yet',()=>{
  const r=roster({projectContractors:[],itemExecutions:[execution({start_date:null})],assignments:[],laborers:[]});
  assert.equal(r.contractors.length,1);
  assert.equal(r.hasDataIntegrityIssues,false);
  assert.equal(r.contractors[0].readiness,CONTRACTOR_READINESS.BLOCKED);
  assert.ok(r.contractors[0].liveOperationBlockers.includes(LIVE_OPERATION_BLOCKER.PROJECT_PROFILE_MISSING));
});

test('labor assignment without project contractor profile is a data issue',()=>{
  const issues=detectOperationIntegrityIssues([],[],[assignment()]);
  assert.equal(issues[0].type,INTEGRITY_ISSUE.LABOR_ASSIGNMENT_WITHOUT_PROJECT_CONTRACTOR_PROFILE);
});

test('missing contractor entity fails safe',()=>{
  const r=roster({contractors:[]});
  const c=r.contractors[0];
  assert.equal(c.contractorEntityActiveNow,false);
  assert.equal(c.availableForNewLiveOperation,false);
  assert.ok(c.liveOperationBlockers.includes(LIVE_OPERATION_BLOCKER.MISSING_CONTRACTOR_ENTITY));
  assert.ok(r.integrityIssues.some(i=>i.type===INTEGRITY_ISSUE.MISSING_CONTRACTOR_ENTITY));
});

test('missing laborer entity fails safe',()=>{
  const r=roster({laborers:[]});
  const l=r.contractors[0].laborers[0];
  assert.equal(l.laborerEntityActiveNow,false);
  assert.equal(l.availableForNewLiveOperation,false);
  assert.ok(l.liveOperationBlockers.includes(LIVE_OPERATION_BLOCKER.MISSING_LABORER_ENTITY));
});

test('inactive entities block new operation without rewriting selected-date history',()=>{
  const r=roster({contractors:[contractor('C1',false)],laborers:[laborer('L1',false)]});
  const c=r.contractors[0],l=c.laborers[0];
  assert.equal(c.relationshipDateEligible,true);
  assert.equal(l.eligibleForSelectedDate,true);
  assert.equal(c.availableForNewLiveOperation,false);
  assert.equal(l.availableForNewLiveOperation,false);
});

test('labor assignment is_active is not temporal authority',()=>{
  const l=roster({assignments:[assignment({is_active:false})]}).contractors[0].laborers[0];
  assert.equal(l.assignmentDateEligible,true);
  assert.equal(l.eligibleForSelectedDate,true);
  assert.equal(l.availableForNewLiveOperation,true);
});

test('multiple assignments on one item are preserved instead of collapsed',()=>{
  const r=buildProjectOperationRoster({
    projectId:'P1',date:DATE,
    projectContractors:[profile(),profile({id:'PC2',contractor_id:'C2'})],
    itemExecutions:[execution(),execution({id:'E2',contractor_id:'C2',share_qty:50})],
    assignments:[],contractors:[contractor(),contractor('C2')],laborers:[],
  });
  assert.equal(r.contractors.length,2);
  assert.equal(r.summary.executionAssignmentCountForSelectedDate,2);
  assert.equal(r.contractors.find(x=>x.contractorId==='C2').executionAssignments[0].id,'E2');
});

test('internal/self execution is counted without inventing a contractor',()=>{
  const r=roster({itemExecutions:[execution({id:'SELF',contractor_id:null,mode:'self'})],assignments:[],laborers:[]});
  assert.equal(r.summary.internalExecutionAssignmentCountForSelectedDate,1);
  assert.equal(r.contractors.length,1); // project profile remains visible independently
});

test('selectors distinguish selected-date evidence, current availability and daily readiness',()=>{
  const r=roster({projectContractors:[profile({is_active:false})]});
  assert.equal(rosterContractorsEligibleForSelectedDate(r).length,1);
  assert.equal(rosterContractorsAvailableForNewLiveOperation(r).length,0);
  assert.equal(rosterContractorsReadyForDailyOperation(r).length,0);
  assert.equal(rosterLaborersEligibleForSelectedDate(r,'C1').length,1);
  assert.equal(rosterLaborersAvailableForNewLiveOperation(r,'C1').length,0);
});

function fakeSupabase(tables){
  return{
    from(table){
      const rows=tables[table]||[],filters=[];
      const b={
        select(){return b;},
        eq(c,v){filters.push(r=>r[c]===v);return b;},
        in(c,vs){filters.push(r=>vs.includes(r[c]));return b;},
        lte(c,v){filters.push(r=>r[c]!=null&&r[c]<=v);return b;},
        is(c,v){filters.push(r=>v===null?r[c]==null:r[c]===v);return b;},
        or(expr){
          const clauses=expr.split(',').map(clause=>{
            const[c,op,v]=clause.split('.');
            return r=>op==='is'&&v==='null'?r[c]==null:op==='gte'?r[c]!=null&&r[c]>=v:false;
          });
          filters.push(r=>clauses.some(fn=>fn(r)));
          return b;
        },
        then(resolve,reject){
          try{resolve({data:rows.filter(r=>filters.every(fn=>fn(r))),error:null});}
          catch(e){reject(e);}
        },
      };
      return b;
    },
  };
}

test('integration: profile is visible before labor, then becomes ready after labor is assigned',async()=>{
  const tables={
    project_contractors:[profile()],
    v_item_execution_assignments:[execution()],
    labor_project_assignments:[],
    contractors:[contractor()],
    laborers:[],
  };
  const s=fakeSupabase(tables);
  const before=await resolveProjectOperationRoster({supabase:s,projectId:'P1',date:DATE});
  assert.equal(before.contractors[0].readiness,CONTRACTOR_READINESS.NEEDS_LABOR);
  tables.labor_project_assignments.push(assignment());
  tables.laborers.push(laborer());
  const after=await resolveProjectOperationRoster({supabase:s,projectId:'P1',date:DATE});
  assert.equal(after.contractors[0].readiness,CONTRACTOR_READINESS.READY);
});

test('integration: live resolver is date scoped while audit catches stale execution/profile corruption',async()=>{
  const tables={
    project_contractors:[profile()],
    v_item_execution_assignments:[
      execution(),
      execution({id:'OLD',project_item_id:'I2',contractor_id:'C2',start_date:'2021-01-01',end_date:'2021-02-01'}),
    ],
    labor_project_assignments:[assignment()],
    contractors:[contractor(),contractor('C2')],
    laborers:[laborer()],
  };
  const s=fakeSupabase(tables);
  const live=await resolveProjectOperationRoster({supabase:s,projectId:'P1',date:DATE});
  assert.equal(live.integrityIssues.some(i=>i.executionId==='OLD'),false);
  const audit=await auditProjectOperationIntegrity({supabase:s,projectId:'P1'});
  assert.equal(audit.integrityIssues.some(i=>i.executionId==='OLD'),true);
});
