const STAGE_AR = {
  opportunity: 'فرصة',
  pricing: 'التسعير والتفاوض',
  awarded: 'تمت الترسية',
  execution: 'التنفيذ',
  closeout: 'الإقفال والتسليم',
  closed: 'مغلق',
};

const BASIS_AR = {
  daily: 'يومية',
  monthly: 'شهري',
  piece: 'وحدة/إنتاج',
  lump_sum: 'مقطوعية',
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (value, max = 2) => num(value).toLocaleString('en-US', {
  maximumFractionDigits:max,
  minimumFractionDigits:0,
});

const money = (value) => `${fmt(value, 2)} ريال`;
const qtyText = (value, unit = '') => `${fmt(value, 3)}${unit ? ` ${unit}` : ''}`;

const riyadhDate = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone:'Asia/Riyadh', year:'numeric', month:'2-digit', day:'2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0,10);
  }
};

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const sum = (rows, key) => rows.reduce((total, row) => total + num(row?.[key]), 0);

const byItem = (rows = []) => {
  const map = new Map();
  for (const row of rows) {
    if (!row?.project_item_id) continue;
    const current = map.get(row.project_item_id) || [];
    current.push(row);
    map.set(row.project_item_id, current);
  }
  return map;
};

export async function loadProjectReportSnapshot(supabase, projectId) {
  const [projectQ, finQ, totalsQ, itemsQ, progressQ, measurementsQ, claimsQ, daysQ, expensesQ, linksQ, centralDocsQ, siteDocsQ, transactionsQ] = await Promise.all([
    supabase.from('projects').select('*').eq('id', projectId).maybeSingle(),
    supabase.from('v_project_financials').select('*').eq('project_id', projectId).maybeSingle(),
    supabase.from('v_project_totals').select('*').eq('project_id', projectId).maybeSingle(),
    supabase.from('project_items').select('*').eq('project_id', projectId).order('sort_order'),
    supabase.from('v_item_progress').select('*').eq('project_id', projectId),
    supabase.from('item_measurements').select('*').eq('project_id', projectId).order('recorded_at'),
    supabase.from('progress_claims').select('*').eq('project_id', projectId).order('seq_no'),
    supabase.from('v_day_summary').select('*').eq('project_id', projectId).order('work_date'),
    supabase.from('contractor_expenses').select('id,contractor_id,project_item_id,expense_date,category,amount,charge_to,payer,is_settled,is_recoverable,recovered_amount,reimbursement_status').eq('project_id', projectId),
    supabase.from('project_contractors').select('*').eq('project_id', projectId).order('created_at'),
    supabase.from('documents').select('id,doc_number,subject,status,created_at,internal_approval_status').eq('project_id', projectId),
    supabase.from('site_documents').select('id,doc_kind,doc_date,title').eq('project_id', projectId),
    supabase.from('transaction_register').select('id,transaction_no,lifecycle_status,opened_at,closed_at,last_movement_at').eq('project_id', projectId),
  ]);

  if (projectQ.error || !projectQ.data) {
    throw new Error(projectQ.error?.message || 'لم يُعثر على المشروع.');
  }

  const fatal = [finQ, totalsQ, itemsQ, progressQ, measurementsQ, claimsQ, daysQ, expensesQ, linksQ, centralDocsQ, siteDocsQ, transactionsQ]
    .find((result) => result?.error);
  if (fatal?.error) throw new Error(fatal.error.message);

  const links = linksQ.data || [];
  const contractorIds = uniq(links.map((row) => row.contractor_id));
  let contractorNames = [];
  if (contractorIds.length) {
    const contractorsQ = await supabase.from('contractors').select('id,name_ar').in('id', contractorIds);
    if (contractorsQ.error) throw new Error(contractorsQ.error.message);
    contractorNames = contractorsQ.data || [];
  }
  const names = new Map(contractorNames.map((row) => [row.id, row.name_ar]));

  let entity = null;
  if (projectQ.data.entity_id) {
    const entityQ = await supabase.from('entities').select('id,name_ar,name_en,entity_kind').eq('id', projectQ.data.entity_id).maybeSingle();
    if (entityQ.error) throw new Error(entityQ.error.message);
    entity = entityQ.data || null;
  }

  return {
    project:projectQ.data,
    entity,
    financials:finQ.data || null,
    totals:totalsQ.data || null,
    items:itemsQ.data || [],
    progress:progressQ.data || [],
    measurements:measurementsQ.data || [],
    claims:claimsQ.data || [],
    days:daysQ.data || [],
    expenses:expensesQ.data || [],
    contractors:links.map((row) => ({ ...row, name_ar:names.get(row.contractor_id) || 'مقاول غير مسمى' })),
    centralDocs:centralDocsQ.data || [],
    siteDocs:siteDocsQ.data || [],
    transactions:transactionsQ.data || [],
  };
}

