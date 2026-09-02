from pathlib import Path

path = Path('app/dashboard/operating-budget/page.js')
text = path.read_text()


def rep(old, new, label):
    global text
    if old in text:
        text = text.replace(old, new, 1)
        print('updated:', label)
    elif new in text:
        print('already updated:', label)
    else:
        raise SystemExit(f'missing block: {label}')

rep(
"""const EMPTY_SUMMARY = {
  opening_bank_balance: null,
  protected_balance: 0,
  free_opening_balance: null,
  expected_due: 0,
  confirmed_due: 0,
  paid: 0,
  required_reserve: 0,
  reserve_gap: 0,
  plan_surplus_deficit: null,
  min_expected_cash: null,
  min_expected_free_balance: null,
};""",
"""const EMPTY_SUMMARY = {
  opening_bank_balance: null,
  protected_balance: 0,
  free_opening_balance: null,
  expected_due: 0,
  confirmed_due: 0,
  paid: 0,
  required_reserve: 0,
  reserve_gap: 0,
  plan_surplus_deficit: null,
  min_expected_cash: null,
  min_expected_free_balance: null,
  monthly_operating_cost: 0,
  accumulated_cycle_cost: 0,
  scheduled_due_this_period: 0,
  amount_due_now: 0,
  overdue_amount: 0,
};""",
'summary v2 defaults')

rep(
"""function amountLabel(value) {
  return `${money(value)} ريال`;
}
""",
"""function amountLabel(value) {
  return `${money(value)} ريال`;
}

const PAYMENT_STATUS_LABELS = Object.freeze({
  not_due: 'غير مستحق',
  due: 'مستحق',
  paid: 'مسدد',
  overdue: 'متأخر',
});

function paymentStatusLabel(line) {
  return PAYMENT_STATUS_LABELS[line?.payment_status] || line?.payment_status || '—';
}

function recurrenceLabel(line) {
  const base = OPERATING_BUDGET.recurrenceLabels?.[line?.recurrence_unit] || line?.recurrence_unit || '';
  const count = Number(line?.recurrence_interval_count || 1);
  return count > 1 ? `${base} × ${count}` : base;
}
""",
'payment helpers')

rep(
"""  if (raw.includes('إصدار التعرفة غير قابل للتعديل') || raw.includes('يوجد إصدار تعرفة يبدأ في نفس التاريخ')) {
    return 'هذا الإصدار استُخدم بالفعل. إذا كانت المعلومة الجديدة تبدأ من تاريخ لاحق، غيّر «سريان القاعدة» إلى تاريخ بداية التغيير. وإذا كان التعديل لهذا الشهر فقط، نفّذه من كشف الشهر حتى يبقى التاريخ السابق محفوظًا.';
  }
""",
"""  if (raw.includes('BUDGET_CORRECTION_LOCKED')) {
    return 'هذا البند عليه إجراء فعلي أو فترة مقفلة. لا يمكن إعادة كتابة الماضي؛ اختر تغييرًا من تاريخ جديد ليحفظ النظام التاريخ السابق.';
  }
  if (raw.includes('إصدار التعرفة غير قابل للتعديل') || raw.includes('يوجد إصدار تعرفة يبدأ في نفس التاريخ')) {
    return 'إذا لم يقع على البند إجراء فعلي اختر «تصحيح بيانات سابقة». أما إذا بدأ التغيير الآن فاختر تغييرًا من تاريخ جديد.';
  }
""",
'central correction error')

rep(
"""      supabase.rpc('budget_period_statement', { p_period_id: periodRow.id }),
      supabase.rpc('budget_period_summary', { p_period_id: periodRow.id }),""",
"""      supabase.rpc('budget_period_statement_v2', { p_period_id: periodRow.id }),
      supabase.rpc('budget_period_summary_v2', { p_period_id: periodRow.id }),""",
'v2 screen source')

