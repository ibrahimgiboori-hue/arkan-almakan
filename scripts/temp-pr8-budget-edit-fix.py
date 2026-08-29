from pathlib import Path
import re

p = Path('app/dashboard/operating-budget/page.js')
s = p.read_text(encoding='utf-8')


def replace_once(old, new):
    global s
    if old not in s:
        raise SystemExit('Expected source fragment not found:\n' + old[:500])
    s = s.replace(old, new, 1)


replace_once(
    "const COMPONENT_CALC_TYPES = ['employee_based_contribution', 'subscription_plus_usage', 'composite_formula'];\n",
    "const COMPONENT_CALC_TYPES = ['employee_based_contribution', 'subscription_plus_usage', 'composite_formula'];\nconst ONGOING_INPUT_CALC_TYPES = new Set(['fixed_amount', 'variable_monthly', 'quantity_x_unit_price']);\n",
)

replace_once(
    "function amountLabel(value) {\n  return `${money(value)} ريال`;\n}\n",
    "function amountLabel(value) {\n  return `${money(value)} ريال`;\n}\n\nfunction stableJson(value) {\n  if (Array.isArray(value)) return value.map(stableJson);\n  if (value && typeof value === 'object') {\n    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));\n  }\n  return value ?? null;\n}\n\nfunction sameJson(left, right) {\n  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));\n}\n",
)

replace_once(
    "    node_type: nodeType,\n    parent_item_id: parent?.id || '',\n",
    "    node_type: nodeType,\n    branch_scope_id: parent?.branch_scope_id || '',\n    parent_item_id: parent?.id || '',\n",
)
replace_once(
    "    valid_from: validFrom,\n    recurrence_unit: 'month',\n",
    "    valid_from: validFrom,\n    schedule_valid_to: '',\n    recurrence_unit: 'month',\n",
)
replace_once(
    "      node_type: node.node_type,\n      parent_item_id: node.parent_item_id || '',\n",
    "      node_type: node.node_type,\n      branch_scope_id: node.branch_scope_id || '',\n      parent_item_id: node.parent_item_id || '',\n",
)
replace_once(
    "      valid_from: rate?.valid_from || schedule?.valid_from || selectedMonthStart,\n      recurrence_unit: schedule?.recurrence_unit || 'month',\n",
    "      valid_from: rate?.valid_from || schedule?.valid_from || selectedMonthStart,\n      schedule_valid_to: schedule?.valid_to || '',\n      recurrence_unit: schedule?.recurrence_unit || 'month',\n",
)

