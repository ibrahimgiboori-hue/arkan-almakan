'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STATUS_AR = {
  complete:'مكتمل', missing_in:'بصمة دخول مفقودة', missing_out:'بصمة خروج مفقودة',
  absent:'غياب', day_off:'إجازة', no_schedule:'ساعات الدوام غير محددة', needs_review:'يحتاج مراجعة',
};

const JUSTIFICATION_TYPES = [
  ['sick_leave','إجازة مرضية'],
  ['approved_leave','إجازة معتمدة'],
  ['non_working_day','اليوم غير ضمن أيام العمل'],
  ['outside_work','عمل خارج المركز'],
  ['biometric_device_issue','مشكلة تقنية في جهاز البصمة'],
  ['forgot_punch','نسيان البصمة'],
  ['approved_shift_change','تغيير ساعات دوام / شفت معتمد'],
  ['approved_late_early_permission','إذن تأخير أو خروج معتمد'],
  ['training_meeting_assignment','تدريب / اجتماع / تكليف رسمي'],
  ['other_site_branch','العمل في فرع أو موقع آخر'],
  ['other','أخرى'],
];

const TYPE_TO_LABEL = Object.fromEntries(JUSTIFICATION_TYPES);
const LABEL_TO_TYPE = Object.fromEntries(JUSTIFICATION_TYPES.map(([value,label])=>[label,value]));
const DECISION_TO_LABEL = { pending:'بانتظار القرار', accepted:'مقبول', rejected:'مرفوض' };
const LABEL_TO_DECISION = { '':'pending','بانتظار القرار':'pending','مقبول':'accepted','مرفوض':'rejected','غير مقبول':'rejected' };

const XLSX_COLORS = {
  navy:'FF24364B', ink:'FF1F2933', muted:'FF66788A', line:'FFD9E1E8', white:'FFFFFFFF',
  editable:'FFF3F7FB', green:'FFEAF5EE', blue:'FFEAF1F7', red:'FFFBEAEC', gray:'FFF6F8FA',
};

function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(String(value).replace(' ','T'));
  if (Number.isNaN(d.getTime())) return String(value).slice(11,16) || '—';
  return new Intl.DateTimeFormat('ar-SA',{hour:'2-digit',minute:'2-digit',hour12:true}).format(d);
}

function fmtMinutes(value) {
  const n = Number(value || 0);
  if (!n) return '0د';
  const h = Math.floor(Math.abs(n) / 60);
  const m = Math.abs(n) % 60;
  return h ? `${h}س ${m}د` : `${m}د`;
}

function deviationText(value, earlyWord, lateWord) {
  const n = Number(value || 0);
  if (!n) return 'في الموعد';
  return n < 0 ? `${earlyWord} ${Math.abs(n)}د` : `${lateWord} ${n}د`;
}

function fmtSubmittedAt(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ar-SA',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
}

function dateOnly(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y=value.getFullYear(); const m=String(value.getMonth()+1).padStart(2,'0'); const d=String(value.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0,10);
}

function needsReview(day) {
  return ['missing_in','missing_out','absent','needs_review'].includes(day.day_status);
}

function reviewState(day) {
  if (day.justification_decision === 'accepted') return 'accepted';
  if (day.justification_decision === 'rejected') return 'rejected';
  if (day.justification_id || day.justification_decision === 'pending') return 'pending';
  if (day.day_status === 'no_schedule') return 'needs_schedule';
  if (needsReview(day)) return 'needs_justification';
  return 'clear';
}

function transactionMeta(day) {
  const state = reviewState(day);
  if (state === 'accepted') return {state,label:'تبرير مقبول',background:'rgba(22,163,74,.10)',border:'rgba(22,163,74,.22)',color:'#166534'};
  if (state === 'clear') return {state,label:'مكتمل',background:'rgba(22,163,74,.08)',border:'rgba(22,163,74,.18)',color:'#166534'};
  if (state === 'pending') return {state,label:'بانتظار القرار',background:'rgba(37,99,235,.09)',border:'rgba(37,99,235,.20)',color:'#1d4ed8'};
  if (state === 'needs_schedule') return {state,label:'يحتاج ساعات دوام',background:'rgba(37,99,235,.07)',border:'rgba(37,99,235,.18)',color:'#1d4ed8'};
  if (state === 'rejected') return {state,label:'تبرير مرفوض',background:'rgba(220,38,38,.08)',border:'rgba(220,38,38,.18)',color:'#b91c1c'};
  return {state,label:'يحتاج تبرير',background:'rgba(220,38,38,.07)',border:'rgba(220,38,38,.16)',color:'#b91c1c'};
}