function itemRows(snapshot) {
  const progressMap = new Map((snapshot.progress || []).map((row) => [row.project_item_id, row]));
  const measurementsMap = byItem(snapshot.measurements || []);
  const claimsMap = new Map((snapshot.claims || []).map((row) => [row.id, row]));
  const realItems = (snapshot.items || []).filter((item) => String(item.kind || 'item') === 'item');

  return realItems.map((item) => {
    const progress = progressMap.get(item.id) || null;
    const measurements = measurementsMap.get(item.id) || [];
    const measuredQty = sum(measurements, 'qty_measured');
    const measuredAmount = sum(measurements, 'amount');
    const doneQty = num(progress?.qty_done) || measuredQty;
    const contractQty = num(item.contract_qty);
    const sellPrice = num(item.sell_price);
    const pct = num(progress?.computed_pct) || (contractQty > 0 ? (doneQty / contractQty) * 100 : 0);
    const earned = num(progress?.earned_value) || measuredAmount;
    const lines = [];

    if (contractQty > 0 || sellPrice > 0) {
      const parts = [];
      if (contractQty > 0) parts.push(`الكمية المسجلة ${qtyText(contractQty, item.unit || '')}`);
      if (sellPrice > 0) parts.push(`سعر الوحدة ${money(sellPrice)}`);
      if (num(item.contract_value) > 0) parts.push(`قيمة البند ${money(item.contract_value)}`);
      lines.push({ id:`auto-scope-${item.id}`, title:'نطاق البند', text:`${parts.join('، ')}.` });
    }

    if (doneQty > 0) {
      let text = `تم إثبات تنفيذ/قياس ${qtyText(doneQty, item.unit || '')}`;
      if (contractQty > 0) text += ` من أصل ${qtyText(contractQty, item.unit || '')}، بنسبة تقدم محسوبة تقارب ${fmt(pct, 2)}%`;
      if (earned > 0) text += `، وبقيمة مكتسبة ${money(earned)}`;
      text += '.';
      lines.push({ id:`auto-progress-${item.id}`, title:'حالة الأعمال', text });
    } else {
      lines.push({
        id:`auto-progress-${item.id}`,
        title:'حالة الأعمال',
        text:'لا توجد حتى تاريخ التقرير كمية تنفيذ أو قياس مثبتة لهذا البند في بيانات المشروع.',
      });
    }

    if (measurements.length) {
      const measurementText = measurements.map((m) => {
        const period = m.period_from || m.period_to
          ? ` للفترة ${m.period_from || '—'} إلى ${m.period_to || '—'}`
          : '';
        return `قياس رقم ${m.measurement_no || '—'}: ${qtyText(m.qty_measured, m.unit_snapshot || item.unit || '')} بقيمة ${money(m.amount)}${period}`;
      }).join('؛ ');
      lines.push({ id:`auto-measure-${item.id}`, title:'القياسات', text:`${measurementText}.` });

      const claimIds = uniq(measurements.map((m) => m.claim_id));
      const itemClaims = claimIds.map((id) => claimsMap.get(id)).filter(Boolean);
      if (itemClaims.length) {
        const claimText = itemClaims.map((claim) => {
          const state = String(claim.status || 'draft') === 'draft' ? 'مسودة' : String(claim.status || '');
          const submitted = claim.submitted_at || claim.client_submitted_at
            ? ` وتم تسجيل تقديمه بتاريخ ${claim.client_submitted_at || claim.submitted_at}`
            : ' ولا يوجد تاريخ تقديم للعميل مسجل حتى الآن';
          const collected = num(claim.collected_amount) > 0
            ? `، والمحصل ${money(claim.collected_amount)}`
            : '، ولا يوجد تحصيل مثبت عليه';
          return `${claim.claim_no || 'مستخلص'} بقيمة ${money(claim.gross_amount)} وحالته ${state}${submitted}${collected}`;
        }).join('؛ ');
        lines.push({ id:`auto-claim-${item.id}`, title:'المستخلصات', text:`${claimText}.` });
      }
    }

    if (String(item.notes || '').trim()) {
      lines.push({ id:`auto-note-${item.id}`, title:'ملاحظات البند', text:String(item.notes).trim() });
    }

    return {
      _id:`auto-item-${item.id}`,
      item:item.description_ar || item.description_en || 'بند مشروع',
      quantity:contractQty > 0 ? String(contractQty) : '',
      unit:item.unit || '',
      rate:sellPrice > 0 ? String(sellPrice) : '',
      work_value:earned > 0 ? earned : null,
      paid_value:null,
      pending_value:null,
      po_reference:'',
      operational_lines:lines,
      auto_project_item_id:item.id,
      auto_progress_pct:pct,
      auto_contract_value:num(item.contract_value),
    };
  });
}

