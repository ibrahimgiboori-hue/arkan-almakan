'use client';
import { useEffect, useState } from 'react';
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
  const [rows, setRows] = useState(null);
  const [acct, setAcct] = useState([]);
  const [role, setRole] = useState(null);
  const [f, setF] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [c, a, u] = await Promise.all([
      supabase.from('contractors').select('*').order('name_ar'),
      supabase.from('v_contractor_account').select('*'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(c.data || []); setAcct(a.data || []); setRole(u.data?.role || null);
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
      : await supabase.from('contractors').insert(payload);

    if (res.error) { setErr('تعذّر الحفظ: ' + res.error.message); return; }
    setMsg(editId ? 'حُفظت التعديلات' : 'أُضيف المقاول');
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

      {open && (
        <form onSubmit={save} className="section" style={{marginTop:0}}>
          <header><h2>{editId ? 'تعديل مقاول' : 'مقاول جديد'}</h2></header>
          <div style={{padding:18}}>
            <fieldset style={{borderTop:'none',paddingTop:0}}>
              <legend>البيانات الأساسية</legend>
              <div className="form-grid">
                <div className="field span2">
                  <label>الاسم *</label>
                  <input required value={f.name_ar} onChange={set('name_ar')} />
                </div>
                <div className="field">
                  <label>النوع</label>
                  <select value={f.kind} onChange={set('kind')}>
                    {Object.entries(KIND_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>مسؤول التواصل</label>
                  <input value={f.contact_name || ''} onChange={set('contact_name')} />
                </div>
                <div className="field">
                  <label>الجوال</label>
                  <input dir="ltr" value={f.mobile || ''} onChange={set('mobile')} />
                </div>
                <div className="field">
                  <label>التقييم</label>
                  <select value={f.rating || 3} onChange={set('rating')}>
                    {[1,2,3,4,5].map((n)=><option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="field span2">
                  <label>الآيبان</label>
                  <input dir="ltr" value={f.iban || ''} onChange={set('iban')} />
                </div>
                <div className="field">
                  <label>التخصصات</label>
                  <input value={f.specialties || ''} onChange={set('specialties')}
                         placeholder="لياسة، بلاط، دهان" />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>الطاقة والأسعار</legend>
              <div className="form-grid">
                <div className="field">
                  <label>أساس التعاقد المعتاد</label>
                  <select value={f.default_basis || 'بالمتر'} onChange={set('default_basis')}>
                    {['بالمتر','باليومية','بالراتب','مقطوعية'].map((x)=>
                      <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>يومية العامل</label>
                  <input type="number" step="0.01" dir="ltr" value={f.worker_daily ?? ''}
                         onChange={set('worker_daily')} />
                </div>
                <div className="field">
                  <label>يومية الصنايعي</label>
                  <input type="number" step="0.01" dir="ltr" value={f.tech_daily ?? ''}
                         onChange={set('tech_daily')} />
                </div>
                <div className="field">
                  <label>عدد العمال المتاح</label>
                  <input type="number" dir="ltr" value={f.workers_count ?? ''}
                         onChange={set('workers_count')} />
                </div>
                <div className="field">
                  <label>عدد الصنايعية المتاح</label>
                  <input type="number" dir="ltr" value={f.techs_count ?? ''}
                         onChange={set('techs_count')} />
                </div>
              </div>
            </fieldset>

            <fieldset>
              <legend>اتفاقية التحميل — من يتحمل ماذا مع هذا المقاول</legend>
              <div className="form-grid">
                {CHARGE_FIELDS.map(([k,label]) => (
                  <div className="field" key={k}>
                    <label>{label}</label>
                    <select value={f[k] || 'contractor'} onChange={set(k)}>
                      {Object.entries(CHARGE_AR).map(([kk,vv])=>
                        <option key={kk} value={kk}>{vv}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="hint">
                يقرأ النظام هذه الاتفاقية عند تسجيل أي صرف من العهدة فيصنّفه تلقائياً
              </div>
            </fieldset>

            <div className="rowsplit">
              <button className="btn" type="submit">{editId ? 'حفظ التعديلات' : 'إضافة'}</button>
              <button className="btn ghost" type="button"
                      onClick={()=>{setOpen(false);setEditId(null);setF({...EMPTY});}}>إلغاء</button>
            </div>
          </div>
        </form>
      )}

      <div className="section">
        <header><h2>السجل</h2></header>
        {rows.length === 0 ? (
          <div className="empty"><h3>لا مقاولين</h3><p>أضف أول مقاول من الزر أعلى الصفحة.</p></div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr><th>الاسم</th><th>النوع</th><th>الأساس</th>
                    <th className="num">يومية عامل</th><th className="num">يومية صنايعي</th>
                    <th>الوجبات على</th><th className="num">الرصيد</th><th>التقييم</th>
                    <th style={{width:180}}>الإجراءات</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={!r.is_active ? {opacity:.55} : undefined}>
                    <td>
                      {r.name_ar}
                      {r.specialties && (
                        <div style={{fontSize:12,color:'var(--ink-soft)'}}>{r.specialties}</div>
                      )}
                    </td>
                    <td style={{fontSize:12.5}}>{KIND_AR[r.kind]}</td>
                    <td style={{fontSize:12.5}}>{r.default_basis || '—'}</td>
                    <td className="num">{r.worker_daily ? money(r.worker_daily) : '—'}</td>
                    <td className="num">{r.tech_daily ? money(r.tech_daily) : '—'}</td>
                    <td>
                      <span className="pill" style={{fontSize:11.5}}>
                        {CHARGE_AR[r.meals_charge_to]}
                      </span>
                    </td>
                    <td className="num">{money(balOf(r.id))}</td>
                    <td>{'★'.repeat(r.rating || 0)}</td>
                    <td>
                      <div className="rowsplit">
                        {canWrite && (
                          <>
                            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                    onClick={()=>startEdit(r)}>تعديل</button>
                            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                    onClick={()=>toggle(r)}>
                              {r.is_active ? 'تعطيل' : 'تفعيل'}
                            </button>
                            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                            borderColor:'#EBC3C0',color:'#A32B24'}}
                                    onClick={()=>remove(r)}>حذف</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
