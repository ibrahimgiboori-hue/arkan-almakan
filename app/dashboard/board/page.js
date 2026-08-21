'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { dateAr, daysUntil } from '@/lib/format';
import { useLiveRefresh, notifyChange } from '@/lib/live';
import OrgRoleFields from '@/components/OrgRoleFields';

const KIND = { owner:'مالك', partner:'شريك', board:'مجلس الإدارة' };
const EMPTY = {
  employee_no:'', full_name_ar:'', full_name_en:'', nationality:'',
  id_kind:'national_id', id_number:'', id_expiry:'', mobile:'', email:'',
  person_kind:'board', board_role:'', job_title:'', ownership_pct:'',
  org_classification_id:'', org_position_id:'', org_job_title_id:'',
  appointed_at:'', duties:'', status:'active', in_payroll:false,
};

export default function Board() {
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState(null);
  const [f, setF] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [b, u] = await Promise.all([
      supabase.from('v_board_report').select('*'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(b.data || []);
    setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);
  useLiveRefresh(load, ['board','all']);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
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
    setF({ ...EMPTY, ...r, ownership_pct:r.ownership_pct ?? '' });
    setOpen(true); setErr(''); setMsg('');
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const p = { ...f, in_payroll:false };
    p.ownership_pct = p.ownership_pct === '' ? null : Number(p.ownership_pct);
    ['id_expiry','appointed_at'].forEach((k)=>{ p[k]=p[k]||null; });
    ['org_classification_id','org_position_id','org_job_title_id'].forEach((k)=>{ p[k]=p[k]||null; });
    ['seq','kind_label','years_served'].forEach((k)=>delete p[k]);
    delete p.id; delete p.created_at; delete p.updated_at;

    const res = editId
      ? await supabase.from('employees').update(p).eq('id',editId)
      : await supabase.from('employees').insert(p);
    if (res.error) { setErr('تعذر الحفظ: '+res.error.message); return; }

    setMsg(editId?'حفظت التعديلات':'أضيف الشخص');
    setF({...EMPTY}); setEditId(null); setOpen(false);
    load(); notifyChange('board');
  }

  async function remove(r) {
    if (!window.confirm(`حذف "${r.full_name_ar}"؟`)) return;
    const {data,error}=await supabase.rpc('delete_employee_safe',{p_emp:r.id});
    if (error) setErr(error.message); else { setMsg(data); load(); notifyChange('board'); }
  }

  if (!rows) return <div className="empty">جارٍ التحميل</div>;
  const canWrite=['ceo','hr'].includes(role);
  const totalOwn=rows.reduce((t,r)=>t+Number(r.ownership_pct||0),0);

  return (
    <>
      <div className="page-head">
        <div><h1>مجلس الإدارة والملاك</h1><p>بيانات الأشخاص والصفة التنظيمية والملكية</p></div>
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
            لأعضاء مجلس الإدارة يحدد النظام التصنيف ثم المنصب ثم المسمى الوظيفي من الهيكل التنظيمي. الملكية تبقى معلومة مستقلة عن المنصب.
          </div>
          <div className="form-grid">
            <div className="field"><label>الصفة الأساسية *</label><select value={f.person_kind} onChange={(e)=>changeKind(e.target.value)}>{Object.entries(KIND).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field span2"><label>الاسم الكامل *</label><input required value={f.full_name_ar} onChange={set('full_name_ar')} /></div>
            <div className="field span2"><label>الاسم بالإنجليزية</label><input dir="ltr" value={f.full_name_en||''} onChange={set('full_name_en')} /></div>
            <div className="field"><label>الرقم المرجعي</label><input dir="ltr" value={f.employee_no||''} onChange={set('employee_no')} /></div>

            {f.person_kind==='board' ? (
              <OrgRoleFields value={f} onChange={setOrg} fixedClassificationCode="board" />
            ) : (
              <div className="field span2"><label>ملاحظة تنظيمية</label><span className="hint">صفة المالك أو الشريك مستقلة عن مناصب مجلس الإدارة. إذا كان الشخص عضوًا في المجلس فسجله ضمن مجلس الإدارة وسجل نسبة الملكية هنا.</span></div>
            )}

            <div className="field"><label>نسبة الملكية %</label><input type="number" step="0.01" min="0" max="100" dir="ltr" value={f.ownership_pct??''} onChange={set('ownership_pct')} /></div>
            <div className="field"><label>تاريخ التعيين</label><input type="date" dir="ltr" value={f.appointed_at||''} onChange={set('appointed_at')} /></div>
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
        {rows.length===0 ? <div className="empty"><h3>لا توجد بيانات</h3><p>أضف الأشخاص من أعلى الصفحة.</p></div> : (
          <div style={{overflowX:'auto'}}><table>
            <thead><tr><th>الاسم</th><th>التصنيف</th><th>المنصب</th><th>المسمى الوظيفي</th><th className="num">الملكية</th><th>رقم الهوية</th><th>التعيين</th><th>الجوال</th><th>الإجراءات</th></tr></thead>
            <tbody>{rows.map((r)=>{
              const left=daysUntil(r.id_expiry);
              return <tr key={r.id}>
                <td><span style={{fontWeight:600}}>{r.full_name_ar}</span>{r.employee_no&&<div className="mono" style={{fontSize:11.5,color:'var(--ink-soft)'}}>{r.employee_no}</div>}</td>
                <td>{r.kind_label}</td>
                <td>{r.board_role||'غير محدد'}</td>
                <td>{r.job_title||'غير محدد'}</td>
                <td className="num">{r.ownership_pct!=null?`${r.ownership_pct}%`:'غير محدد'}</td>
                <td className="mono">{r.id_number||'غير محدد'}{left!=null&&left<=60&&<div>{left<0?'هوية منتهية':`${left} يوم`}</div>}</td>
                <td className="mono">{dateAr(r.appointed_at)}</td>
                <td className="mono">{r.mobile||'غير محدد'}</td>
                <td>{canWrite&&<div className="rowsplit"><button className="btn ghost" onClick={()=>startEdit(r)}>تعديل</button><button className="btn ghost" onClick={()=>remove(r)}>حذف</button></div>}</td>
              </tr>;
            })}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