rep(
"""        const dueAt = line.due_date ? `${line.due_date}T12:00:00+03:00` : null;
        const { error } = await supabase.rpc('fn_set_attention', {
          p_source_table: 'budget_period_lines',
          p_source_id: line.line_id,
          p_title: line.item_name,
          p_description: `${line.cash_effect_type === 'due_now' ? 'مستحق في' : 'ظاهر ضمن'} ${monthLabelAr(month)} · القيمة الحالية ${amountLabel(lineValue(line))}`,
          p_source_route: `/dashboard/operating-budget?month=${month}`,
          p_source_label: `ميزانية التشغيل · ${monthLabelAr(month)}`,
          p_priority: line.cash_effect_type === 'due_now' ? 'high' : 'normal',""",
"""        const attentionDate = line.payment_due_date || line.next_due_date || line.due_date;
        const dueAt = attentionDate ? `${attentionDate}T12:00:00+03:00` : null;
        const { error } = await supabase.rpc('fn_set_attention', {
          p_source_table: 'budget_period_lines',
          p_source_id: line.line_id,
          p_title: line.item_name,
          p_description: `${line.has_due_in_period ? `استحقاق ${amountLabel(line.due_amount_this_period)} خلال ${monthLabelAr(month)}` : `تكلفة الشهر ${amountLabel(line.monthly_cost)}`} · ${paymentStatusLabel(line)}`,
          p_source_route: `/dashboard/operating-budget?month=${month}`,
          p_source_label: `ميزانية التشغيل · ${monthLabelAr(month)}`,
          p_priority: ['due', 'overdue'].includes(line.payment_status) ? 'high' : 'normal',""",
'attention v2 semantics')

rep(
"""          revisionMode = 'correction';
          revisionValidFrom = currentEffectiveFrom;""",
"""          revisionMode = 'correction';
          revisionValidFrom = nodeForm.valid_from;""",
'correction keeps entered date')

old_rpc = """      const { error } = await supabase.rpc('budget_save_catalog_node', {
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
      if (error) throw error;"""
new_rpc = """      let saveResult;
      if (revisionMode === 'correction' && nodeForm.node_type === 'item') {
        saveResult = await supabase.rpc('budget_save_catalog_item_revision', {
          p_node_id: nodeForm.node_id,
          p_parent_item_id: nodeForm.parent_item_id || null,
          p_branch_scope_id: nodeForm.branch_scope_id || null,
          p_group_key: parent?.group_key || nodeForm.group_key,
          p_name: nodeForm.name,
          p_unit_label: nodeForm.unit_label || null,
          p_calculation_type: nodeForm.calculation_type,
          p_external_source: nodeForm.calculation_type === 'external_forecast_actual' ? 'payroll_run' : null,
          p_cost_behavior: nodeForm.cost_behavior,
          p_is_active: nodeForm.is_active,
          p_notes: nodeForm.notes || null,
          p_sort_order: Number(nodeForm.sort_order || 0),
          p_rate_version_id: currentRate?.id || null,
          p_rate_valid_from: nodeForm.valid_from,
          p_rate_params: rateParams,
          p_rate_source: rateParams ? 'manual_entry' : null,
          p_rate_bands: normalizedBands,
          p_schedule_id: currentSchedule?.id || null,
          p_schedule_valid_from: nodeForm.valid_from,
          p_schedule: schedulePayload,
          p_revision_mode: 'correction',
        });
      } else {
        saveResult = await supabase.rpc('budget_save_catalog_node', {
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
      }
      if (saveResult.error) throw saveResult.error;"""
rep(old_rpc, new_rpc, 'core revision rpc')

rep(
"""  function lineValue(line) {
    return num(line.confirmed_amount ?? line.expected_amount);
  }""",
"""  function lineValue(line) {
    return num(line.monthly_cost);
  }""",
'monthly line value')

rep(
"""      <EntrySurface title={selectedLine.item_name} description={`${selectedLine.cash_effect_type === 'due_now' ? 'مستحق هذا الشهر' : 'التزام مستقبلي'} · ${dateAr(selectedLine.due_date)}`}>""",
"""      <EntrySurface title={selectedLine.item_name} description={`${paymentStatusLabel(selectedLine)} · تكلفة الشهر ${amountLabel(selectedLine.monthly_cost)} · ${selectedLine.payment_due_date ? `موعد السداد ${dateAr(selectedLine.payment_due_date)}` : selectedLine.next_due_date ? `الاستحقاق القادم ${dateAr(selectedLine.next_due_date)}` : 'لا يوجد استحقاق قادم'}`}>""",
'editor v2 description')