function buildReviewNotes(snapshot) {
  const notes = [];
  const project = snapshot.project || {};
  const f = snapshot.financials || {};
  const t = snapshot.totals || {};
  const contractValue = num(t.contract_value_effective) || num(project.contract_value);

  if (t.contract_value_mismatch) {
    notes.push(`قيمة العقد المسجلة/المعتمدة لا تطابق مجموع قيم البنود؛ القيمة الفعالة ${money(t.contract_value_effective)} بينما مجموع البنود ${money(t.items_contract_value)}. يلزم مراجعة الفرق قبل اعتماد التقرير خارجيًا.`);
  }

  if (contractValue > 0 && num(f.budget_total) > contractValue * 3) {
    notes.push(`إجمالي ميزانية البنود المسجل ${money(f.budget_total)} أعلى بكثير من قيمة العقد ${money(contractValue)}؛ يوصى بمراجعة تكاليف الميزانية المدخلة قبل الاعتماد.`);
  }

  for (const item of (snapshot.items || []).filter((row) => String(row.kind || 'item') === 'item')) {
    const sellPrice = num(item.sell_price);
    const budgetCost = num(item.budget_cost);
    if (sellPrice > 0 && budgetCost > sellPrice * 10) {
      notes.push(`بند «${item.description_ar || 'غير مسمى'}» يحمل تكلفة ميزانية ${money(budgetCost)} للوحدة مقابل سعر بيع ${money(sellPrice)}؛ هذه النسبة غير معتادة وتحتاج مراجعة إدخال التكلفة.`);
    }
  }

  if (!(snapshot.centralDocs || []).length && !(snapshot.siteDocs || []).length) {
    notes.push('لا توجد مستندات نظامية أو مستندات موقع مرتبطة بالمشروع حتى تاريخ توليد التقرير؛ التقرير مبني على السجلات التشغيلية والمالية المتاحة فقط.');
  }

  return notes;
}

