'use client';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr, daysUntil } from '@/lib/format';
import { CLASS_AR, TRADES } from '@/lib/timesheet';

const EMPTY = { full_name:'', iqama_no:'', iqama_expiry:'', nationality:'',
                labor_class:'worker', trade:'', contractor_id:'', group_code:'',
                daily_rate:'', monthly_salary:'', phone:'' };

export default function Labor() {
  const [rows, setRows] = useState(null);
  const [cons, setCons] = useState([]);
  const [role, setRole] = useState(null);
  const [f, setF] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [filterC, setFilterC] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [l, c, u] = await Promise.all([
      supabase.from('laborers').select('*').order('full_name'),
      supabase.from('contractors').select('id, name_ar, worker_daily, tech_daily')
        .eq('is_active', true).order('name_ar'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(l.data || []); setCons(c.data || []); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function startEdit(r) {
    setEditId(r.id); setF({ ...EMPTY, ...r });
    setOpen(true); setErr(''); setMsg('');
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const p = { ...f };
    ['daily_rate','monthly_salary'].forEach((k)=>{
      p[k] = p[k] === '' || p[k] === null ? null : Number(p[k]);
    });
    p.iqama_expiry = p.iqama_expiry || null;
    p.contractor_id = p.contractor_id || null;
    delete p.id; delete p.created_at;

    const res = editId
      ? await supabase.from('laborers').update(p).eq('id', editId)
      : await supabase.from('laborers').insert(p);
    if (res.error) { setErr('تعذّر الحفظ: ' + res.error.message); return; }
    setMsg(editId ? 'حُفظت التعديلات' : 'أُضيف الفرد');
    setF({ ...EMPTY }); setEditId(null); setOpen(false); load();
  }

  async function toggle(r) {
    await supabase.from('laborers').update({ is_active: !r.is_active }).eq('id', r.id);
    load();
  }

  async function remove(r) {
    if (!window.confirm(`حذف "${r.full_name}"؟`)) return;
    const { error } = await supabase.from('laborers').delete().eq('id', r.id);
    if (error) setErr('مرتبط بسجلات حضور — عطّله بدل حذفه.');
    else { setMsg('حُذف'); load(); }
  }

  const list = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    return rows
      .filter((r)=>!filterC || r.contractor_id === filterC)
      .filter((r)=>!t || [r.full_name, r.iqama_no, r.trade, r.group_code]
        .filter(Boolean).some((v)=>String(v).includes(t)));
  }, [rows, q, filterC]);

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant','supervisor'].includes(role);
  const expSoon = rows.filter((r)=>{
    const d = daysUntil(r.iqama_expiry);
    return d !== null && d <= 60;
  }).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الأيدي العاملة</h1>
          <p>{rows.filter((r)=>r.is_active).length} على رأس العمل من {rows.length} مسجَّلاً</p>
        </div>
        {canWrite && (
          <button className="btn"
                  onClick={open ? ()=>{setOpen(false);setEditId(null);}
                                : ()=>{setEditId(null);setF({...EMPTY});setOpen(true);}}>
            {open ? 'إغلاق' : 'إضافة فرد'}
          </button>
        )}
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}
      {expSoon > 0 && (
        <div className="msg err" style={{marginBottom:14}}>
          {expSoon} إقامة تنتهي خلال ٦٠ يوماً أو منتهية
        </div>
      )}

      {open && (
        <form onSubmit={save} className="section" style={{marginTop:0}}>
          <header><h2>{editId ? 'تعديل فرد' : 'إضافة فرد'}</h2></header>
          <div style={{padding:18}}>
            <div className="form-grid">
              <div className="field span2">
                <label>الاسم *</label>
                <input required value={f.full_name} onChange={set('full_name')} />
              </div>
              <div className="field">
                <label>المقاول</label>
                <select value={f.contractor_id || ''}
                        onChange={(e)=>{
                          const c = cons.find((x)=>x.id===e.target.value);
                          setF({...f, contractor_id:e.target.value,
                                daily_rate: f.daily_rate ||
                                  (f.labor_class === 'technician' ? c?.tech_daily : c?.worker_daily) || ''});
                        }}>
                  <option value="">—</option>
                  {cons.map((c)=><option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </select>
              </div>
              <div className="field">
                <label>التصنيف *</label>
                <select value={f.labor_class} onChange={set('labor_class')}>
                  {Object.entries(CLASS_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field">
                <label>التخصص</label>
                <select value={f.trade || ''} onChange={set('trade')}>
                  <option value="">—</option>
                  {TRADES.map((t)=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="field">
                <label>الجنسية</label>
                <input value={f.nationality || ''} onChange={set('nationality')} />
              </div>
              <div className="field">
                <label>رقم الإقامة</label>
                <input dir="ltr" value={f.iqama_no || ''} onChange={set('iqama_no')} />
              </div>
              <div className="field">
                <label>انتهاء الإقامة</label>
                <input type="date" dir="ltr" value={f.iqama_expiry || ''} onChange={set('iqama_expiry')} />
              </div>
              <div className="field">
                <label>مجموعة الموقع</label>
                <input value={f.group_code || ''} onChange={set('group_code')}
                       placeholder="GRP-RYD-07" />
              </div>
              <div className="field">
                <label>اليومية</label>
                <input type="number" step="0.01" dir="ltr" value={f.daily_rate ?? ''}
                       onChange={set('daily_rate')} />
                <span className="hint">اتركها فارغة ليأخذ سعر الاتفاق</span>
              </div>
              <div className="field">
                <label>الراتب الشهري</label>
                <input type="number" step="0.01" dir="ltr" value={f.monthly_salary ?? ''}
                       onChange={set('monthly_salary')} />
              </div>
              <div className="field">
                <label>الجوال</label>
                <input dir="ltr" value={f.phone || ''} onChange={set('phone')} />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" type="submit">{editId ? 'حفظ' : 'إضافة'}</button>
              <button className="btn ghost" type="button"
                      onClick={()=>{setOpen(false);setEditId(null);setF({...EMPTY});}}>إلغاء</button>
            </div>
          </div>
        </form>
      )}

      <div className="section">
        <header>
          <h2>السجل</h2>
          <div className="rowsplit">
            <select value={filterC} onChange={(e)=>setFilterC(e.target.value)}
                    style={{fontSize:13,padding:'6px 8px'}}>
              <option value="">كل المقاولين</option>
              {cons.map((c)=><option key={c.id} value={c.id}>{c.name_ar}</option>)}
            </select>
            <input className="search" placeholder="ابحث بالاسم أو الإقامة أو التخصص"
                   value={q} onChange={(e)=>setQ(e.target.value)} />
          </div>
        </header>
        {list.length === 0 ? (
          <div className="empty"><h3>لا نتائج</h3><p>أضف أفراد العمالة من الإقامات.</p></div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr><th>الاسم</th><th>التصنيف</th><th>التخصص</th><th>المقاول</th>
                    <th className="num">اليومية</th><th>الإقامة</th><th>الانتهاء</th>
                    <th style={{width:170}}>الإجراءات</th></tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const left = daysUntil(r.iqama_expiry);
                  const cls = left === null ? '' : left < 0 ? 'bad' : left <= 60 ? 'warn' : 'ok';
                  return (
                    <tr key={r.id} style={!r.is_active ? {opacity:.55} : undefined}>
                      <td>{r.full_name}
                        {r.group_code && (
                          <div className="mono" style={{fontSize:11.5,color:'var(--ink-soft)'}}>
                            {r.group_code}</div>
                        )}
                      </td>
                      <td><span className="pill" style={{fontSize:11.5}}>
                        {CLASS_AR[r.labor_class]}</span></td>
                      <td style={{fontSize:12.5}}>{r.trade || '—'}</td>
                      <td style={{fontSize:12.5}}>
                        {cons.find((c)=>c.id===r.contractor_id)?.name_ar || '—'}</td>
                      <td className="num">{r.daily_rate ? money(r.daily_rate) : '—'}</td>
                      <td className="mono" style={{fontSize:12.5}}>{r.iqama_no || '—'}</td>
                      <td>
                        {left === null ? '—' : (
                          <span className={`pill ${cls}`} style={{fontSize:11.5}}>
                            {left < 0 ? `منتهية` : `${left} يوم`}
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="rowsplit">
                          {canWrite && (
                            <>
                              <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                      onClick={()=>startEdit(r)}>تعديل</button>
                              <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                      onClick={()=>toggle(r)}>
                                {r.is_active ? 'تعطيل' : 'تفعيل'}</button>
                              <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                              borderColor:'#EBC3C0',color:'#A32B24'}}
                                      onClick={()=>remove(r)}>حذف</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
