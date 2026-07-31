'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { CHARGE_AR, SPEND_CATEGORIES } from '@/lib/projects';

const G_KIND = { advance:'دفعة مقدمة', performance:'حسن تنفيذ',
                 final:'نهائي', maintenance:'صيانة', other:'أخرى' };

export default function ProjMoney({ project, canWrite, onChange }) {
  const [cust, setCust] = useState([]);
  const [trx, setTrx] = useState([]);
  const [cons, setCons] = useState([]);
  const [emps, setEmps] = useState([]);
  const [guar, setGuar] = useState([]);
  const [ret, setRet] = useState([]);
  const [nc, setNc] = useState({ employee_id:'', amount:'', purpose:'' });
  const [nt, setNt] = useState({ custody_id:'', amount:'', category:'شراء مواد',
                                 charge_to:'', contractor_id:'', beneficiary:'', notes:'' });
  const [ng, setNg] = useState({ kind:'performance', issuer:'', reference_no:'',
                                 amount:'', expiry_date:'' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [c, g, r, co, e] = await Promise.all([
      supabase.from('custodies').select('*').eq('project_id', project.id),
      supabase.from('guarantees').select('*').eq('project_id', project.id).order('expiry_date'),
      supabase.from('retentions').select('*').eq('project_id', project.id).order('held_at'),
      supabase.from('contractors').select('id, name_ar').eq('is_active', true).order('name_ar'),
      supabase.from('employees').select('id, full_name_ar, employee_no')
        .eq('status','active').order('employee_no'),
    ]);
    setCust(c.data || []); setGuar(g.data || []); setRet(r.data || []);
    setCons(co.data || []); setEmps(e.data || []);

    const ids = (c.data || []).map((x) => x.id);
    const { data: t } = ids.length
      ? await supabase.from('custody_transactions').select('*')
          .in('custody_id', ids).order('trx_date', { ascending: false })
      : { data: [] };
    setTrx(t || []);
    onChange?.();
  }

  useEffect(() => { load(); }, [project.id]);

  async function openCustody(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const no = await supabase.rpc('next_document_number', { p_doc_type:'CUSTODY', p_prefix:'CUS' });
    if (no.error) { setErr(no.error.message); return; }
    const { data: c, error } = await supabase.from('custodies').insert({
      custody_no: no.data, employee_id: nc.employee_id, project_id: project.id,
      is_restricted: true, purpose: nc.purpose,
    }).select('id').single();
    if (error) { setErr('تعذّر الفتح: ' + error.message); return; }

    if (Number(nc.amount) > 0) {
      await supabase.from('custody_transactions').insert({
        custody_id: c.id, direction: 'issue', amount: Number(nc.amount),
        project_id: project.id, category: 'صرف عهدة',
      });
    }
    setMsg('فُتحت العهدة'); setNc({ employee_id:'', amount:'', purpose:'' }); load();
  }

  async function addSpend(e) {
    e.preventDefault(); setErr(''); setMsg('');
    const payload = {
      custody_id: nt.custody_id, direction: 'spend',
      amount: Number(nt.amount), project_id: project.id,
      category: nt.category, beneficiary: nt.beneficiary || null,
      contractor_id: nt.contractor_id || null,
      notes: nt.notes || null,
    };
    if (nt.charge_to) payload.charge_to = nt.charge_to;

    const { error } = await supabase.from('custody_transactions').insert(payload);
    if (error) { setErr('تعذّر التسجيل: ' + error.message); return; }
    setMsg('سُجّل الصرف');
    setNt({ custody_id: nt.custody_id, amount:'', category:'شراء مواد',
            charge_to:'', contractor_id:'', beneficiary:'', notes:'' });
    load();
  }

  async function updTrx(id, fields) {
    const { error } = await supabase.from('custody_transactions').update(fields).eq('id', id);
    if (error) setErr(error.message); else load();
  }

  async function delTrx(id) {
    if (!window.confirm('حذف هذه الحركة؟')) return;
    const { error } = await supabase.from('custody_transactions').delete().eq('id', id);
    if (error) setErr(error.message); else load();
  }

  async function addGuarantee(e) {
    e.preventDefault(); setErr('');
    const { error } = await supabase.from('guarantees').insert({
      project_id: project.id, kind: ng.kind, issuer: ng.issuer || null,
      reference_no: ng.reference_no || null, amount: Number(ng.amount || 0),
      expiry_date: ng.expiry_date || null,
    });
    if (error) { setErr(error.message); return; }
    setNg({ kind:'performance', issuer:'', reference_no:'', amount:'', expiry_date:'' });
    load();
  }

  const balOf = (cid) => trx.filter((t) => t.custody_id === cid)
    .reduce((s,t) => s + (t.direction === 'issue' || t.direction === 'adjust'
                          ? Number(t.amount) : -Number(t.amount)), 0);

  const spent = trx.filter((t) => t.direction === 'spend');
  const sum = (w) => spent.filter((t) => t.charge_to === w)
    .reduce((s,t) => s + Number(t.amount), 0);
  const unclassified = spent.filter((t) => !t.charge_to).length;

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      <div className="grid k4" style={{marginBottom:18}}>
        <div className="card">
          <h3>تكلفة على أركان</h3>
          <div className="big">{money(sum('arkan'))}</div>
          <div className="foot">تُنقص الربح</div>
        </div>
        <div className="card">
          <h3>مطالبات على المالك</h3>
          <div className="big">{money(sum('owner'))}</div>
          <div className="foot">تُضاف للإيراد</div>
        </div>
        <div className="card">
          <h3>خصومات على المقاولين</h3>
          <div className="big">{money(sum('contractor'))}</div>
          <div className="foot">تُخصم من تسوياتهم</div>
        </div>
        <div className="card">
          <h3>رصيد العهد</h3>
          <div className="big">{money(cust.reduce((s,c)=>s+balOf(c.id),0))}</div>
          <div className="foot">{unclassified ? `${unclassified} حركة بلا تصنيف` : 'الكل مصنَّف'}</div>
        </div>
      </div>

      {canWrite && (
        <div className="grid k2">
          <form onSubmit={openCustody} className="section" style={{marginTop:0}}>
            <header><h2>فتح عهدة لهذا المشروع</h2></header>
            <div style={{padding:18}}>
              <div className="field">
                <label>الموظف *</label>
                <select required value={nc.employee_id}
                        onChange={(e)=>setNc({...nc, employee_id:e.target.value})}>
                  <option value="">—</option>
                  {emps.map((x)=><option key={x.id} value={x.id}>{x.full_name_ar}</option>)}
                </select>
              </div>
              <div className="field">
                <label>المبلغ</label>
                <input type="number" step="0.01" dir="ltr" value={nc.amount}
                       onChange={(e)=>setNc({...nc, amount:e.target.value})} />
              </div>
              <div className="field">
                <label>الغرض</label>
                <input value={nc.purpose} onChange={(e)=>setNc({...nc, purpose:e.target.value})} />
              </div>
              <button className="btn" type="submit">فتح العهدة</button>
              <div className="hint" style={{marginTop:8}}>
                مقيّدة بهذا المشروع — يرفض النظام صرفها على غيره
              </div>
            </div>
          </form>

          <form onSubmit={addSpend} className="section" style={{marginTop:0}}>
            <header><h2>تسجيل صرف</h2></header>
            <div style={{padding:18}}>
              <div className="field">
                <label>العهدة *</label>
                <select required value={nt.custody_id}
                        onChange={(e)=>setNt({...nt, custody_id:e.target.value})}>
                  <option value="">—</option>
                  {cust.map((c)=>{
                    const emp = emps.find((x)=>x.id===c.employee_id);
                    return <option key={c.id} value={c.id}>
                      {c.custody_no} — {emp?.full_name_ar || ''} (رصيد {money(balOf(c.id))})
                    </option>;
                  })}
                </select>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>المبلغ *</label>
                  <input type="number" step="0.01" required dir="ltr" value={nt.amount}
                         onChange={(e)=>setNt({...nt, amount:e.target.value})} />
                </div>
                <div className="field span2">
                  <label>البند</label>
                  <select value={nt.category} onChange={(e)=>setNt({...nt, category:e.target.value})}>
                    {SPEND_CATEGORIES.map((c)=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>على من يُحمَّل</label>
                  <select value={nt.charge_to} onChange={(e)=>setNt({...nt, charge_to:e.target.value})}>
                    <option value="">تلقائي بحسب الاتفاقية</option>
                    {Object.entries(CHARGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field span2">
                  <label>المقاول (إن وُجد)</label>
                  <select value={nt.contractor_id}
                          onChange={(e)=>setNt({...nt, contractor_id:e.target.value})}>
                    <option value="">—</option>
                    {cons.map((c)=><option key={c.id} value={c.id}>{c.name_ar}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>المستفيد / البيان</label>
                <input value={nt.beneficiary} onChange={(e)=>setNt({...nt, beneficiary:e.target.value})} />
              </div>
              <button className="btn" type="submit">تسجيل الصرف</button>
            </div>
          </form>
        </div>
      )}

      <div className="section">
        <header><h2>حركات العهد</h2></header>
        {trx.length === 0 ? (
          <div className="empty"><h3>لا حركات</h3><p>افتح عهدة وسجّل أول صرف.</p></div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr><th>التاريخ</th><th>النوع</th><th className="num">المبلغ</th>
                    <th>البند</th><th>المستفيد</th><th>التحميل</th>
                    <th>موافقة المالك</th>{canWrite && <th style={{width:70}}>—</th>}</tr>
              </thead>
              <tbody>
                {trx.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{dateAr(t.trx_date)}</td>
                    <td>{t.direction === 'issue' ? 'صرف عهدة' :
                         t.direction === 'spend' ? 'منصرف' :
                         t.direction === 'return' ? 'إرجاع' : 'تسوية'}</td>
                    <td className="num">{money(t.amount)}</td>
                    <td style={{fontSize:12.5}}>{t.category || '—'}</td>
                    <td style={{fontSize:12.5}}>{t.beneficiary || '—'}</td>
                    <td>
                      {t.direction === 'spend' ? (
                        canWrite ? (
                          <select value={t.charge_to || ''}
                                  onChange={(e)=>updTrx(t.id,{charge_to:e.target.value || null})}
                                  style={{fontSize:12,padding:'2px 4px'}}>
                            <option value="">بلا تصنيف</option>
                            {Object.entries(CHARGE_AR).map(([k,v])=>
                              <option key={k} value={k}>{v}</option>)}
                          </select>
                        ) : (
                          <span className="pill">{CHARGE_AR[t.charge_to] || 'بلا تصنيف'}</span>
                        )
                      ) : '—'}
                    </td>
                    <td>
                      {t.charge_to === 'owner' ? (
                        canWrite ? (
                          <button className="btn ghost" style={{padding:'3px 8px',fontSize:12}}
                                  onClick={()=>updTrx(t.id,{owner_approved:!t.owner_approved,
                                    owner_approval_date: !t.owner_approved
                                      ? new Date().toISOString().slice(0,10) : null})}>
                            {t.owner_approved ? 'معتمد ✓' : 'تسجيل الموافقة'}
                          </button>
                        ) : (
                          <span className={`pill ${t.owner_approved ? 'ok' : 'warn'}`}>
                            {t.owner_approved ? 'معتمد' : 'بلا موافقة'}
                          </span>
                        )
                      ) : '—'}
                    </td>
                    {canWrite && (
                      <td>
                        <button className="btn ghost" style={{padding:'3px 8px',fontSize:12,
                                        borderColor:'#EBC3C0',color:'#A32B24'}}
                                onClick={()=>delTrx(t.id)}>حذف</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid k2">
        <div className="section">
          <header><h2>الضمانات البنكية</h2></header>
          {canWrite && (
            <form onSubmit={addGuarantee} style={{padding:18,borderBottom:'1px solid var(--hair)'}}>
              <div className="form-grid">
                <div className="field">
                  <label>النوع</label>
                  <select value={ng.kind} onChange={(e)=>setNg({...ng, kind:e.target.value})}>
                    {Object.entries(G_KIND).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>القيمة</label>
                  <input type="number" step="0.01" dir="ltr" value={ng.amount}
                         onChange={(e)=>setNg({...ng, amount:e.target.value})} />
                </div>
                <div className="field">
                  <label>تاريخ الانتهاء</label>
                  <input type="date" dir="ltr" value={ng.expiry_date}
                         onChange={(e)=>setNg({...ng, expiry_date:e.target.value})} />
                </div>
                <div className="field span2">
                  <label>الجهة المُصدِرة</label>
                  <input value={ng.issuer} onChange={(e)=>setNg({...ng, issuer:e.target.value})} />
                </div>
                <div className="field">
                  <label>رقم الضمان</label>
                  <input dir="ltr" value={ng.reference_no}
                         onChange={(e)=>setNg({...ng, reference_no:e.target.value})} />
                </div>
              </div>
              <button className="btn" type="submit">إضافة</button>
            </form>
          )}
          {guar.length === 0 ? (
            <div className="empty"><h3>لا ضمانات</h3></div>
          ) : (
            <table>
              <thead><tr><th>النوع</th><th className="num">القيمة</th>
                         <th>الانتهاء</th><th>الحالة</th></tr></thead>
              <tbody>
                {guar.map((g) => {
                  const left = g.expiry_date
                    ? Math.round((new Date(g.expiry_date) - new Date()) / 86400000) : null;
                  return (
                    <tr key={g.id}>
                      <td>{G_KIND[g.kind]}</td>
                      <td className="num">{money(g.amount)}</td>
                      <td className="mono">{dateAr(g.expiry_date)}</td>
                      <td>
                        {left === null ? '—' : (
                          <span className={`pill ${left < 0 ? 'bad' : left <= 30 ? 'warn' : 'ok'}`}>
                            {left < 0 ? `منتهٍ منذ ${Math.abs(left)} يوم` : `${left} يوم`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="section">
          <header><h2>المحتجزات</h2></header>
          {ret.length === 0 ? (
            <div className="empty">
              <h3>لا محتجزات</h3>
              <p>تُسجَّل تلقائياً مع كل مستخلص فيه نسبة محتجزات.</p>
            </div>
          ) : (
            <table>
              <thead><tr><th>التاريخ</th><th className="num">المبلغ</th>
                         <th>الإفراج</th><th>الحالة</th></tr></thead>
              <tbody>
                {ret.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{dateAr(r.held_at)}</td>
                    <td className="num">{money(r.amount)}</td>
                    <td className="mono">{dateAr(r.due_release)}</td>
                    <td>
                      <span className={`pill ${r.released ? 'ok' : 'warn'}`}>
                        {r.released ? 'أُفرج عنه' : 'محتجز'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