function subjectKey(day) {
  return day.external_person_id || day.employee_id || `${day.subject_no || ''}|${day.subject_name || ''}`;
}

function compareNames(a,b) {
  const byName = String(a?.subject_name || '').localeCompare(String(b?.subject_name || ''),'ar',{sensitivity:'base',numeric:true});
  if (byName !== 0) return byName;
  const byNo = String(a?.subject_no || '').localeCompare(String(b?.subject_no || ''),'ar',{sensitivity:'base',numeric:true});
  if (byNo !== 0) return byNo;
  return String(a?.work_date || '').localeCompare(String(b?.work_date || ''));
}

function detailsForExport(day) {
  const label = TYPE_TO_LABEL[day.justification_type] || '';
  const text = String(day.justification_text || '').trim();
  return text && text !== label ? text : '';
}

function snapshotForDay(day) {
  return {
    type: day.justification_type || '',
    details: detailsForExport(day),
    reference: day.paper_reference || '',
    approvedOn: dateOnly(day.paper_approved_on),
    decision: day.justification_decision || 'pending',
    decisionNote: day.decision_note || '',
  };
}

function normalizedSnapshot(value) {
  return {
    type:String(value?.type || ''),
    details:String(value?.details || '').trim(),
    reference:String(value?.reference || '').trim(),
    approvedOn:dateOnly(value?.approvedOn),
    decision:String(value?.decision || 'pending'),
    decisionNote:String(value?.decisionNote || '').trim(),
  };
}

function snapshotEquals(a,b) {
  return JSON.stringify(normalizedSnapshot(a)) === JSON.stringify(normalizedSnapshot(b));
}

function cellText(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && v.text != null) return String(v.text).trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  return String(v).trim();
}