rep(
"""          {canMutatePeriod && selectedLine.cash_effect_type === 'due_now' && <form onSubmit={paySelected} style={{ marginTop: 18 }}>""",
"""          {canMutatePeriod && num(selectedLine.amount_due_now) > 0 && <form onSubmit={paySelected} style={{ marginTop: 18 }}>""",
'payment due now')

old_table = """        {lines.length > 0 && <TableFrame><table data-selection-surface=\"true\"><thead><tr>
          <th style={{width:44,textAlign:'center'}}><input type=\"checkbox\" aria-label={`تحديد بنود ${group.name}`} checked={allGroupSelected} ref={(node)=>{if(node)node.indeterminate=someGroupSelected;}} onChange={()=>toggleStatementGroup(lines)} /></th>
          <th>التفصيل</th><th>المتوقع</th><th>الفعلي</th><th>المدفوع</th><th>المخصص المطلوب</th><th>الحالة</th><th></th>
        </tr></thead><tbody>
          {lines.map((line) => <Fragment key={line.line_id}>
            <tr data-record-row=\"true\" data-record-id={line.line_id} data-record-source=\"budget_period_lines\" data-record-selected={selectedStatementIds.has(String(line.line_id))?'true':'false'}>
              <td style={{width:44,textAlign:'center'}}><input type=\"checkbox\" aria-label={`تحديد ${line.item_name}`} checked={selectedStatementIds.has(String(line.line_id))} onChange={()=>toggleStatementLine(line)} /></td>
              <td><strong>{line.item_name}</strong><div className=\"muted\">{line.unit_label || ''}</div></td>
              <td>{amountLabel(line.expected_amount)}</td>
              <td>{line.confirmed_amount == null ? '—' : amountLabel(line.confirmed_amount)}</td>
              <td>{amountLabel(line.paid_amount)}</td>
              <td>{line.cash_effect_type === 'reserve_only' ? amountLabel(line.required_reserve) : '—'}</td>
              <td>{line.cash_effect_type === 'due_now' ? 'مستحق' : `استحقاق ${dateAr(line.due_date)}`}</td>
              <td><Toolbar>
                {canMutatePeriod && <button id={`budget-line-edit-${line.line_id}`} className=\"btn ghost\" onClick={() => editLine(line)}>تعديل</button>}
                {canMutatePeriod && num(line.reserve_gap) > 0 && <button className=\"btn ghost\" onClick={() => reserveGap(line)}>تم حجز المطلوب</button>}
              </Toolbar></td>
            </tr>
            {selectedLine?.line_id === line.line_id && <tr><td colSpan={8} style={{ padding: 0, border: 0 }}>{renderLineEditor()}</td></tr>}
          </Fragment>)}
        </tbody></table></TableFrame>}"""
