import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { interpretGuardedWrite } from '../lib/guarded-write.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const CONFLICT = 'لم يتغيّر شيء.';

test('a guarded write that changed nothing is never reported as success', () => {
  const outcome = interpretGuardedWrite({ error:null, data:null }, { conflictMessage:CONFLICT });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.changedRows, 0);
  assert.equal(outcome.message, CONFLICT);
});

test('an empty returned array is also nothing changed', () => {
  const outcome = interpretGuardedWrite({ error:null, data:[] }, { conflictMessage:CONFLICT });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.message, CONFLICT);
});

test('a real changed row is success', () => {
  assert.deepEqual(
    interpretGuardedWrite({ error:null, data:{ id:'m1' } }, { conflictMessage:CONFLICT }),
    { ok:true, changedRows:1, message:null },
  );
  assert.deepEqual(
    interpretGuardedWrite({ error:null, data:[{ id:'m1' }, { id:'m2' }] }, { conflictMessage:CONFLICT }),
    { ok:true, changedRows:2, message:null },
  );
});

test('a real error keeps its own message and never shows the conflict text', () => {
  const outcome = interpretGuardedWrite({ error:{ message:'permission denied' } }, { conflictMessage:CONFLICT });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.message, 'permission denied');
});

test('a conflict message is mandatory — silence is not an option', () => {
  assert.throws(() => interpretGuardedWrite({ error:null, data:null }, {}), /conflictMessage/);
});

test('guarded screens ask for the affected rows instead of trusting error alone', () => {
  const custody = read('app/dashboard/projects/[id]/operations/custody/page.js');
  const claims = read('components/ProjClaims.js');

  assert.equal(custody.includes('interpretGuardedWrite'), true);
  assert.equal(claims.includes('interpretGuardedWrite'), true);

  for (const [name, source] of [['custody', custody], ['claims', claims]]) {
    const guarded = source.match(/\.eq\('status',\s*'(open|available)'\)[^\n]*/g) || [];
    assert.ok(guarded.length > 0, `${name} should still have status-guarded writes`);
    for (const line of guarded) {
      assert.match(line, /\.select\(/, `${name}: guarded write must select affected rows -> ${line}`);
    }
  }
});

test('the claims tab surfaces a load error instead of loading forever', () => {
  const claims = read('components/ProjClaims.js');
  assert.match(claims, /if \(cr\.error \|\| av\.error \|\| it\.error\)/);
  assert.match(claims, /setErr\(\(cr\.error \|\| av\.error \|\| it\.error\)\?\.message \|\| 'تعذر تحميل المستخلصات'\)/);
  assert.match(claims, /setClaims\(\[\]\); return;/);
  assert.match(claims, /if\(claims===null\)return <div className="empty">جارٍ تحميل رحلة المستخلصات/);
  assert.match(claims, /\{err&&<div className="msg err"/);
});

test('a queued attendance write distinguishes offline from server rejection', () => {
  const attendance = read('app/dashboard/projects/[id]/operations/attendance-workspace.js');
  assert.equal(attendance.includes('function queuedNotice'), true);
  assert.equal(attendance.includes('result?.error'), true);
  assert.equal(/setMsg\(`حُفظت [^`]*تنتظر الاتصال/.test(attendance), false);
});

test('material deletion no longer swallows its error', () => {
  const docs = read('components/ProjDocs.js');
  assert.equal(/await supabase\.from\('project_materials'\)\.delete\(\)\.eq\('id', id\); load\(\);/.test(docs), false);
  assert.match(docs, /تعذّر حذف المادة/);
});

test('project custody uses the constitutional Riyadh day, not the UTC day', () => {
  const custody = read('app/dashboard/projects/[id]/operations/custody/page.js');
  assert.equal(custody.includes("new Date().toISOString().slice(0,10)"), false);
  assert.equal(custody.includes('todayIsoInRiyadh'), true);
});