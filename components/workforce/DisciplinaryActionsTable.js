'use client';

import { useEffect,useMemo,useState } from 'react';
import { supabase } from '@/lib/supabase';
import ProcedureSourceControl from '@/components/approval/ProcedureSourceControl';
import { TableFrame,EmptyState,Notice,SummaryStrip,EntrySurface,Toolbar } from '@/components/ui/ConstitutionUI';

const KIND={deduction:'خصم',warning:'إنذار',suspension:'إيقاف',investigation:'تحقيق'};
const STATUS={draft:'مسودة',submitted:'مرسل للاعتماد',hr_reviewed:'مراجع إداريًا',accountant_approved:'مراجع ماليًا',ceo_approved:'معتمد نهائيًا',approved:'معتمد',rejected:'مرفوض',returned:'معاد',cancelled:'ملغى',closed:'مغلق',completed:'مكتمل'};
const TERMINAL=new Set(['accountant_approved','ceo_approved','approved','rejected','cancelled','closed','completed']);
const money=v=>`${Number(v||0).toLocaleString('ar-SA',{maximumFractionDigits:2})} ر.س`;
const date=v=>v?new Date(v).toLocaleDateString('ar-SA'):'—';

export default function DisciplinaryActionsTable(){
  const [rows,setRows]=useState(null);const [names,setNames]=useState(new Map());const [error,setError]=useState('');const [selected,setSelected]=useState(null);
  useEffect(()=>{let alive=true;(async()=>{
    const {data,error:rowError}=await supabase.from('disciplinary_actions').select('id,action_no,employee_id,action_kind,violation_date,description,deduction_amount,suspension_days,status,created_at').order('violation_date',{ascending:false}).limit(100);
    if(rowError){if(alive){setError(rowError.message);setRows([]);}return;}
    const list=data||[];const ids=[...new Set(list.map(r=>r.employee_id).filter(Boolean))];
    let map=new Map();if(ids.length){const q=await supabase.from('employees').select('id,full_name_ar').in('id',ids);map=new Map((q.data||[]).map(r=>[r.id,r.full_name_ar||'—']));}
    if(alive){setRows(list);setNames(map);}
  })();return()=>{alive=false;};},[]);
  const summary=useMemo(()=>{const list=rows||[];return[
    {key:'count',label:'الإجراءات',value:list.length,note:'المسجلة'},
    {key:'open',label:'غير المغلقة',value:list.filter(r=>!TERMINAL.has(String(r.status||''))).length,note:'تحتاج متابعة'},
    {key:'deductions',label:'إجمالي الخصومات',value:money(list.reduce((s,r)=>s+Number(r.deduction_amount||0),0)),note:'حسب السجل الحالي'},
  ];},[rows]);
  if(rows===null)return <EmptyState title="جارٍ تحميل الإجراءات التأديبية" description="نقرأ السجل ومسار كل معاملة."/>;
  const selectedName=selected?names.get(selected.employee_id)||'—':'—';
  return <>
    {error?<Notice tone="warning">{error}</Notice>:null}
    <SummaryStrip items={summary}/>
    <Notice>الجدول للعرض فقط. افتح المعاملة لمعرفة حالتها أو إرسالها للمسار؛ لا توجد نماذج اعتماد أو تسوية مالية داخل صفوف الجدول.</Notice>

    {selected?<EntrySurface title={`إجراء ${selected.action_no||''} — ${selectedName}`} description="أنت في جهة المنشأ — الموارد البشرية">
      <div style={{padding:22,display:'grid',gap:16}}>
        <div className="form-grid">
          <div className="field"><label>نوع الإجراء</label><strong>{KIND[selected.action_kind]||selected.action_kind||'—'}</strong></div>
          <div className="field"><label>تاريخ المخالفة</label><strong>{date(selected.violation_date)}</strong></div>
          <div className="field"><label>الحالة</label><strong>{STATUS[selected.status]||selected.status||'—'}</strong></div>
          <div className="field"><label>الخصم</label><strong>{money(selected.deduction_amount)}</strong></div>
          <div className="field span2"><label>الوصف</label><div>{selected.description||'—'}</div></div>
        </div>
        <ProcedureSourceControl
          capabilityKey="hr.disciplinary.create"
          sourceTable="disciplinary_actions"
          sourceId={selected.id}
          sourceLabel={`إجراء موظف — ${selectedName}`}
          amount={Number(selected.deduction_amount||0)}
          currentDestinationKey="workforce"
        />
        <Toolbar><button className="btn ghost" type="button" onClick={()=>setSelected(null)}>إغلاق</button></Toolbar>
      </div>
    </EntrySurface>:null}

    {!rows.length?<EmptyState title="لا توجد إجراءات مسجلة" description="لا توجد معاملات في هذا السجل حاليًا."/>:<TableFrame><table>
      <thead><tr><th>الرقم</th><th>الموظف</th><th>الإجراء</th><th>تاريخ المخالفة</th><th>الخصم</th><th>الحالة</th><th>فتح</th></tr></thead>
      <tbody>{rows.map(row=>{const name=names.get(row.employee_id)||'—';return <tr key={row.id}>
        <td>{row.action_no||'—'}</td><td>{name}</td><td>{KIND[row.action_kind]||row.action_kind||'—'}</td><td>{date(row.violation_date)}</td><td>{money(row.deduction_amount)}</td><td>{STATUS[row.status]||row.status||'—'}</td>
        <td><button className="btn ghost" type="button" onClick={()=>setSelected(row)}>فتح</button></td>
      </tr>;})}</tbody>
    </table></TableFrame>}
  </>;
}