function safeName(value) {
  return String(value || 'الحضور').replace(/[\\/:*?"<>|]/g,'-').replace(/\s+/g,' ').trim();
}

function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}

export default function AttendanceProcessingTable({ days = [], stage, onOpenJustification }) {
  const [person,setPerson] = useState('all');
  const [review,setReview] = useState('all');
  const [status,setStatus] = useState('all');
  const [submitterByJustification,setSubmitterByJustification] = useState({});
  const [excelBusy,setExcelBusy] = useState(false);
  const [excelMsg,setExcelMsg] = useState('');
  const [excelErr,setExcelErr] = useState('');
  const fileInputRef = useRef(null);

  const justificationIds = useMemo(() => [...new Set(days.map((d)=>d.justification_id).filter(Boolean))],[days]);

  useEffect(() => {
    let active = true;
    if (!justificationIds.length) {
      setSubmitterByJustification({});
      return () => { active = false; };
    }
    (async () => {
      const [jQ,uQ] = await Promise.all([
        supabase.from('hr_attendance_justifications').select('id,submitted_by,submitted_at').in('id',justificationIds),
        supabase.rpc('fn_workspace_user_directory'),
      ]);
      if (!active) return;
      const users = new Map((uQ.data || []).map((u)=>[u.user_id,u.display_name]));
      const next = {};
      (jQ.data || []).forEach((j) => {
        next[j.id] = {
          name: users.get(j.submitted_by) || (j.submitted_by ? 'مستخدم النظام' : ''),
          submittedAt: j.submitted_at || null,
        };
      });
      setSubmitterByJustification(next);
    })();
    return () => { active = false; };
  },[justificationIds]);

  const baseSorted = useMemo(() => [...days].sort(compareNames),[days]);

  const people = useMemo(() => {
    const m = new Map();
    baseSorted.forEach((d) => {
      const key = subjectKey(d);
      if (!m.has(key)) m.set(key,{key,no:d.subject_no||'',name:d.subject_name||'غير معروف'});
    });
    return [...m.values()].sort((a,b)=>{
      const byName=String(a.name||'').localeCompare(String(b.name||''),'ar',{sensitivity:'base',numeric:true});
      if(byName!==0) return byName;
      return String(a.no||'').localeCompare(String(b.no||''),'ar',{sensitivity:'base',numeric:true});
    });
  },[baseSorted]);

  const filtered = useMemo(() => baseSorted.filter((d) => {
    const key = subjectKey(d);
    if (person !== 'all' && key !== person) return false;
    if (status !== 'all' && d.day_status !== status) return false;
    if (review !== 'all' && reviewState(d) !== review) return false;
    return true;
  }),[baseSorted,person,review,status]);

  const actionable = useMemo(()=>baseSorted.filter((d)=>needsReview(d) || d.justification_id),[baseSorted]);
  const reviewable = days.filter(needsReview).length;
  const withoutJustification = days.filter((d)=>needsReview(d) && !d.justification_id).length;
  const pending = days.filter((d)=>reviewState(d) === 'pending').length;
  const completed = days.filter((d)=>['clear','accepted'].includes(reviewState(d))).length;
  const batchId = days[0]?.import_id || '';
  const reviewRevision = Number(days[0]?.review_revision || 0);
  const clientName = days[0]?.client_name_snapshot || (days[0]?.processing_scope === 'internal' ? 'أركان المكان' : 'العميل');
  const canImportExcel = !!batchId && !['posted','closed'].includes(stage);

  async function exportJustificationExcel() {
    if (!batchId || !actionable.length) { setExcelErr('لا توجد حالات محل إجراء لتصديرها.'); return; }
    setExcelBusy(true); setExcelErr(''); setExcelMsg('');
    try {
      const {default:ExcelJS} = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator='Attendance Processing Lab';
      workbook.created=new Date();
      workbook.modified=new Date();
      workbook.company=clientName || '';

      const lists = workbook.addWorksheet('__lists');
      JUSTIFICATION_TYPES.forEach(([,label],i)=>{ lists.getCell(i+1,1).value=label; });
      ['بانتظار القرار','مقبول','مرفوض'].forEach((label,i)=>{ lists.getCell(i+1,2).value=label; });
      lists.state='veryHidden';

      const ws = workbook.addWorksheet('معالجة التبريرات',{views:[{rightToLeft:true}]});
      ws.views=[{state:'frozen',ySplit:1,rightToLeft:true}];
      ws.properties.defaultRowHeight=23;
      ws.columns = [
        {header:'رقم الموظف',key:'no',width:13},
        {header:'الموظف',key:'name',width:27},
        {header:'التاريخ',key:'date',width:14},
        {header:'الحالة',key:'status',width:22},
        {header:'الدخول',key:'in',width:14},
        {header:'الخروج',key:'out',width:14},
        {header:'الخصم الحالي',key:'deduction',width:13},
        {header:'نوع التبرير',key:'type',width:31},
        {header:'التفاصيل',key:'details',width:34},
        {header:'المرجع / المستند',key:'reference',width:22},
        {header:'تاريخ الاعتماد',key:'approved_on',width:16},
        {header:'قرار صاحب العمل',key:'decision',width:19},
        {header:'ملاحظة القرار',key:'decision_note',width:30},
        {header:'حالة المعالجة',key:'processing',width:19},
        {header:'__batch_id',key:'batch_id',hidden:true,width:18},
        {header:'__attendance_day_id',key:'day_id',hidden:true,width:18},
        {header:'__review_revision',key:'revision',hidden:true,width:12},
        {header:'__exported_at',key:'exported_at',hidden:true,width:22},
        {header:'__justification_id',key:'justification_id',hidden:true,width:18},
        {header:'__source_snapshot',key:'source_snapshot',hidden:true,width:45},
      ];

      const exportedAt = new Date().toISOString();
      actionable.forEach((d)=>{
        const state=reviewState(d);
        ws.addRow({
          no:d.subject_no||'', name:d.subject_name||'', date:dateOnly(d.work_date), status:STATUS_AR[d.day_status]||d.day_status,
          in:fmtTime(d.check_in), out:fmtTime(d.check_out), deduction:Number(d.final_deduction_days ?? d.preliminary_deduction_days ?? 0),
          type:TYPE_TO_LABEL[d.justification_type]||'', details:detailsForExport(d), reference:d.paper_reference||'', approved_on:dateOnly(d.paper_approved_on),
          decision:DECISION_TO_LABEL[d.justification_decision||'pending']||'بانتظار القرار', decision_note:d.decision_note||'',
          processing:state==='accepted'?'مكتمل - مقبول':state==='rejected'?'مكتمل - مرفوض':state==='pending'?'بانتظار القرار':'يحتاج تبرير',
          batch_id:batchId, day_id:d.id, revision:reviewRevision, exported_at:exportedAt, justification_id:d.justification_id||'', source_snapshot:JSON.stringify(snapshotForDay(d)),
        });
      });

      const header=ws.getRow(1);
      header.height=30;
      header.eachCell((cell)=>{
        cell.font={bold:true,color:{argb:XLSX_COLORS.white},size:11};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:XLSX_COLORS.navy}};
        cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
        cell.border={bottom:{style:'thin',color:{argb:XLSX_COLORS.navy}}};
      });

      for(let r=2;r<=ws.lastRow.number;r+=1){
        const row=ws.getRow(r); row.height=25;
        for(let c=1;c<=14;c+=1){
          const cell=row.getCell(c);
          cell.font={color:{argb:XLSX_COLORS.ink},size:10};
          cell.alignment={vertical:'middle',horizontal:c===2||c===9||c===10||c===13?'right':'center',wrapText:true};
          cell.border={top:{style:'hair',color:{argb:XLSX_COLORS.line}},bottom:{style:'hair',color:{argb:XLSX_COLORS.line}},left:{style:'hair',color:{argb:XLSX_COLORS.line}},right:{style:'hair',color:{argb:XLSX_COLORS.line}}};
          if(r%2===0) cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:XLSX_COLORS.gray}};
        }
        [8,9,10,11,12,13].forEach((c)=>{ row.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:XLSX_COLORS.editable}}; });
        const decision=cellText(row.getCell(12));
        const processCell=row.getCell(14);
        const fill = decision==='مقبول'?XLSX_COLORS.green:decision==='مرفوض'?XLSX_COLORS.red:(row.getCell(8).value?XLSX_COLORS.blue:XLSX_COLORS.red);
        processCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
        row.getCell(8).dataValidation={type:'list',allowBlank:true,formulae:[`'__lists'!$A$1:$A$${JUSTIFICATION_TYPES.length}`]};
        row.getCell(12).dataValidation={type:'list',allowBlank:true,formulae:["'__lists'!$B$1:$B$3"]};
      }

      ws.autoFilter={from:{row:1,column:1},to:{row:1,column:14}};
      ws.getColumn(7).numFmt='0.00';
      ws.getColumn(11).numFmt='yyyy-mm-dd';
      ws.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
      ws.headerFooter.oddFooter='&Rصفحة &P من &N';

      const note=workbook.addWorksheet('تعليمات');
      note.views=[{rightToLeft:true}];
      note.getColumn(1).width=110;
      note.getCell('A1').value='نموذج معالجة التبريرات';
      note.getCell('A1').font={bold:true,size:16,color:{argb:XLSX_COLORS.navy}};
      note.getCell('A3').value='عدّل فقط الأعمدة ذات الخلفية الزرقاء الفاتحة: نوع التبرير، التفاصيل، المرجع/المستند، تاريخ الاعتماد، قرار صاحب العمل، وملاحظة القرار.';
      note.getCell('A4').value='لا تغيّر الأعمدة التقنية المخفية. عند إعادة الرفع يتحقق البرنامج من رقم الدفعة وإصدار المراجعة ومن أن الحالة الأصلية لم تتغير بعد التصدير.';
      note.getCell('A5').value='وجود التبرير لا يعني قبوله. القرار المقبول أو المرفوض يسجل كقرار مستقل لكل تاريخ، ثم تحتاج الدفعة إلى إعادة الاحتساب داخل البرنامج.';
      note.getRange?.('A3:A5');
      [3,4,5].forEach((r)=>{ note.getCell(r,1).alignment={wrapText:true,vertical:'top',horizontal:'right'}; note.getRow(r).height=42; });

      const buffer=await workbook.xlsx.writeBuffer();
      const period=`${dateOnly(actionable[0]?.work_date)||''}_${dateOnly(actionable[actionable.length-1]?.work_date)||''}`;
      downloadBuffer(buffer,`معالجة_تبريرات_${safeName(clientName)}_${period}.xlsx`);
      setExcelMsg(`تم إنشاء نموذج Excel من ${actionable.length} حالة محل إجراء. استخدم الفلاتر والقوائم المنسدلة ثم أعد رفع نفس الملف.`);
    } catch(e){ setExcelErr('تعذر إنشاء نموذج التبريرات: '+(e.message||e)); }
    setExcelBusy(false);
  }

  async function importJustificationExcel(file) {
    if (!file || !batchId) return;
    setExcelBusy(true); setExcelErr(''); setExcelMsg('');
    try {
      const {default:ExcelJS}=await import('exceljs');
      const workbook=new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const ws=workbook.getWorksheet('معالجة التبريرات') || workbook.worksheets.find((s)=>s.name!=='تعليمات'&&!s.name.startsWith('__'));
      if(!ws) throw new Error('لم أجد ورقة «معالجة التبريرات» في الملف.');

      const expected=['رقم الموظف','الموظف','التاريخ','الحالة','الدخول','الخروج','الخصم الحالي','نوع التبرير','التفاصيل','المرجع / المستند','تاريخ الاعتماد','قرار صاحب العمل','ملاحظة القرار','حالة المعالجة'];
      for(let i=0;i<expected.length;i+=1){
        if(cellText(ws.getRow(1).getCell(i+1))!==expected[i]) throw new Error('ترتيب أعمدة النموذج تغير. نزّل نسخة جديدة من البرنامج ولا تستخدم ملفًا معدل البنية.');
      }

      const currentById=new Map(days.map((d)=>[d.id,d]));
      const rows=[];
      ws.eachRow((row,rowNumber)=>{
        if(rowNumber===1) return;
        const dayId=cellText(row.getCell(16));
        if(!dayId) return;
        rows.push({row,rowNumber,dayId});
      });
      if(!rows.length) throw new Error('لا توجد صفوف معالجة قابلة للقراءة في الملف.');

      let applied=0, unchanged=0, conflicts=0, errors=0;
      const problems=[];

      for(let index=0;index<rows.length;index+=1){
        const {row,rowNumber,dayId}=rows[index];
        setExcelMsg(`جارٍ تطبيق نموذج Excel: ${index+1} من ${rows.length}…`);
        try {
          const fileBatch=cellText(row.getCell(15));
          const fileRevision=Number(cellText(row.getCell(17))||0);
          const sourceRaw=cellText(row.getCell(20));
          const current=currentById.get(dayId);
          if(fileBatch!==batchId){ conflicts+=1; problems.push(`صف ${rowNumber}: يخص دفعة أخرى.`); continue; }
          if(fileRevision!==reviewRevision){ conflicts+=1; problems.push(`صف ${rowNumber}: إصدار المراجعة قديم (${fileRevision}) والحالي ${reviewRevision}.`); continue; }
          if(!current){ conflicts+=1; problems.push(`صف ${rowNumber}: الحالة لم تعد موجودة في هذه الدفعة.`); continue; }

          let sourceSnapshot={};
          try{ sourceSnapshot=JSON.parse(sourceRaw||'{}'); }catch{ conflicts+=1; problems.push(`صف ${rowNumber}: بيانات التحقق المخفية تالفة.`); continue; }
          if(!snapshotEquals(snapshotForDay(current),sourceSnapshot)){
            conflicts+=1; problems.push(`صف ${rowNumber}: الحالة تغيرت في البرنامج بعد تنزيل Excel؛ لم يتم الكتابة فوقها.`); continue;
          }

          const typeLabel=cellText(row.getCell(8));
          const type=LABEL_TO_TYPE[typeLabel]||'';
          const next={
            type,
            details:cellText(row.getCell(9)),
            reference:cellText(row.getCell(10)),
            approvedOn:dateOnly(row.getCell(11).value),
            decision:LABEL_TO_DECISION[cellText(row.getCell(12))]||'pending',
            decisionNote:cellText(row.getCell(13)),
          };
          const original=normalizedSnapshot(sourceSnapshot);
          if(snapshotEquals(next,original)){ unchanged+=1; continue; }
          if(!type){ errors+=1; problems.push(`صف ${rowNumber}: اختر نوع التبرير قبل الحفظ أو القرار.`); continue; }
          if(type==='other'&&!next.details){ errors+=1; problems.push(`صف ${rowNumber}: «أخرى» تحتاج تفاصيل.`); continue; }

          const submit=await supabase.rpc('hr_submit_attendance_justification_v2',{
            p_attendance_day_id:dayId,
            p_justification_type:type,
            p_justification_text:next.details||null,
            p_paper_reference:next.reference||null,
            p_paper_approved_on:next.approvedOn||null,
          });
          if(submit.error) throw submit.error;

          if(next.decision==='accepted'||next.decision==='rejected'){
            const decide=await supabase.rpc('hr_decide_attendance_justification',{
              p_justification_id:submit.data,
              p_decision:next.decision,
              p_decision_note:next.decisionNote||null,
              p_paper_reference:next.reference||null,
              p_paper_approved_on:next.approvedOn||null,
            });
            if(decide.error) throw decide.error;
          }
          applied+=1;
        }catch(e){ errors+=1; problems.push(`صف ${rowNumber}: ${e.message||e}`); }
      }

      const summary=`تم تطبيق ${applied} صف، بدون تغيير ${unchanged}، تعارض ${conflicts}، أخطاء ${errors}.`;
      if(problems.length){
        setExcelErr(`${summary} ${problems.slice(0,6).join(' | ')}${problems.length>6?' | …':''}`);
      }else{
        setExcelMsg(`${summary} أصبحت الدفعة في مرحلة معالجة التبريرات. أعد الاحتساب لإنتاج النتيجة الجديدة.`);
        if(applied>0) setTimeout(()=>window.location.reload(),1400);
      }
    }catch(e){ setExcelErr('تعذر استيراد نموذج التبريرات: '+(e.message||e)); }
    setExcelBusy(false);
    if(fileInputRef.current) fileInputRef.current.value='';
  }

  return <div className="section">
    <header><h2>البيانات المعالجة</h2><span className="hint">المعاملة ملوّنة لتمييز المكتمل، المنتظر، والذي يحتاج تدخلًا. تفاصيل الانحراف تظهر داخل وقت الدخول والخروج بدل أعمدة منفصلة.</span></header>
    <div style={{padding:18}}>
      {excelErr&&<div className="msg err" style={{marginBottom:12}}>{excelErr}</div>}
      {excelMsg&&<div className="msg ok" style={{marginBottom:12}}>{excelMsg}</div>}
      <div className="rowsplit" style={{alignItems:'end',gap:12,flexWrap:'wrap'}}>
        <div className="field" style={{minWidth:240}}><label>الموظف</label><select value={person} onChange={(e)=>setPerson(e.target.value)}><option value="all">كل الموظفين</option>{people.map((p)=><option key={p.key} value={p.key}>{p.no?`${p.no} - `:''}{p.name}</option>)}</select></div>
        <div className="field" style={{minWidth:220}}><label>المراجعة / التبرير</label><select value={review} onChange={(e)=>setReview(e.target.value)}><option value="all">كل الحالات</option><option value="needs_justification">يحتاج تبرير</option><option value="pending">تبرير بانتظار القرار</option><option value="accepted">تبرير مقبول</option><option value="rejected">تبرير غير مقبول</option><option value="clear">مكتمل ولا يحتاج معالجة</option></select></div>
        <div className="field" style={{minWidth:210}}><label>حالة اليوم</label><select value={status} onChange={(e)=>setStatus(e.target.value)}><option value="all">كل الحالات اليومية</option><option value="complete">مكتمل</option><option value="absent">غياب</option><option value="missing_in">بصمة دخول مفقودة</option><option value="missing_out">بصمة خروج مفقودة</option><option value="day_off">إجازة</option><option value="needs_review">يحتاج مراجعة</option></select></div>
        <button type="button" className="btn ghost" onClick={()=>{setPerson('all');setReview('all');setStatus('all');}}>مسح الفلاتر</button>
      </div>
      <div className="rowsplit" style={{marginTop:14,justifyContent:'flex-start',gap:10,flexWrap:'wrap'}}>
        <button type="button" className="btn ghost" disabled={excelBusy||!actionable.length} onClick={exportJustificationExcel}>{excelBusy?'جارٍ المعالجة…':'تنزيل نموذج التبريرات Excel'}</button>
        <button type="button" className="btn" disabled={excelBusy||!canImportExcel} onClick={()=>fileInputRef.current?.click()}>رفع نموذج التبريرات المعالج</button>
        <input ref={fileInputRef} type="file" accept=".xlsx" style={{display:'none'}} onChange={(e)=>importJustificationExcel(e.target.files?.[0])}/>
        <span className="hint">النموذج يأخذ فقط الحالات محل الإجراء من آخر مراجعة، ويمنع الكتابة فوق حالة تغيرت بعد تنزيله.</span>
      </div>
      <div className="stat-grid" style={{marginTop:14}}><div className="stat"><span>مكتمل المعالجة</span><strong>{completed}</strong></div><div className="stat"><span>بدون تبرير</span><strong>{withoutJustification}</strong></div><div className="stat"><span>بانتظار القرار</span><strong>{pending}</strong></div><div className="stat"><span>النتائج الظاهرة</span><strong>{filtered.length}</strong></div></div>
    </div>
    <div style={{overflowX:'auto'}}><table><thead><tr><th>الشخص</th><th>التاريخ</th><th>الدخول</th><th>الخروج</th><th>الساعات</th><th>الحالة</th><th>الخصم</th><th style={{minWidth:190}}>المعاملة</th></tr></thead><tbody>{filtered.map((d)=>{
      const transaction = transactionMeta(d);
      const submitter = d.justification_id ? submitterByJustification[d.justification_id] : null;
      const canOpen = needsReview(d) && !['posted','closed'].includes(stage);
      return <tr key={d.id}>
        <td>{d.subject_no?`${d.subject_no} - `:''}{d.subject_name}</td>
        <td className="mono">{d.work_date}</td>
        <td><div>{fmtTime(d.check_in)}</div>{d.arrival_delta_minutes!=null&&<div className="hint" style={{fontSize:11,marginTop:3}}>{deviationText(d.arrival_delta_minutes,'تبكير','تأخير')}</div>}</td>
        <td><div>{fmtTime(d.check_out)}</div>{d.departure_delta_minutes!=null&&<div className="hint" style={{fontSize:11,marginTop:3}}>{deviationText(d.departure_delta_minutes,'خروج مبكر','خروج متأخر')}</div>}</td>
        <td>{d.worked_minutes==null?'—':fmtMinutes(d.worked_minutes)}</td>
        <td>{STATUS_AR[d.day_status]||d.day_status}</td>
        <td>{Number(d.preliminary_deduction_days||0).toFixed(2)} ← <strong>{Number(d.final_deduction_days||0).toFixed(2)}</strong></td>
        <td style={{background:transaction.background}}>
          <div style={{border:`1px solid ${transaction.border}`,borderRadius:10,padding:'8px 10px',display:'grid',gap:5}}>
            <strong style={{color:transaction.color,fontSize:13}}>{transaction.label}</strong>
            {submitter?.name&&<span className="hint" style={{fontSize:11}}>سجّل التبرير: {submitter.name}{submitter.submittedAt?` — ${fmtSubmittedAt(submitter.submittedAt)}`:''}</span>}
            {canOpen&&<button className="btn ghost" type="button" style={{padding:'5px 9px',justifySelf:'start'}} onClick={()=>onOpenJustification?.({...d,justification_submitter_name:submitter?.name||'',justification_submitted_at:submitter?.submittedAt||null})}>{d.justification_id?'فتح التبرير':'إضافة تبرير'}</button>}
          </div>
        </td>
      </tr>;
    })}{!filtered.length&&<tr><td colSpan={8}><div style={{padding:18}} className="hint">لا توجد نتائج تطابق الفلاتر الحالية.</div></td></tr>}</tbody></table></div>
  </div>;
}