function reportSections(snapshot) {
  const project = snapshot.project || {};
  const entity = snapshot.entity || null;
  const f = snapshot.financials || {};
  const t = snapshot.totals || {};
  const days = snapshot.days || [];
  const expenses = snapshot.expenses || [];
  const claims = snapshot.claims || [];
  const tx = snapshot.transactions || [];
  const sections = [];
  const firstDay = days[0]?.work_date;
  const lastDay = days[days.length - 1]?.work_date;
  const presentTotal = sum(days, 'present_count');
  const dayLabor = sum(days, 'labor_amount');
  const dayExpenses = sum(days, 'expenses_amount');
  const expenseTotal = sum(expenses, 'amount');
  const claimsGross = sum(claims, 'gross_amount');
  const collected = sum(claims, 'collected_amount');
  const contractValue = num(t.contract_value_effective) || num(project.contract_value);

  const contextParts = [];
  if (project.project_no) contextParts.push(`رقم المشروع ${project.project_no}`);
  if (entity?.name_ar) contextParts.push(`الجهة المرتبطة بالمشروع: ${entity.name_ar}`);
  if (project.city || project.site_address) contextParts.push(`الموقع: ${[project.city, project.site_address].filter(Boolean).join(' - ')}`);
  if (project.our_role) contextParts.push(`دور أركان: ${project.our_role}`);
  if (project.source_kind) contextParts.push(`مصدر المشروع: ${project.source_kind}`);
  if (project.commencement_date) contextParts.push(`تاريخ المباشرة ${project.commencement_date}`);
  if (num(project.duration_days) > 0) contextParts.push(`المدة المسجلة ${fmt(project.duration_days, 0)} يومًا`);
  if (contractValue > 0) contextParts.push(`قيمة العقد الفعالة في النظام ${money(contractValue)}`);
  sections.push({
    id:'auto-context',
    title:'سياق المشروع',
    text:`تم تكوين هذا التقرير آليًا من البيانات المثبتة في النظام دون إضافة أرقام أو وقائع غير مسجلة. ${contextParts.join('، ')}${contextParts.length ? '.' : ''}`,
  });

  if (String(project.notes || '').trim()) {
    sections.push({ id:'auto-project-notes', title:'ملاحظات المشروع المسجلة', text:String(project.notes).trim() });
  }

  const execParts = [`المشروع في مرحلة ${STAGE_AR[project.stage] || project.stage || 'غير محددة'}`];
  if (num(f.computed_progress_pct) > 0) execParts.push(`ونسبة الإنجاز المحسوبة من البيانات المسجلة ${fmt(f.computed_progress_pct, 2)}%`);
  if (num(f.earned_value) > 0) execParts.push(`والقيمة المكتسبة للأعمال ${money(f.earned_value)}`);
  if (firstDay || lastDay) execParts.push(`وتغطي السجلات اليومية الفترة من ${firstDay || '—'} إلى ${lastDay || '—'}`);
  sections.push({ id:'auto-exec-summary', title:'الموقف التنفيذي العام', text:`${execParts.join('، ')}.` });

  if (days.length) {
    const parts = [`تم تسجيل ${days.length} يوم موقع`];
    if (presentTotal > 0) parts.push(`بإجمالي ${fmt(presentTotal, 2)} تسجيل حضور`);
    if (dayLabor > 0) parts.push(`وبتكلفة عمالة مسجلة ${money(dayLabor)}`);
    if (dayExpenses > 0) parts.push(`ومصروفات يومية ظاهرة في ملخصات الأيام بقيمة ${money(dayExpenses)}`);
    sections.push({ id:'auto-labor', title:'العمالة والحضور', text:`${parts.join('، ')}.` });
  }

  if ((snapshot.contractors || []).length) {
    const contractors = snapshot.contractors.map((row) => {
      const basis = BASIS_AR[row.basis] || row.basis || 'غير محدد';
      return `${row.name_ar} (${basis}${row.is_active === false ? ' - غير نشط' : ' - نشط'})`;
    });
    sections.push({ id:'auto-contractors', title:'المقاولون المرتبطون بالمشروع', text:`المقاولون المسجلون على المشروع: ${contractors.join('، ')}.` });
  }

  if (expenseTotal > 0 || num(f.direct_cost_known) > 0 || num(f.custody_spent) > 0) {
    const parts = [];
    if (expenseTotal > 0) parts.push(`مصروفات المقاولين المسجلة ${money(expenseTotal)} عبر ${expenses.length} حركة`);
    if (num(f.labor_cost) > 0) parts.push(`تكلفة العمالة ${money(f.labor_cost)}`);
    if (num(f.custody_spent) > 0) parts.push(`منصرف العهد ${money(f.custody_spent)}`);
    if (num(f.direct_cost_known) > 0) parts.push(`إجمالي التكلفة المباشرة المعروفة التي تتحملها أركان ${money(f.direct_cost_known)}`);
    if (num(f.current_profit) !== 0) parts.push(`الربح الحالي المحسوب من البيانات ${money(f.current_profit)}`);
    sections.push({ id:'auto-costs', title:'المصروفات والتكاليف', text:`${parts.join('، ')}.` });
  }

  if (claims.length) {
    const draftCount = claims.filter((claim) => String(claim.status || '') === 'draft').length;
    const submittedCount = claims.filter((claim) => claim.submitted_at || claim.client_submitted_at).length;
    const parts = [`يوجد ${claims.length} مستخلص بإجمالي أعمال قبل الضريبة ${money(claimsGross)}`];
    if (draftCount) parts.push(`منها ${draftCount} بحالة مسودة`);
    if (submittedCount) parts.push(`و${submittedCount} مسجل كتقديم للعميل`);
    else parts.push('ولا يوجد تقديم للعميل مثبت في سجلات المستخلصات الحالية');
    if (collected > 0) parts.push(`والمبلغ المحصل المثبت ${money(collected)}`);
    else parts.push('ولا يوجد تحصيل مثبت على هذه المستخلصات');
    sections.push({ id:'auto-claims', title:'المستخلصات والتحصيل', text:`${parts.join('، ')}.` });
  }

  if (tx.length || snapshot.centralDocs.length || snapshot.siteDocs.length) {
    const closed = tx.filter((row) => String(row.lifecycle_status || '') === 'closed').length;
    const open = tx.length - closed;
    const parts = [];
    if (tx.length) parts.push(`سجل المعاملات يحتوي ${tx.length} معاملات، منها ${closed} مغلقة و${open} ما زالت مفتوحة`);
    if (snapshot.centralDocs.length || snapshot.siteDocs.length) parts.push(`ومرتبط بالمشروع ${snapshot.centralDocs.length} مستند نظامي و${snapshot.siteDocs.length} مستند موقع`);
    sections.push({ id:'auto-followup', title:'المعاملات والمستندات', text:`${parts.join('، ')}.` });
  }

  const review = buildReviewNotes(snapshot);
  if (review.length) {
    sections.push({ id:'auto-review', title:'ملاحظات تحتاج مراجعة قبل الاعتماد', text:review.join(' ') });
  }

  const conclusionParts = [];
  if (num(f.computed_progress_pct) > 0) conclusionParts.push(`بلغ الإنجاز المحسوب ${fmt(f.computed_progress_pct, 2)}%`);
  if (num(f.earned_value) > 0) conclusionParts.push(`بقيمة مكتسبة ${money(f.earned_value)}`);
  if (claims.length) conclusionParts.push(`وتم إنشاء مستخلصات بإجمالي ${money(claimsGross)}`);
  if (claims.length && !claims.some((claim) => claim.submitted_at || claim.client_submitted_at)) conclusionParts.push('إلا أن تقديمها للعميل غير مثبت حتى الآن');
  if (num(f.direct_cost_known) > 0) conclusionParts.push(`بينما بلغت التكلفة المباشرة المعروفة ${money(f.direct_cost_known)}`);
  if (tx.length) conclusionParts.push(`وتوجد ${tx.filter((row) => String(row.lifecycle_status || '') !== 'closed').length} معاملات مفتوحة تحتاج متابعة`);
  if (!conclusionParts.length) conclusionParts.push('البيانات الحالية محدودة، ويجب استكمال سجلات المشروع قبل اعتماد موقف تنفيذي أو مالي نهائي');
  sections.push({ id:'auto-conclusion', title:'الخلاصة', text:`${conclusionParts.join('، ')}.` });

  return sections;
}

export function buildProjectReportDraft(snapshot) {
  if (!snapshot?.project) throw new Error('بيانات المشروع غير متاحة.');
  const project = snapshot.project;
  const reportDate = riyadhDate();
  const rows = itemRows(snapshot);
  const sections = reportSections(snapshot);

  return {
    subject:`تقرير موقف المشروع - ${project.name_ar || project.project_no || ''}`.trim(),
    payload:{
      report_date:reportDate,
      project_name_text:project.name_ar || '',
      report_subject:`تقرير موقف المشروع حتى ${reportDate}`,
      _rows:rows,
      _report_sections:sections,
      _auto_report:{
        version:'project-intelligence-v1.1',
        generated_at:new Date().toISOString(),
        project_id:project.id,
        project_no:project.project_no,
        source_tables:[
          'projects','entities','project_items','v_item_progress','item_measurements','progress_claims',
          'v_project_financials','v_project_totals','v_day_summary','contractor_expenses',
          'project_contractors','documents','site_documents','transaction_register',
        ],
      },
    },
  };
}
