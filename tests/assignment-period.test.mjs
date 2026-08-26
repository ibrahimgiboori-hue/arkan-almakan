import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentOverlaps } from '../lib/assignment-period.mjs';
test('a range with a start on/before and end on/after the window overlaps',()=>assert.equal(assignmentOverlaps({valid_from:'2026-08-03',valid_to:'2026-08-10'},'2026-08-01','2026-08-05'),true));
test('a range entirely before the window does not overlap',()=>assert.equal(assignmentOverlaps({valid_from:'2026-07-01',valid_to:'2026-07-31'},'2026-08-01','2026-08-05'),false));
test('an open-ended range overlaps if it starts on/before the window ends',()=>assert.equal(assignmentOverlaps({valid_from:'2026-08-03',valid_to:null},'2026-08-01','2026-08-05'),true));
test('missing assignment or bounds never overlaps',()=>{assert.equal(assignmentOverlaps(null,'2026-08-01','2026-08-05'),false);assert.equal(assignmentOverlaps({valid_from:'2026-08-01',valid_to:null},null,'2026-08-05'),false);});