new_save = r'''  async function saveCatalogNode(e) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setErr('');
    setMsg('');
    setWorkErr('');
    try {
      if (nodeForm.node_type === 'item' && !nodeForm.parent_item_id) throw new Error('العنصر الحسابي يجب أن يكون داخل تصنيف.');
      const parent = groups.find((g) => g.id === nodeForm.parent_item_id);
      const rateParams = buildRateParams();
      const schedulePayload = nodeForm.node_type === 'item' && nodeForm.anchor_date ? {
        valid_to: nodeForm.schedule_valid_to || null,
        recurrence_unit: nodeForm.recurrence_unit,
        recurrence_interval_count: Number(nodeForm.recurrence_interval_count || 1),
        anchor_date: nodeForm.anchor_date,
        accrual_start_rule: nodeForm.accrual_start_rule,
        accrual_lead_months: nodeForm.accrual_start_rule === 'fixed_months_before_due' ? Number(nodeForm.accrual_lead_months || 1) : null,
      } : null;

      const normalizedBands = nodeForm.bands.map((b, i) => ({
        band_order: i + 1,
        min_count: num(b.min_count),
        max_count: String(b.max_count ?? '').trim() === '' ? null : num(b.max_count),
        band_mode: b.band_mode || 'flat_fee_on_entry',
        band_amount: num(b.band_amount),
      }));

      const currentRate = nodeForm.node_id && nodeForm.node_type === 'item' ? effectiveRate(nodeForm.node_id) : null;
      const currentSchedule = nodeForm.node_id && nodeForm.node_type === 'item' ? effectiveSchedule(nodeForm.node_id) : null;
      const currentBands = currentRate ? bandsForRate(currentRate.id).map((b, i) => ({
        band_order: i + 1,
        min_count: num(b.min_count),
        max_count: b.max_count == null ? null : num(b.max_count),
        band_mode: b.band_mode || 'flat_fee_on_entry',
        band_amount: num(b.band_amount),
      })) : [];
      const currentEffectiveFrom = currentRate?.valid_from || currentSchedule?.valid_from || nodeForm.valid_from;
      const effectiveFromChanged = Boolean(nodeForm.node_id) && nodeForm.valid_from !== currentEffectiveFrom;
      const rateChanged = Boolean(rateParams) && (
        !currentRate || effectiveFromChanged || !sameJson(rateParams, currentRate.params || {}) || !sameJson(normalizedBands, currentBands)
      );
      const scheduleChanged = Boolean(schedulePayload) && (
        !currentSchedule || effectiveFromChanged ||
        (currentSchedule.valid_to || null) !== (schedulePayload.valid_to || null) ||
        currentSchedule.recurrence_unit !== schedulePayload.recurrence_unit ||
        Number(currentSchedule.recurrence_interval_count || 1) !== Number(schedulePayload.recurrence_interval_count || 1) ||
        currentSchedule.anchor_date !== schedulePayload.anchor_date ||
        currentSchedule.accrual_start_rule !== schedulePayload.accrual_start_rule ||
        Number(currentSchedule.accrual_lead_months || 0) !== Number(schedulePayload.accrual_lead_months || 0)
      );
      const financialConfigChanged = rateChanged || scheduleChanged;

      let revisionMode = 'descriptive';
      let revisionValidFrom = nodeForm.valid_from;
      if (!nodeForm.node_id) revisionMode = 'new';
      if (nodeForm.node_id && nodeForm.node_type === 'item' && financialConfigChanged) {
        const isCorrection = window.confirm(
          'هل هذا تصحيح لبيانات سابقة؟\n\nاختيار «موافق» يعيد حساب التقديرات فقط وفق المعلومة المصححة، ولا يغيّر القيمة الفعلية أو المدفوع.'
        );
        if (isCorrection) {
          revisionMode = 'correction';
          revisionValidFrom = currentEffectiveFrom;
        } else {
          const applyFromCurrentCycle = window.confirm(
            'هل تريد تطبيق التغيير من دورة ' + monthLabelAr(month) + ' وما بعدها؟\n\nاختيار «إلغاء» هنا يعني عدم الحفظ.'
          );
          if (!applyFromCurrentCycle) {
            setWorkErr('لم يتم الحفظ. عند تعديل قاعدة مالية قائمة اختر إما «تصحيح سابق» أو «تغيير من الدورة الحالية».');
            return;
          }
          revisionMode = 'current_cycle';
          revisionValidFrom = selectedMonthStart;
        }
      }

      if (schedulePayload && nodeForm.calculation_type !== 'external_forecast_actual' && !rateParams && !effectiveNodeRate) {
        throw new Error('عرّف قاعدة الحساب أولًا قبل جدولة الاستحقاق.');
      }

      const { error } = await supabase.rpc('budget_save_catalog_node', {
        p_node_id: nodeForm.node_id || null,
        p_node_type: nodeForm.node_type,
        p_parent_item_id: nodeForm.parent_item_id || null,
        p_branch_scope_id: nodeForm.branch_scope_id || null,
        p_group_key: parent?.group_key || nodeForm.group_key,
        p_name: nodeForm.name,
        p_unit_label: nodeForm.node_type === 'item' ? nodeForm.unit_label || null : null,
        p_calculation_type: nodeForm.node_type === 'item' ? nodeForm.calculation_type : null,
        p_external_source: nodeForm.calculation_type === 'external_forecast_actual' ? 'payroll_run' : null,
        p_cost_behavior: nodeForm.node_type === 'item' ? nodeForm.cost_behavior : null,
        p_is_active: nodeForm.is_active,
        p_notes: nodeForm.notes || null,
        p_sort_order: Number(nodeForm.sort_order || 0),
        p_rate_valid_from: nodeForm.node_type === 'item' ? revisionValidFrom : null,
        p_rate_params: rateParams,
        p_rate_source: rateParams ? 'manual_entry' : null,
        p_rate_bands: normalizedBands,
        p_schedule_valid_from: nodeForm.node_type === 'item' ? revisionValidFrom : null,
        p_schedule: schedulePayload,
      });
      if (error) throw error;
      const successMessage = nodeForm.node_type === 'group'
        ? 'تم حفظ التصنيف. قيمته ستأتي من أبنائه فقط.'
        : revisionMode === 'correction'
          ? 'تم حفظ التصحيح وإعادة تقدير القيم المتوقعة فقط؛ القيمة الفعلية والمدفوع لم يتغيرا.'
          : revisionMode === 'current_cycle'
            ? 'تم حفظ التغيير من الدورة الحالية وما بعدها مع إبقاء التاريخ السابق كما هو.'
            : revisionMode === 'descriptive'
              ? 'تم حفظ التعديل الوصفي دون تغيير الحساب أو التاريخ المالي.'
              : 'تم حفظ العنصر وقاعدة حسابه ضمن المحرك الموحد.';
      setMsg(successMessage);
      setShowNodeEditor(false);
      await loadAll();
      restoreInteractionOrigin(nodeOriginId.current);
    } catch (e2) {
      setWorkErr(workErrorMessage(e2?.message || 'تعذر حفظ البند.'));
      requestAnimationFrame(() => focusFirstInvalidField(nodeWorkRef.current));
    } finally {
      setBusy(false);
    }
  }
'''

