import fs from 'node:fs';

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
}

function updateFile(file, transform) {
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${file}: no changes produced`);
  fs.writeFileSync(file, after);
}

updateFile('app/dashboard/operating-budget/page.js', (source) => {
  let text = source;

  text = replaceOnce(text, "saveLineEstimate('from_now')", "saveLineEstimate('ongoing')", 'canonical ongoing line-input scope');
  text = replaceOnce(text, '<label>القيمة المؤكدة/الفاتورة</label>', '<label>القيمة الفعلية</label>', 'actual value label');
  text = replaceOnce(text, '>هذا الشهر فقط</button>', '>تصحيح هذا الشهر</button>', 'this-month correction label');
  text = replaceOnce(text, '>من هذا الشهر وما بعده</button>', '>تغيير من الدورة الحالية</button>', 'ongoing change label');
  text = replaceOnce(text, '>تأكيد الفاتورة</button>', '>تثبيت القيمة الفعلية</button>', 'actual confirmation label');
  text = replaceOnce(text, '<th>المؤكد</th>', '<th>الفعلي</th>', 'statement actual header');

  const scheduleBlock = `      const schedulePayload = nodeForm.node_type === 'item' && nodeForm.anchor_date ? {
        recurrence_unit: nodeForm.recurrence_unit,
        recurrence_interval_count: Number(nodeForm.recurrence_interval_count || 1),
        anchor_date: nodeForm.anchor_date,
        accrual_start_rule: nodeForm.accrual_start_rule,
        accrual_lead_months: nodeForm.accrual_start_rule === 'fixed_months_before_due' ? Number(nodeForm.accrual_lead_months || 1) : null,
      } : null;
      if (schedulePayload && nodeForm.calculation_type !== 'external_forecast_actual' && !rateParams && !effectiveNodeRate) {`;

  const revisionBlock = `      const schedulePayload = nodeForm.node_type === 'item' && nodeForm.anchor_date ? {
        recurrence_unit: nodeForm.recurrence_unit,
        recurrence_interval_count: Number(nodeForm.recurrence_interval_count || 1),
        anchor_date: nodeForm.anchor_date,
        accrual_start_rule: nodeForm.accrual_start_rule,
        accrual_lead_months: nodeForm.accrual_start_rule === 'fixed_months_before_due' ? Number(nodeForm.accrual_lead_months || 1) : null,
      } : null;

      let revisionMode = 'new';
      let revisionValidFrom = nodeForm.valid_from;
      if (nodeForm.node_id && nodeForm.node_type === 'item' && (rateParams || schedulePayload)) {
        const currentEffectiveFrom = effectiveNodeRate?.valid_from || effectiveSchedule(nodeForm.node_id)?.valid_from || nodeForm.valid_from;
        const isCorrection = window.confirm(
          'هل هذا تصحيح لبيانات سابقة?\n\nاختيار «موافق» يعيد حساب التقديرات فقط وفق المعلومة المصححة، ولا يغيّر القيمة الفعلية أو المدفوع.'
        );
        if (isCorrection) {
          revisionMode = 'correction';
          revisionValidFrom = currentEffectiveFrom;
        } else {
          const applyFromCurrentCycle = window.confirm(
            'هل تريد تطبيق التغيير من دورة ' + monthLabelAr(month) + ' وما بعدها?\n\nاختيار «إلغاء» هنا يعني عدم الحفظ.'
          );
          if (!applyFromCurrentCycle) {
            setWorkErr('لم يتم الحفظ. عند تعديل قاعدة مالية قائمة اختر إما «تصحيح سابق» أو «تغيير من الدورة الحالية».');
            return;
          }
          revisionMode = 'current_cycle';
          revisionValidFrom = selectedMonthStart;
        }
      }

      if (schedulePayload && nodeForm.calculation_type !== 'external_forecast_actual' && !rateParams && !effectiveNodeRate) {`;
  text = replaceOnce(text, scheduleBlock, revisionBlock, 'catalog revision decision');

  text = replaceOnce(
    text,
    "p_rate_valid_from: nodeForm.node_type === 'item' ? nodeForm.valid_from : null,",
    "p_rate_valid_from: nodeForm.node_type === 'item' ? revisionValidFrom : null,",
    'rate revision effective date',
  );
  text = replaceOnce(
    text,
    "p_schedule_valid_from: nodeForm.node_type === 'item' ? nodeForm.valid_from : null,",
    "p_schedule_valid_from: nodeForm.node_type === 'item' ? revisionValidFrom : null,",
    'schedule revision effective date',
  );

  text = replaceOnce(
    text,
    "      setMsg(nodeForm.node_type === 'group' ? 'تم حفظ التصنيف. قيمته ستأتي من أبنائه فقط.' : 'تم حفظ العنصر وقاعدة حسابه ضمن المحرك الموحد.');",
    `      const successMessage = nodeForm.node_type === 'group'
        ? 'تم حفظ التصنيف. قيمته ستأتي من أبنائه فقط.'
        : revisionMode === 'correction'
          ? 'تم حفظ التصحيح وإعادة تقدير القيم المتوقعة فقط؛ القيمة الفعلية والمدفوع لم يتغيرا.'
          : revisionMode === 'current_cycle'
            ? 'تم حفظ التغيير من الدورة الحالية وما بعدها مع إبقاء التاريخ السابق كما هو.'
            : 'تم حفظ العنصر وقاعدة حسابه ضمن المحرك الموحد.';
      setMsg(successMessage);`,
    'catalog revision success message',
  );

  text = replaceOnce(
    text,
    'actions={<><input type="month" dir="ltr" value={month} onChange={(e) => setMonth(e.target.value)} /><button className="btn ghost" onClick={loadAll} disabled={busy}>تحديث</button></>}',
    'actions={<><input type="month" dir="ltr" value={month} onChange={(e) => setMonth(e.target.value)} /><a className="btn ghost" href={`/print/operating-budget?month=${month}`} target="_blank" rel="noreferrer">طباعة التقرير</a><button className="btn ghost" onClick={loadAll} disabled={busy}>تحديث</button></>}',
    'operating budget print action',
  );

  return text;
});

updateFile('app/print/operating-budget/page.js', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    "import { monthLabelAr } from '@/lib/operating-budget';",
    "import { monthKey, monthLabelAr } from '@/lib/operating-budget';\nimport { operationalDate } from '@/lib/system-constitution';",
    'Riyadh print month imports',
  );
  text = replaceOnce(
    text,
    "const requestedMonth = params.get('month') || new Date().toISOString().slice(0, 7);",
    "const requestedMonth = params.get('month') || monthKey(operationalDate());",
    'Riyadh print month default',
  );
  return text;
});

updateFile('scripts/v2-constitution-audit.mjs', (source) => {
  let text = source;
  text = replaceOnce(
    text,
    '      "+ عنصر مستقل",\n    ]) {',
    '      "+ عنصر مستقل",\n      "saveLineEstimate(\'from_now\')",\n    ]) {',
    'forbid noncanonical line input scope',
  );
  text = replaceOnce(
    text,
    "    if (!text.includes('أساس الاحتساب')) violations.push(`${pageRel}: calculation base must be explicit in the user interface`);",
    "    for (const token of ['أساس الاحتساب','تصحيح هذا الشهر','تغيير من الدورة الحالية','القيمة الفعلية','/print/operating-budget?month=']) {\n      if (!text.includes(token)) violations.push(`${pageRel}: missing governed operating-budget UI contract ${token}`);\n    }",
    'required budget revision UI contracts',
  );

  const marker = `
  if (fs.existsSync(libFull)) {`;
  const printAudit = `
  const printGovernanceRel = 'lib/print-governance.js';
  const printPageRel = 'app/print/operating-budget/page.js';
  const printGovernanceFull = path.join(root, printGovernanceRel);
  const printPageFull = path.join(root, printPageRel);
  if (!fs.existsSync(printPageFull)) violations.push(printPageRel + ': operating-budget print report is missing');
  if (!fs.existsSync(printGovernanceFull) || !fs.readFileSync(printGovernanceFull, 'utf8').includes('operating_budget_report')) {
    violations.push(printGovernanceRel + ': operating-budget report is not registered in print governance');
  }
`;
  text = replaceOnce(text, marker, printAudit + marker, 'print governance audit');
  return text;
});

console.log('PR #8 finalization transform completed.');
