'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money, daysUntil } from '@/lib/format';
import { CLASS_AR, TRADES } from '@/lib/timesheet';

const BASIS = {
  daily: 'باليومية',
  salary: 'بالراتب',
  piecework: 'بالمتر',
};

const EMPTY = {
  full_name:'', iqama_no:'', iqama_expiry:'', nationality:'',
  labor_class:'worker', trade:'', group_code:'', pay_basis:'daily',
  daily_rate:'', monthly_salary:'', salary_days:30,
  piece_rate:'', piece_unit:'م2', deduct_absence:true, phone:'',
};

export default function ContractorLaborPage() {
  const { id } = useParams();
  const sp = useSearchParams();
  const openOnLoad = sp.get('add') === '1';
  const [contractor, setContractor] = useState(null);
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState(null);
  const [f, setF] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(openOnLoad);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [c, l, u] = await Promise.all([
      supabase.from('contractors').select('id,name_ar,worker_daily,tech_daily,is_active').eq('id', id).maybeSingle(),
      supabase.from('laborers').select('*').eq('contractor_id', id).order('full_name'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    if (c.error) setErr(c.error.message);
    setContractor(c.data || null);
    setRows(l.data || []);
    setRole(u.data?.role || null);
  }

  useEffect(() => { if (id) load(); }, [id]);
  useEffect(() => { if (openOnLoad) { setEditId(null); setF({ ...EMPTY }); setOpen(true); } }, [openOnLoad]);

  const canWrite = ['ceo','hr','accountant','supervisor'].includes(role);
  const list = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    return rows.filter((r) => !t || [r.full_name,r.iqama_no,r.trade,r.group_code]
      .filter(Boolean).some((v) => String(v).includes(t)));
  }, [rows,q]);

  const computedDaily = (r) => {
    if (r.pay_basis === 'salary') return Number(r.monthly_salary || 0) / 30;
    if (r.pay_basis === 'piecework') return null;
    return Number(r.daily_rate || 0);
  };

  function startNew() {
    setEditId(null);
    setF({ ...EMPTY, daily_rate: contractor?.worker_daily || '' });
    setOpen(true); setErr(''); setMsg('');
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function startEdit(r) {
    setEditId(r.id);
    setF({ ...EMPTY, ...r, salary_days:30 });
    setOpen(true); setErr(''); setMsg('');
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const p = { ...f, contractor_id:id };
    ['daily_rate','monthly_salary','piece_rate'].forEach((k) => {
      p[k] = p[k] === '' || p[k] === null ? null : Number(p[k]);
    });
    p.salary_days = 30;
    p.iqama_expiry = p.iqama_expiry || null;
    delete p.id; delete p.created_at;

    const res = editId
      ? await supabase.from('laborers').update(p).eq('id', editId)
      : await supabase.from('laborers').insert(p);
    if (res.error) { setErr('تعذّر الحفظ: ' + res.error.message); return; }
    setMsg(editId ? 'حُفظت التعديلات' : 'أُضيف العامل للمقاول');
    setF({ ...EMPTY }); setEditId(null); setOpen(false); load();
  }

  async function toggle(r) {
    const { error } = await supabase.from('laborers').update({ is_active: !r.is_active }).eq('id', r.id);
    if (error) setErr(error.message); else load();
  }

  if (!rows || !contractor) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>عمالة {contractor.name_ar}</h1>
          <p>{rows.filter((r)=>r.is_active).length} نشط من {rows.length} فرد مرتبط بالمقاول</p>
        </div>
        {canWrite && <button className="btn" onClick={open ? ()=>{setOpen(false);setEditId(null);} : startNew}>{open ? 'إغلاق' : 'إضافة عامل'}</button>}
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {open && (
        <form onSubmit={save} className="section" style={{marginTop:0}}>
          <header><h2>{editId ? 'تعديل العامل' : `إضافة عامل إلى ${contractor.name_ar}`}</h2></header>
          <div style={{padding:18}}>
            <div className="form-grid">
              <div className="field span2"><label>الاسم *</label><input required value={f.full_name} onChange={(e)=>setF({...f,full_name:e.target.value})} /></div>
              <div className="field"><label>التصنيف *</label><select value={f.labor_class} onChange={(e)=>{const labor_class=e.target.value;const suggested=labor_class==='technician'?contractor.tech_daily:contractor.worker_daily;setF({...f,labor_class,daily_rate:f.daily_rate||suggested||''});}}>{Object.entries(CLASS_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
              <div className="field"><label>التخصص</label><select value={f.trade || ''} onChange={(e)=>setF({...f,trade:e.target.value})}><option value="">—</option>{TRADES.map((t)=><option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field"><label>الجنسية</label><input value={f.nationality || ''} onChange={(e)=>setF({...f,nationality:e.target.value})} /></div>
              <div className="field"><label>رقم الإقامة</label><input dir="ltr" value={f.iqama_no || ''} onChange={(e)=>setF({...f,iqama_no:e.target.value})} /></div>
              <div className="field"><label>انتهاء الإقامة</label><input type="date" dir="ltr" value={f.iqama_expiry || ''} onChange={(e)=>setF({...f,iqama_expiry:e.target.value})} /></div>
              <div className="field"><label>مجموعة الموقع</label><input value={f.group_code || ''} onChange={(e)=>setF({...f,group_code:e.target.value})} placeholder="GRP-RYD-07" /></div>
              <div className="field"><label>أساس الأجر *</label><select value={f.pay_basis} onChange={(e)=>setF({...f,pay_basis:e.target.value})}>{Object.entries(BASIS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
              {f.pay_basis === 'daily' && <div className="field"><label>اليومية</label><input type="number" step="0.01" dir="ltr" value={f.daily_rate ?? ''} onChange={(e)=>setF({...f,daily_rate:e.target.value})} /></div>}
              {f.pay_basis === 'salary' && <div className="field"><label>الراتب الشهري</label><input type="number" step="0.01" dir="ltr" value={f.monthly_salary ?? ''} onChange={(e)=>setF({...f,monthly_salary:e.target.value})} /><span className="hint">اليومية = الراتب ÷ 30</span></div>}
              {f.pay_basis === 'piecework' && <><div className="field"><label>سعر الوحدة</label><input type="number" step="0.01" dir="ltr" value={f.piece_rate ?? ''} onChange={(e)=>setF({...f,piece_rate:e.target.value})} /></div><div className="field"><label>الوحدة</label><input value={f.piece_unit || ''} onChange={(e)=>setF({...f,piece_unit:e.target.value})} /></div></>}
              <div className="field"><label>الجوال</label><input dir="ltr" value={f.phone || ''} onChange={(e)=>setF({...f,phone:e.target.value})} /></div>
            </div>
            <div className="rowsplit"><button className="btn" type="submit">{editId ? 'حفظ' : 'إضافة'}</button><button className="btn ghost" type="button" onClick={()=>{setOpen(false);setEditId(null);setF({...EMPTY});}}>إلغاء</button></div>
          </div>
        </form>
      )}

      <div className="section">
        <header><h2>السجل</h2><input className="search" placeholder="ابحث بالاسم أو الإقامة أو التخصص" value={q} onChange={(e)=>setQ(e.target.value)} /></header>
        {list.length === 0 ? <div className="empty"><h3>لا توجد عمالة مرتبطة</h3><p>أضف أول عامل لهذا المقاول.</p></div> : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead><tr><th>الاسم</th><th>التصنيف</th><th>التخصص</th><th>أساس الأجر</th><th className="num">اليومية</th><th>الإقامة</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
              <tbody>{list.map((r)=>{const left=daysUntil(r.iqama_expiry);return <tr key={r.id} style={!r.is_active?{opacity:.55}:undefined}><td>{r.full_name}</td><td><span className="pill">{CLASS_AR[r.labor_class]}</span></td><td>{r.trade||'—'}</td><td>{BASIS[r.pay_basis]||'—'}</td><td className="num">{r.pay_basis==='piecework'?'متغير':money(computedDaily(r))}</td><td>{left===null?'—':left<0?`منتهية منذ ${Math.abs(left)} يوم`:`${left} يوم`}</td><td>{r.is_active?'نشط':'معطل'}</td><td><div className="rowsplit">{canWrite&&<><button className="btn ghost" onClick={()=>startEdit(r)}>تعديل</button><button className="btn ghost" onClick={()=>toggle(r)}>{r.is_active?'تعطيل':'تفعيل'}</button></>}</div></td></tr>;})}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