new_table = """        {lines.length > 0 && <TableFrame><table data-selection-surface=\"true\"><thead><tr>
          <th style={{width:44,textAlign:'center'}}><input type=\"checkbox\" aria-label={`تحديد بنود ${group.name}`} checked={allGroupSelected} ref={(node)=>{if(node)node.indeterminate=someGroupSelected;}} onChange={()=>toggleStatementGroup(lines)} /></th>
          <th>التفصيل</th><th>تكلفة الشهر</th><th>المتراكم</th><th>قيمة الدفعة</th><th>استحقاق هذا الشهر</th><th>الاستحقاق القادم</th><th>السداد</th><th></th>
        </tr></thead><tbody>
          {lines.map((line) => <Fragment key={line.line_id}>
            <tr data-record-row=\"true\" data-record-id={line.line_id} data-record-source=\"budget_period_lines\" data-record-selected={selectedStatementIds.has(String(line.line_id))?'true':'false'}>
              <td style={{width:44,textAlign:'center'}}><input type=\"checkbox\" aria-label={`تحديد ${line.item_name}`} checked={selectedStatementIds.has(String(line.line_id))} onChange={()=>toggleStatementLine(line)} /></td>
              <td><strong>{line.item_name}</strong><div className=\"muted\">{[line.parent_name, recurrenceLabel(line)].filter(Boolean).join(' · ')}</div></td>
              <td><strong>{amountLabel(line.monthly_cost)}</strong></td>
              <td>{amountLabel(line.accumulated_cost)}</td>
              <td><strong>{amountLabel(line.cycle_amount)}</strong></td>
              <td>{line.has_due_in_period ? <><strong>{amountLabel(line.due_amount_this_period)}</strong><div className=\"muted\">{line.payment_due_date ? dateAr(line.payment_due_date) : ''}</div></> : 'لا يوجد'}</td>
              <td>{line.next_due_date ? dateAr(line.next_due_date) : '—'}</td>
              <td><strong>{paymentStatusLabel(line)}</strong>{num(line.paid_amount) > 0 && <div className=\"muted\">مدفوع {amountLabel(line.paid_amount)}</div>}{num(line.amount_due_now) > 0 && <div className=\"muted\">المطلوب الآن {amountLabel(line.amount_due_now)}</div>}</td>
              <td><Toolbar>
                {canMutatePeriod && <button id={`budget-line-edit-${line.line_id}`} className=\"btn ghost\" onClick={() => editLine(line)}>تعديل</button>}
                {canMutatePeriod && num(line.reserve_gap) > 0 && <button className=\"btn ghost\" onClick={() => reserveGap(line)}>تم حجز المطلوب</button>}
              </Toolbar></td>
            </tr>
            {selectedLine?.line_id === line.line_id && <tr><td colSpan={9} style={{ padding: 0, border: 0 }}>{renderLineEditor()}</td></tr>}
          </Fragment>)}
        </tbody></table></TableFrame>}"""
rep(old_table, new_table, 'monthly statement v2 table')

rep(
"""        <strong>{isCollapsed ? '▸' : '▾'} {group.name}</strong><span>{amountLabel(total)}</span>""",
"""        <strong>{isCollapsed ? '▸' : '▾'} {group.name}</strong><span>تكلفة الشهر {amountLabel(total)}</span>""",
'group monthly total')

rep(
"""          { key: 'due', value: money(summary.confirmed_due || summary.expected_due), label: 'المطلوب هذا الشهر', note: 'ريال' },
          { key: 'reserve', value: money(summary.required_reserve), label: 'المطلوب حجزه', note: 'ريال' },
          { key: 'protected', value: money(summary.protected_balance), label: 'الرصيد المحمي', note: 'ريال' },
          { key: 'free', value: summary.free_opening_balance == null ? '—' : money(summary.free_opening_balance), label: 'المتاح الحر', note: summary.free_opening_balance == null ? 'أدخل رصيد البداية' : 'ريال' },
          { key: 'paid', value: money(summary.paid), label: 'المدفوع فعليًا', note: 'ريال' },
          { key: 'plan', value: summary.plan_surplus_deficit == null ? '—' : money(summary.plan_surplus_deficit), label: 'فائض/عجز الخطة', note: 'ريال' },""",
"""          { key: 'monthly', value: money(summary.monthly_operating_cost), label: 'تكلفة الشهر', note: 'ريال' },
          { key: 'scheduled', value: money(summary.scheduled_due_this_period), label: 'استحقاقات الشهر', note: 'ريال' },
          { key: 'due-now', value: money(summary.amount_due_now), label: 'المطلوب الآن', note: 'ريال' },
          { key: 'overdue', value: money(summary.overdue_amount), label: 'متأخر', note: 'ريال' },
          { key: 'protected', value: money(summary.protected_balance), label: 'الرصيد المحمي', note: 'ريال' },
          { key: 'paid', value: money(summary.paid), label: 'المدفوع فعليًا', note: 'ريال' },""",
'v2 summary')

rep(
"""        <WorkSelectionDock count={selectedStatementIds.size} summary={`قيمة المحدد ${amountLabel(selectedStatementTotal)}`} onClear={()=>setSelectedStatementIds(new Set())}>""",
"""        <WorkSelectionDock count={selectedStatementIds.size} summary={`تكلفة الشهر للمحدد ${amountLabel(selectedStatementTotal)}`} onClear={()=>setSelectedStatementIds(new Set())}>""",
'selection monthly total')

path.write_text(text)
