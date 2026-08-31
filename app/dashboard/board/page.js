'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, daysUntil, money } from '@/lib/format';
import { useLiveRefresh, notifyChange } from '@/lib/live';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import OrgRoleFields from '@/components/OrgRoleFields';

const KIND = { owner:'مالك', partner:'شريك', board:'مجلس الإدارة' };
const EMPTY = {
  employee_no:'', full_name_ar:'', full_name_en:'', nationality:'',
  id_kind:'national_id', id_number:'', id_expiry:'', mobile:'', email:'',
  person_kind:'board', board_role:'', job_title:'', ownership_pct:'',
  org_classification_id:'', org_position_id:'', org_job_title_id:'',
  appointed_at:'', hire_date:'', duties:'', status:'active', in_payroll:false,
  monthly_compensation:0, basic_salary:0, housing_allowance:0, transport_allowance:0, other_allowance:0,
};

const n=(v)=>Number(v||0);
const fixedMonthly=(r)=>n(r?.basic_salary)+n(r?.housing_allowance)+n(r?.transport_allowance)+n(r?.other_allowance);

export default function BoardPage() {
  const me = useDashboardSession();
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [quick, setQuick] = useState({});
  const [savingQuick, setSavingQuick] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const canWrite = useMemo(() => {
    const keys = me?.capabilityKeys || new Set();
    return Boolean(me?.access?.fullAdmin) || keys.has('hr.employees.edit') || keys.has('system.access.manage_access');
  }, [me]);

  async function load() {
    const [b, pay] = await Promise.all([
      supabase.from('v_board_report').select('*'),
      supabase.from('employees').select('id,hire_date,in_payroll,basic_salary,housing_allowance,transport_allowance,other_allowance').in('person_kind',['owner','partner','board']),
    ]);
    if(b.error||pay.error){setErr((b.error||pay.error).message);setRows([]);return;}
    const payMap=new Map((pay.data||[]).map(r=>[r.id,r]));
    const next=(b.data||[]).map(r=>{
      const p=payMap.get(r.id)||{};
      return {...r,...p,monthly_compensation:fixedMonthly(p)};
    });
    setRows(next);
    setQuick(Object.fromEntries(next.map(r=>[r.id,{
      in_payroll:Boolean(r.in_payroll),
      monthly_compensation:fixedMonthly(r),
      hire_date:r.hire_date||'',
    }])));
  }

  useEffect(() => { load(); }, []);
  useLiveRefresh(load, ['board','all']);

  const set = (k) => (e) => setF((current)=>({ ...current, [k]: e.target.value }));
  const setOrg = (patch) => setF((current)=>({ ...current, ...patch }));

  function changeKind(kind) {
    setF((current)=>({
      ...current,
      person_kind: kind,
      ...(kind === 'board' ? {} : {
        org_classification_id:'', org_position_id:'', org_job_title_id:'', board_role:'',
      }),
    }));
  }

  function startEdit(r) {
    setEditId(r.id);
    setF({ ...EMPTY, ...r, ownership_pct:r.ownership_pct ?? '', monthly_compensation:fixedMonthly(r) });
    setOpen(true); setErr(''); setMsg('');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const p = { ...f };
    p.ownership_pct = p.ownership_pct === '' ? null : Number(p.ownership_pct);
    p.in_payroll = Boolean(p.in_payroll);
    const monthlyCompensation = Number(p.monthly_compensation || 0);
    if(p.in_payroll && !p.hire_date){setErr('حدد تاريخ المباشرة قبل إدراج الشخص في مسير الرواتب.');return;}
    if(monthlyCompensation < 0){setErr('الأجر الشهري لا يمكن أن يكون سالبًا.');return;}

    p.basic_salary = monthlyCompensation;
    p.housing_allowance = 0;
    p.transport_allowance = 0;
    p.other_allowance = 0;

    ['id_expiry','appointed_at','hire_date'].forEach((k)=>{ p[k]=p[k]||null; });
    ['org_classification_id','org_position_id','org_job_title_id'].forEach((k)=>{ p[k]=p[k]||null; });
    ['seq','kind_label','years_served','monthly_compensation'].forEach((k)=>delete p[k]);
    delete p.id; delete p.created_at; delete p.updated_at;

    const res = editId
      ? await supabase.from('employees').update(p).eq('id',editId)
      : await supabase.from('employees').insert(p);
    if (res.error) { setErr('تعذر الحفظ: '+res.error.message); return; }

    setMsg(editId?'حفظت التعديلات':'أضيف الشخص');
    setF({...EMPTY}); setEditId(null); setOpen(false);
    load(); notifyChange('board');
  }

  function patchQuick(id, patch) {
    setQuick(current=>({ ...current, [id]:{ ...(current[id]||{}), ...patch } }));
  }

  async function saveQuick(r) {
    if(!canWrite)return;
    const q=quick[r.id]||{};
    const monthlyCompensation=Number(q.monthly_compensation||0);
    if(monthlyCompensation<0){setErr('الأجر الشهري لا يمكن أن يكون سالبًا.');return;}
    if(q.in_payroll&&!q.hire_date){setErr(`حدد تاريخ مباشرة ${r.full_name_ar} قبل إدراجه في المسير.`);return;}
    setSavingQuick(r.id);setErr('');setMsg('');
    const payload={
      in_payroll:Boolean(q.in_payroll),
      hire_date:q.hire_date||null,
      basic_salary:monthlyCompensation,
      housing_allowance:0,
      transport_allowance:0,
      other_allowance:0,
    };
    const {error}=await supabase.from('employees').update(payload).eq('id',r.id);
    if(error)setErr('تعذر حفظ الأجر: '+error.message);
    else{
      setMsg(`تم حفظ الأجر وبيانات المسير لـ ${r.full_name_ar}.`);
      await load();
      notifyChange('board');
    }
    setSavingQuick(null);
  }

  async function remove(r) {
    if (!window.confirm(`حذف "${r.full_name_ar}"؟`)) return;
    const {data,error}=await supabase.rpc('delete_employee_safe',{p_emp:r.id});
    if (error) setErr(error.message); else { setMsg(data); load(); notifyChange('board'); }
  }

  if (!rows) return <div className="empty">جارٍ التحميل</div>;
  const totalOwn=rows.reduce((t,r)=>t+Number(r.ownership_pct||0),0);

  return (
    <>
      <div className="page-head">
        <div><h1>مجلس الإدارة والملاك</h1><p>الصفة التنظيمية والملكية والأجر الشهري بيانات مستقلة عن بعضها.</p></div>
        <div className="rowsplit">
          <Link className="btn ghost" href="/dashboard/employees">الموظفون</Link>
          <Link className="btn ghost" href="/print/board" target="_blank">طباعة</Link>
          {canWrite && <button className="btn" onClick={open?()=>{setOpen(false);setEditId(null);}:()=>{setEditId(null);setF({...EMPTY});setOpen(true);}}>{open?'إغلاق':'إضافة شخص'}</button>}
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}
      {totalOwn>0 && totalOwn!==100 && <div className="msg err" style={{marginBottom:14}}>مجموع نسب الملكية {totalOwn}% - راجعها إذا كان المفترض أن يكون المجموع 100%</div>}

      {open && <form onSubmit={save} className="section" style={{marginTop:0}}>
        <header><h2>{editId?'تعديل البيانات':'إضافة شخص'}</h2></header>
        <div style={{padding:18}}>
          <div style={{marginBottom:16,padding:'11px 13px',border:'1px solid var(--line)',borderRadius:8,color:'var(--ink-soft)',fontSize:13,lineHeight:1.8}}>
            الملكية ليست شرطًا للاستحقاق المالي. يمكن أن تكون نسبة الملكية فارغة تمامًا، ومع ذلك يحصل عضو مجلس الإدارة أو المالك على أجر شهري ثابت إذا تم تفعيل إدراجه في مسير الرواتب.
          </div>
          <div className="form-grid">
            <div className="field"><label>الصفة الأساسية *</label><select value={f.person_kind} onChange={(e)=>changeKind(e.target.value)}>{Object.entries(KIND).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field span2"><label>الاسم الكامل *</label><input required value={f.full_name_ar} onChange={set('full_name_ar')} /></div>
            <div className="field span2"><label>الاسم بالإنجليزية</label><input dir="ltr" value={f.full_name_en||''} onChange={set('full_name_en')} /></div>
            <div className="field"><label>الرقم المرجعي</label><input dir="ltr" value={f.employee_no||''} onChange={set('employee_no')} /></div>

            {f.person_kind==='board' ? (
              <OrgRoleFields value={f} onChange={setOrg} fixedClassificationCode="board" />
            ) : (
              <div className="field span2"><label>ملاحظة تنظيمية</label><span className="hint">صفة المالك أو الشريك مستقلة عن مناصب مجلس الإدارة وعن الاستحقاق الشهري.</span></div>
            )}

            <div className="field"><label>نسبة الملكية %</label><input type="number" step="0.01" min="0" max="100" dir="ltr" value={f.ownership_pct??''} onChange={set('ownership_pct')} /><span className="hint">اختيارية، ولا تدخل في حساب المسير الشهري.</span></div>
            <div className="field"><label>تاريخ التعيين بالمجلس</label><input type="date" dir="ltr" value={f.appointed_at||''} onChange={set('appointed_at')} /></div>

            <div className="field span2" style={{padding:'12px 14px',border:'1px solid var(--line)',borderRadius:8}}>
              <label style={{display:'flex',alignItems:'center',gap:9,cursor:'pointer'}}>
                <input type="checkbox" checked={Boolean(f.in_payroll)} onChange={(e)=>setF((current)=>({...current,in_payroll:e.target.checked}))} />
                إدراج في مسير الرواتب الشهري
              </label>
              <span className="hint">هذا الخيار مستقل تمامًا عن نسبة الملكية.</span>
            </div>
            <div className="field"><label>الأجر الشهري</label><input type="number" min="0" step="0.01" dir="ltr" value={f.monthly_compensation??0} onChange={set('monthly_compensation')} disabled={!f.in_payroll} /><span className="hint">الأجر الكامل للشهر قبل الغياب أو الاستحقاق الجزئي.</span></div>
            <div className="field"><label>تاريخ المباشرة {f.in_payroll?'*':''}</label><input required={Boolean(f.in_payroll)} type="date" dir="ltr" value={f.hire_date||''} onChange={set('hire_date')} disabled={!f.in_payroll} /><span className="hint">من هذا اليوم يبدأ احتساب استحقاق المسير.</span></div>

            <div className="field"><label>نوع الهوية</label><select value={f.id_kind||'national_id'} onChange={set('id_kind')}><option value="national_id">هوية وطنية</option><option value="iqama">إقامة</option></select></div>
            <div className="field"><label>رقم الهوية</label><input dir="ltr" value={f.id_number||''} onChange={set('id_number')} /></div>
            <div className="field"><label>انتهاء الهوية</label><input type="date" dir="ltr" value={f.id_expiry||''} onChange={set('id_expiry')} /></div>
            <div className="field"><label>الجوال</label><input dir="ltr" value={f.mobile||''} onChange={set('mobile')} /></div>
            <div className="field"><label>الجنسية</label><input value={f.nationality||''} onChange={set('nationality')} /></div>
            <div className="field span2"><label>البريد الإلكتروني</label><input type="email" dir="ltr" value={f.email||''} onChange={set('email')} /></div>
            <div className="field span2"><label>المهام</label><textarea rows="2" value={f.duties||''} onChange={set('duties')} /></div>
          </div>
          <div className="rowsplit"><button className="btn" type="submit">{editId?'حفظ':'إضافة'}</button><button className="btn ghost" type="button" onClick={()=>{setOpen(false);setEditId(null);setF({...EMPTY});}}>إلغاء</button></div>
        </div>
      </form>}

      <div className="section">
        <header><h2>الأعضاء والملاك</h2>{totalOwn>0 && <span style={{fontSize:13,color:'var(--ink-soft)'}}>مجموع الملكية {totalOwn}%</span>}</header>
        <div style={{padding:'10px 14px',color:'var(--ink-soft)',fontSize:13,lineHeight:1.7}}>لتعديل الراتب بسرعة من الجوال: غيّر «داخل المسير»، اكتب «الأجر الشهري»، اختر «تاريخ المباشرة» ثم اضغط «حفظ الأجر» في نفس صف الشخص.</div>
        {rows.length===0 ? <div className="empty"><h3>لا توجد بيانات</h3><p>أضف الأشخاص من أعلى الصفحة.</p></div> : (
          <div style={{overflowX:'auto'}}><table>
            <thead><tr><th>الاسم</th><th>التصنيف</th><th className="num">الملكية</th><th>داخل المسير</th><th className="num">الأجر الشهري</th><th>تاريخ المباشرة</th><th>حفظ سريع</th><th>الإجراءات</th></tr></thead>
            <tbody>{rows.map((r)=>{
              const left=daysUntil(r.id_expiry);
              const q=quick[r.id]||{in_payroll:false,monthly_compensation:0,hire_date:''};
              return <tr key={r.id}>
                <td><span style={{fontWeight:600}}>{r.full_name_ar}</span>{r.employee_no&&<div className="mono" style={{fontSize:11.5,color:'var(--ink-soft)'}}>{r.employee_no}</div>}{r.id_number&&<div className="mono" style={{fontSize:11.5,color:'var(--ink-soft)'}}>{r.id_number}{left!=null&&left<=60?` · ${left<0?'منتهية':`${left} يوم`}`:''}</div>}</td>
                <td>{r.kind_label}<div style={{fontSize:11.5,color:'var(--ink-soft)'}}>{r.board_role||r.job_title||''}</div></td>
                <td className="num">{r.ownership_pct!=null?`${r.ownership_pct}%`:'—'}</td>
                <td><label style={{display:'flex',alignItems:'center',gap:7,whiteSpace:'nowrap'}}><input type="checkbox" checked={Boolean(q.in_payroll)} disabled={!canWrite||savingQuick===r.id} onChange={(e)=>patchQuick(r.id,{in_payroll:e.target.checked})}/><span>{q.in_payroll?'نعم':'لا'}</span></label></td>
                <td className="num"><input aria-label={`الأجر الشهري لـ ${r.full_name_ar}`} type="number" inputMode="decimal" min="0" step="0.01" dir="ltr" value={q.monthly_compensation??0} disabled={!canWrite||!q.in_payroll||savingQuick===r.id} onChange={(e)=>patchQuick(r.id,{monthly_compensation:e.target.value})} style={{width:118,maxWidth:'30vw'}}/></td>
                <td><input aria-label={`تاريخ مباشرة ${r.full_name_ar}`} type="date" dir="ltr" value={q.hire_date||''} disabled={!canWrite||!q.in_payroll||savingQuick===r.id} onChange={(e)=>patchQuick(r.id,{hire_date:e.target.value})} style={{minWidth:138}}/></td>
                <td>{canWrite?<button className="btn" disabled={savingQuick===r.id} onClick={()=>saveQuick(r)}>{savingQuick===r.id?'جارٍ الحفظ…':'حفظ الأجر'}</button>:<span>{r.in_payroll?money(fixedMonthly(r)):'—'}</span>}</td>
                <td>{canWrite&&<div className="rowsplit"><button className="btn ghost" onClick={()=>startEdit(r)}>تعديل باقي البيانات</button><button className="btn ghost" onClick={()=>remove(r)}>حذف</button></div>}</td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
