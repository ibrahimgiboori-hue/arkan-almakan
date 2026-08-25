'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { CHARGE_AR } from '@/lib/projects';

const KIND_AR = {
  sub_company:'شركة باطن', labor_contractor:'مقاول أنفار',
  supplier:'مورد مواد', equipment:'مؤجر معدات',
};
const EMPTY = {
  name_ar:'', kind:'labor_contractor', contact_name:'', mobile:'', iban:'',
  default_basis:'بالمتر', worker_daily:'', tech_daily:'',
  workers_count:'', techs_count:'', specialties:'', rating:3,
  meals_charge_to:'contractor', transport_charge_to:'contractor',
  housing_charge_to:'contractor', tools_charge_to:'contractor',
};

export default function Contractors() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [acct, setAcct] = useState([]);
  const [portalAccounts, setPortalAccounts] = useState([]);
  const [projectLinks, setProjectLinks] = useState([]);
  const [role, setRole] = useState(null);
  const [f, setF] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [credential, setCredential] = useState(null);
  const [permitPanel, setPermitPanel] = useState(null);
  const [permitResult, setPermitResult] = useState(null);

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [c, a, u, portal, links] = await Promise.all([
      supabase.from('contractors').select('*').order('name_ar'),
      supabase.from('v_contractor_account').select('*'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
      supabase.from('contractor_portal_accounts').select('id,contractor_id,username,display_name,is_active,password_reset_at,created_at'),
      supabase.from('project_contractors').select('contractor_id,project_id,is_active,start_date,end_date,projects(id,project_no,name_ar,status)').eq('is_active',true),
    ]);
    setRows(c.data || []); setAcct(a.data || []); setRole(u.data?.role || null);
    setPortalAccounts(portal.data || []);setProjectLinks(links.data || []);
  }

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function startEdit(r) {
    setEditId(r.id);
    setF({ ...EMPTY, ...r });
    setOpen(true); setErr(''); setMsg('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const payload = { ...f };
    ['worker_daily','tech_daily','workers_count','techs_count','rating'].forEach((k) => {
      payload[k] = payload[k] === '' || payload[k] === null ? null : Number(payload[k]);
    });
    delete payload.id; delete payload.created_at; delete payload.updated_at;

    const res = editId
      ? await supabase.from('contractors').update(payload).eq('id', editId)
      : await supabase.from('contractors').insert(payload).select('id,name_ar,contact_name,contractor_no').single();

    if (res.error) { setErr('تعذّر الحفظ: ' + res.error.message); return; }
    setMsg(editId ? 'حُفظت التعديلات' : 'أُضيف المقاول');
    if(!editId&&res.data&&role==='ceo') await provisionPortal(res.data,true);
    setF({ ...EMPTY }); setEditId(null); setOpen(false); load();
  }

  async function remove(r) {
    if (!window.confirm(`حذف "${r.name_ar}"؟`)) return;
    const { error } = await supabase.from('contractors').delete().eq('id', r.id);
    if (error) {
      setErr('لا يمكن الحذف لارتباطه بسجلات. عطّله بدل ذلك.');
      return;
    }
    setMsg('حُذف المقاول'); load();
  }

  async function toggle(r) {
    await supabase.from('contractors').update({ is_active: !r.is_active }).eq('id', r.id);
    load();
  }

  async function portalAction(r,action,extra={}){
    setErr('');setMsg('');
    const {data,error}=await supabase.functions.invoke('contractor-portal-admin',{body:{action,contractorId:r.id,...extra}});
    if(error){setErr('تعذر تنفيذ إجراء البوابة: '+(data?.message||data?.error||error.message));return null;}
    await load();return data;
  }

  async function provisionPortal(r,automatic=false){
    let username='';
    if(!automatic){const answer=window.prompt('اسم مستخدم لاتيني من 4 أحرف فأكثر. اتركه فارغًا ليولده النظام تلقائيًا:','');if(answer===null)return;username=answer.trim();}
    const data=await portalAction(r,'provision',{username:username||undefined,displayName:r.contact_name||r.name_ar});
    if(data?.temporaryPassword){setCredential({title:'بيانات دخول جديدة — تظهر الآن فقط',username:data.account.username,password:data.temporaryPassword,displayName:data.account.displayName});setMsg('أُنشئ حساب بوابة المقاول. انسخ كلمة المرور الآن.');}
  }

  async function resetPortalPassword(r){
    if(!window.confirm(`إنشاء كلمة مرور جديدة لحساب ${r.name_ar}؟ ستتوقف الكلمة السابقة فورًا.`))return;
    const data=await portalAction(r,'reset_password');
    if(data?.temporaryPassword)setCredential({title:'كلمة المرور الجديدة — تظهر الآن فقط',username:data.account.username,password:data.temporaryPassword,displayName:data.account.displayName});
  }

  async function savePermit(event){
    event.preventDefault();const f=permitPanel.form;setErr('');setPermitResult(null);
    const {data,error}=await supabase.rpc('fn_issue_contractor_edit_permit',{p_contractor_id:permitPanel.contractor.id,p_project_id:f.project_id,p_attendance_from:f.from,p_attendance_to:f.to,p_reason:f.reason,p_expires_hours:Number(f.hours||2)});
    if(error){setErr(error.message);return;}
    setPermitResult(data);setPermitPanel(null);setMsg('صدر تصريح تعديل مقفل على المقاول والمشروع والفترة المحددة.');
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant'].includes(role);
  const balOf = (id) => acct.filter((a) => a.contractor_id === id)
    .reduce((t,a) => t + Number(a.balance_before_works || 0), 0);

  const CHARGE_FIELDS = [
    ['meals_charge_to','وجبات العمال'],
    ['transport_charge_to','التنقلات'],
    ['housing_charge_to','السكن'],
    ['tools_charge_to','العدد والأدوات'],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>المقاولون</h1>
          <p>{rows.filter((r)=>r.is_active).length} نشط من {rows.length} — ولكل مقاول اتفاقية تحميل خاصة</p>
        </div>
        {canWrite && (
          <button className="btn"
                  onClick={open ? ()=>{setOpen(false);setEditId(null);}
                                : ()=>{setEditId(null);setF({...EMPTY});setOpen(true);}}>
            {open ? 'إغلاق' : 'مقاول جديد'}
          </button>
        )}
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}
      {credential&&<div className="section" style={{marginTop:0,borderColor:'#8B3332'}}><header><h2>{credential.title}</h2><button className="btn ghost" onClick={()=>setCredential(null)}>إخفاء</button></header><div style={{padding:16,display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}><div><small>مسؤول الحساب</small><b style={{display:'block'}}>{credential.displayName}</b></div><div><small>اسم المستخدم</small><b className="mono" style={{display:'block'}}>{credential.username}</b></div><div><small>كلمة المرور المؤقتة</small><b className="mono" style={{display:'block',color:'#8B3332'}}>{credential.password}</b></div><div><small>الرابط</small><a href="/contractor/login" target="_blank" style={{display:'block'}}>فتح بوابة المقاولين</a></div></div><div className="hint" style={{margin:'0 16px 16px'}}>لا يخزن النظام كلمة المرور مكشوفة. إذا ضاعت استخدم «إعادة كلمة المرور».</div></div>}
      {permitResult&&<div className="section" style={{marginTop:0,borderColor:'#8B3332'}}><header><h2>رمز تصريح التعديل — يظهر الآن فقط</h2><button className="btn ghost" onClick={()=>setPermitResult(null)}>إخفاء</button></header><div style={{padding:16,display:'flex',gap:18,alignItems:'center',flexWrap:'wrap'}}><b className="mono" style={{fontSize:28,color:'#8B3332',letterSpacing:4}}>{permitResult.code}</b><span>من {permitResult.attendanceFrom} إلى {permitResult.attendanceTo}</span><span>ينتهي {new Date(permitResult.expiresAt).toLocaleString('ar-SA-u-ca-gregory')}</span></div></div>}

      {open && (
        <form onSubmit={save} className="section" style={{marginTop:0}}>
          <header><h2>{editId ? 'تعديل مقاول' : 'مقاول جديد'}</h2></header>
          <div style={{padding:18}}>
            <fieldset style={{borderTop:'none',paddingTop:0}}>
              <legend>البيانات الأساسية</legend>
              <div className="form-grid">
                <div className="field span2"><label>الاسم *</label><input required value={f.name_ar} onChange={set('name_ar')} /></div>
                <div className="field"><label>النوع</label><select value={f.kind} onChange={set('kind')}>{Object.entries(KIND_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
                <div className="field"><label>مسؤول التواصل</label><input value={f.contact_name || ''} onChange={set('contact_name')} /></div>
                <div className="field"><label>الجوال</label><input dir="ltr" value={f.mobile || ''} onChange={set('mobile')} /></div>
                <div className="field"><label>التقييم</label><select value={f.rating || 3} onChange={set('rating')}>{[1,2,3,4,5].map((n)=><option key={n} value={n}>{n}</option>)}</select></div>
                <div className="field span2"><label>الآيبان</label><input dir="ltr" value={f.iban || ''} onChange={set('iban')} /></div>
                <div className="field"><label>التخصصات</label><input value={f.specialties || ''} onChange={set('specialties')} placeholder="لياسة، بلاط، دهان" /></div>
              </div>
            </fieldset>
            <fieldset>
              <legend>الطاقة والأسعار</legend>
              <div className="form-grid">
                <div className="field"><label>أساس التعاقد المعتاد</label><select value={f.default_basis || 'بالمتر'} onChange={set('default_basis')}>{['بالمتر','باليومية','بالراتب','مقطوعية'].map((x)=><option key={x} value={x}>{x}</option>)}</select></div>
                <div className="field"><label>يومية العامل</label><input type="number" step="0.01" dir="ltr" value={f.worker_daily ?? ''} onChange={set('worker_daily')} /></div>
                <div className="field"><label>يومية الصنايعي</label><input type="number" step="0.01" dir="ltr" value={f.tech_daily ?? ''} onChange={set('tech_daily')} /></div>
                <div className="field"><label>عدد العمال المتاح</label><input type="number" dir="ltr" value={f.workers_count ?? ''} onChange={set('workers_count')} /></div>
                <div className="field"><label>عدد الصنايعية المتاح</label><input type="number" dir="ltr" value={f.techs_count ?? ''} onChange={set('techs_count')} /></div>
              </div>
            </fieldset>
            <fieldset>
              <legend>اتفاقية التحميل — من يتحمل ماذا مع هذا المقاول</legend>
              <div className="form-grid">{CHARGE_FIELDS.map(([k,label]) => (<div className="field" key={k}><label>{label}</label><select value={f[k] || 'contractor'} onChange={set(k)}>{Object.entries(CHARGE_AR).map(([kk,vv])=><option key={kk} value={kk}>{vv}</option>)}</select></div>))}</div>
              <div className="hint">يقرأ النظام هذه الاتفاقية عند تسجيل أي صرف من العهدة فيصنّفه تلقائياً</div>
            </fieldset>
            <div className="rowsplit"><button className="btn" type="submit">{editId ? 'حفظ التعديلات' : 'إضافة'}</button><button className="btn ghost" type="button" onClick={()=>{setOpen(false);setEditId(null);setF({...EMPTY});}}>إلغاء</button></div>
          </div>
        </form>
      )}

      <div className="section">
        <header><h2>السجل</h2></header>
        {rows.length === 0 ? (<div className="empty"><h3>لا مقاولين</h3><p>أضف أول مقاول من الزر أعلى الصفحة.</p></div>) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead><tr><th>الاسم</th><th>النوع</th><th>الأساس</th><th className="num">يومية عامل</th><th className="num">يومية صنايعي</th><th>الوجبات على</th><th className="num">الرصيد</th><th>التقييم</th><th>بوابة المقاول</th><th style={{width:260}}>الإجراءات</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} style={!r.is_active ? {opacity:.55} : undefined}>
                  <td>{r.name_ar}{r.specialties && <div style={{fontSize:12,color:'var(--ink-soft)'}}>{r.specialties}</div>}</td>
                  <td style={{fontSize:12.5}}>{KIND_AR[r.kind]}</td><td style={{fontSize:12.5}}>{r.default_basis || '—'}</td>
                  <td className="num">{r.worker_daily ? money(r.worker_daily) : '—'}</td><td className="num">{r.tech_daily ? money(r.tech_daily) : '—'}</td>
                  <td><span className="pill" style={{fontSize:11.5}}>{CHARGE_AR[r.meals_charge_to]}</span></td><td className="num">{money(balOf(r.id))}</td><td>{'★'.repeat(r.rating || 0)}</td>
                  <td>{(()=>{const account=portalAccounts.find(a=>a.contractor_id===r.id);return account?<div style={{minWidth:180}}><b>{account.display_name}</b><div className="mono" style={{fontSize:11.5,color:'var(--ink-soft)'}}>{account.username}</div><div className="rowsplit" style={{marginTop:6}}>{role==='ceo'&&<><button className="btn ghost" style={{padding:'3px 7px',fontSize:11}} onClick={()=>resetPortalPassword(r)}>كلمة جديدة</button><button className="btn ghost" style={{padding:'3px 7px',fontSize:11}} onClick={()=>portalAction(r,'set_active',{isActive:!account.is_active})}>{account.is_active?'إيقاف':'تفعيل'}</button>{projectLinks.some(x=>x.contractor_id===r.id)&&<button className="btn ghost" style={{padding:'3px 7px',fontSize:11}} onClick={()=>{const links=projectLinks.filter(x=>x.contractor_id===r.id);setPermitPanel({contractor:r,links,form:{project_id:links[0]?.project_id||'',from:new Date().toISOString().slice(0,10),to:new Date().toISOString().slice(0,10),hours:2,reason:''}});}}>تصريح تعديل</button>}</>}</div></div>:role==='ceo'?<button className="btn ghost" style={{padding:'4px 8px',fontSize:11.5}} onClick={()=>provisionPortal(r)}>إنشاء الحساب</button>:<span>غير منشأ</span>;})()}</td>
                  <td><div className="rowsplit">{canWrite && <><button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} onClick={()=>router.push(`/dashboard/labor?contractor=${r.id}`)}>العمالة</button><button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} onClick={()=>router.push(`/dashboard/labor?contractor=${r.id}&add=1`)}>إضافة عامل</button><button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} onClick={()=>startEdit(r)}>تعديل</button><button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}} onClick={()=>toggle(r)}>{r.is_active ? 'تعطيل' : 'تفعيل'}</button><button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,borderColor:'#EBC3C0',color:'#A32B24'}} onClick={()=>remove(r)}>حذف</button></>}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      {permitPanel&&<div style={{position:'fixed',inset:0,background:'#21191955',display:'grid',placeItems:'center',zIndex:90,padding:18}}><form onSubmit={savePermit} className="section" style={{width:'min(560px,100%)',margin:0,background:'#fff'}}><header><h2>تصريح تعديل حضور — {permitPanel.contractor.name_ar}</h2><button type="button" className="btn ghost" onClick={()=>setPermitPanel(null)}>إغلاق</button></header><div className="form-grid" style={{padding:18}}><div className="field span2"><label>المشروع</label><select required value={permitPanel.form.project_id} onChange={e=>setPermitPanel(p=>({...p,form:{...p.form,project_id:e.target.value}}))}>{permitPanel.links.map(link=><option key={link.project_id} value={link.project_id}>{link.projects?.project_no} — {link.projects?.name_ar}</option>)}</select></div><div className="field"><label>من تاريخ الحضور</label><input type="date" required value={permitPanel.form.from} onChange={e=>setPermitPanel(p=>({...p,form:{...p.form,from:e.target.value}}))}/></div><div className="field"><label>إلى تاريخ الحضور</label><input type="date" required value={permitPanel.form.to} onChange={e=>setPermitPanel(p=>({...p,form:{...p.form,to:e.target.value}}))}/></div><div className="field"><label>صلاحية الرمز بالساعات</label><input type="number" min="1" max="168" value={permitPanel.form.hours} onChange={e=>setPermitPanel(p=>({...p,form:{...p.form,hours:e.target.value}}))}/></div><div className="field span2"><label>السبب</label><input required minLength={5} value={permitPanel.form.reason} onChange={e=>setPermitPanel(p=>({...p,form:{...p.form,reason:e.target.value}}))} placeholder="مثال: مراجعة كشف الأسبوع السابق"/></div><div className="span2 rowsplit"><button className="btn">إصدار الرمز</button><button type="button" className="btn ghost" onClick={()=>setPermitPanel(null)}>إلغاء</button></div></div></form></div>}
    </>
  );
}