s, count = re.subn(r"  async function saveCatalogNode\(e\) \{.*?\n  \}\n\n  function lineValue", new_save + "\n  function lineValue", s, count=1, flags=re.S)
if count != 1:
    raise SystemExit('Could not replace saveCatalogNode exactly once')

replace_once(
    "      p_reason: scope === 'this_month' ? 'تصحيح تقدير هذا الشهر' : 'تغيير مدخلات التقدير من الدورة الحالية وما بعدها',\n    }), scope === 'this_month' ? 'تم تصحيح تقدير هذا الشهر.' : 'تم تسجيل التغيير من الدورة الحالية.', setWorkErr);",
    "      p_reason: scope === 'this_month' ? 'تحديث تقدير هذا الشهر' : 'تغيير القيمة الافتراضية للتقدير من الدورة الحالية وما بعدها',\n    }), scope === 'this_month' ? 'تم حفظ تقدير هذا الشهر.' : 'تم تغيير القيمة الافتراضية من الدورة الحالية وما بعدها.', setWorkErr);",
)

replace_once(
    "            {selectedLineFields.length > 0 && <button className=\"btn\" onClick={() => saveLineEstimate('this_month')}>تصحيح هذا الشهر</button>}\n            {selectedLineFields.length > 0 && <button className=\"btn ghost\" onClick={() => saveLineEstimate('ongoing')}>تغيير من الدورة الحالية</button>}\n",
    "            {selectedLineFields.length > 0 && <button className=\"btn\" onClick={() => saveLineEstimate('this_month')}>حفظ تقدير هذا الشهر</button>}\n            {selectedLineFields.length > 0 && ONGOING_INPUT_CALC_TYPES.has(selectedLine.calculation_type) && <button className=\"btn ghost\" onClick={() => saveLineEstimate('ongoing')}>اجعلها القيمة الافتراضية من هذا الشهر</button>}\n",
)

replace_once(
    "              <div className=\"field\"><label>تاريخ الاستحقاق المرجعي</label><input type=\"date\" dir=\"ltr\" value={nodeForm.anchor_date} onChange={(e) => setNodeForm((old) => ({ ...old, anchor_date: e.target.value }))} /></div>\n",
    "              <div className=\"field\"><label>تاريخ الاستحقاق المرجعي</label><input type=\"date\" dir=\"ltr\" value={nodeForm.anchor_date} onChange={(e) => setNodeForm((old) => ({ ...old, anchor_date: e.target.value }))} /></div>\n              <div className=\"field\"><label>نهاية السريان (اختياري)</label><input type=\"date\" dir=\"ltr\" value={nodeForm.schedule_valid_to || ''} onChange={(e) => setNodeForm((old) => ({ ...old, schedule_valid_to: e.target.value }))} /><small className=\"muted\">اتركها فارغة إذا كان الالتزام مستمرًا بلا نهاية محددة.</small></div>\n",
)

p.write_text(s, encoding='utf-8')
