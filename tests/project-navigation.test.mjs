import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AREAS,
  PROJECT_NAV_GROUPS,
  activeProjectNavigationKey,
  normalizeProjectView,
  projectNavigationHref,
} from '../lib/app-constitution.js';

const PROJECT_ID = 'P1';
const items = PROJECT_NAV_GROUPS.flatMap((group) => group.items);
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('project navigation is grouped by the current real work worlds without duplicating functions', () => {
  assert.deepEqual(PROJECT_NAV_GROUPS.map((group) => group.key), [
    'status', 'operations', 'contract', 'finance', 'documents',
  ]);
  assert.deepEqual(PROJECT_NAV_GROUPS.map((group) => group.label), [
    'موقف المشروع', 'التشغيل', 'العقد والنطاق', 'المال والمستخلصات', 'المستندات والمتابعة',
  ]);
  assert.equal(PROJECT_NAV_GROUPS[0].items[0].key, 'overview');
  assert.equal(PROJECT_NAV_GROUPS[1].items.some((item) => item.key === 'attendance'), true);
  assert.equal(PROJECT_NAV_GROUPS[1].items.some((item) => item.key === 'timesheet-reports'), true);
  assert.equal(PROJECT_NAV_GROUPS[2].items.some((item) => item.key === 'scope'), true);
  assert.equal(PROJECT_NAV_GROUPS[3].items.some((item) => item.key === 'claims'), true);
  assert.equal(PROJECT_NAV_GROUPS[4].items.some((item) => item.key === 'docs'), true);
});

test('project navigation has one canonical entry per visible function', () => {
  const keys = items.map((item) => item.key);
  const hrefs = items.map((item) => projectNavigationHref(PROJECT_ID, item));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.equal(hrefs.some((href) => href.includes('/site-operations')), false);
});

test('global timesheet report route is compatibility-only, not top navigation', () => {
  const projectsArea = AREAS.find((area) => area.key === 'projects');
  const legacy = projectsArea.items.find((item) => item.href === '/dashboard/site-operations/reports');
  assert.equal(legacy?.hidden, true);
  assert.equal(items.filter((item) => item.key === 'timesheet-reports').length, 1);
});

test('legacy execution view resolves to the governed assignment view', () => {
  assert.equal(normalizeProjectView('exec'), 'scope');
  assert.equal(normalizeProjectView('unknown'), 'overview');
});

test('project root navigation follows the selected view', () => {
  assert.equal(activeProjectNavigationKey({
    projectId:PROJECT_ID,
    pathname:'/dashboard/projects/P1',
    view:'claims',
  }), 'claims');
  assert.equal(activeProjectNavigationKey({
    projectId:PROJECT_ID,
    pathname:'/dashboard/projects/P1',
    view:null,
  }), 'overview');
});

test('nested operational routes resolve to exactly one project navigation item', () => {
  assert.equal(activeProjectNavigationKey({
    projectId:PROJECT_ID,
    pathname:'/dashboard/projects/P1/operations/labor',
    view:null,
  }), 'labor');
  assert.equal(activeProjectNavigationKey({
    projectId:PROJECT_ID,
    pathname:'/dashboard/projects/P1/operations/reports',
    view:null,
  }), 'timesheet-reports');
  assert.equal(activeProjectNavigationKey({
    projectId:PROJECT_ID,
    pathname:'/dashboard/projects/P1/operations/expenses',
    view:null,
  }), 'expenses');
  assert.equal(activeProjectNavigationKey({
    projectId:PROJECT_ID,
    pathname:'/dashboard/projects/P1/operations/movements',
    view:null,
  }), 'movements');
});

test('timesheet reports have one shared implementation for global compatibility and project workflow', () => {
  const globalReports = read('app/dashboard/site-operations/reports/page.js');
  const projectReports = read('app/dashboard/projects/[id]/operations/reports/page.js');
  assert.match(globalReports, /TimesheetReportCenter/);
  assert.match(projectReports, /TimesheetReportCenter/);
  assert.match(projectReports, /fixedProjectId=\{id\}/);
  assert.equal(globalReports.includes('labor_project_assignments'), false);
  assert.equal(projectReports.includes('labor_project_assignments'), false);
});

test('custody is not duplicated by the old money workspace', () => {
  assert.equal(items.some((item) => item.key === 'money'), false);
  assert.equal(items.filter((item) => item.key === 'custody').length, 1);
  assert.equal(items.filter((item) => item.key === 'guarantees').length, 1);
});

test('project pages cannot reintroduce stacked local navigation', () => {
  const projectPage = read('app/dashboard/projects/[id]/page.js');
  const operationsLayout = read('app/dashboard/projects/[id]/operations/layout.js');
  assert.equal(projectPage.includes('const TABS'), false);
  assert.equal(projectPage.includes('ProjExecution'), false);
  assert.equal(projectPage.includes('ProjMoney'), false);
  assert.equal(operationsLayout.includes('<nav'), false);
});

test('legacy documents and materials URLs are redirects, not parallel workspaces', () => {
  const documentsPage = read('app/dashboard/projects/[id]/documents/page.js');
  const materialsPage = read('app/dashboard/projects/[id]/materials/page.js');
  assert.match(documentsPage, /redirect\(`\/dashboard\/projects\/\$\{params\.id\}\?view=docs`\)/);
  assert.match(materialsPage, /redirect\(`\/dashboard\/projects\/\$\{params\.id\}\?view=docs`\)/);
});
