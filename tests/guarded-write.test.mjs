import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { interpretGuardedWrite } from '../lib/guarded-write.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const CONFLICT = 'لم يتغيّر شيء.';

test('a guarded write that changed nothing is never reported as success', () => {
  // هذه هي الحالة الخطرة: الحارس .eq('status','open') لم يطابق أي صف،
  // فترجع supabase error=null و data=null معًا.
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

  // كل تحديث محروس بحالة يجب أن يطلب الصفوف المتأثرة، وإلا فلا سبيل لمعرفة أن شيئًا تغيّر.
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
  // الحارس نفسه يجب أن يفحص err قبل أن يرسم بديل التحميل — لا مجرد وجود err في الملف.
  const guard = claims.match(/if \(!claims\) \{[\s\S]*?\n  \}/);
  assert.ok(guard, 'claims must still guard on the unloaded state');
  const body = guard[0];
  const errorLine = body.indexOf('if (err) return');
  const placeholderLine = body.indexOf('className="empty"');
  assert.ok(errorLine > -1, 'the guard must render the captured error');
  assert.ok(placeholderLine > -1, 'the guard must still have a loading placeholder');
  assert.ok(errorLine < placeholderLine, 'the error must be checked before the loading placeholder');
});

test('a queued attendance write distinguishes offline from server rejection', () => {
  const attendance = read('app/dashboard/projects/[id]/operations/page.js');
  assert.equal(attendance.includes('function queuedNotice'), true);
  assert.equal(attendance.includes('result?.error'), true);
  // لا يجوز أن تبقى رسالة «حُفظت … وتنتظر الاتصال» تُطبع دون فحص سبب الانتظار.
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
