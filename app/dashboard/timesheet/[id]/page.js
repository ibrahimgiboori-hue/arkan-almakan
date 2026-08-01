'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr, qty as fq } from '@/lib/format';
import { ATTEND, ATTEND_CYCLE, CLASS_AR, DAY_EXPENSE_CATS, dayName } from '@/lib/timesheet';
import { CHARGE_AR } from '@/lib/projects';
import './timesheet.css';

export default function WeekSheet() {
  const { id } = useParams();
  const [w, setW] = useState(null);
  const [days, setDays] = useState([]);
  const [labs, setLabs] = useState([]);
  const [att, setAtt] = useState([]);
  const [dItems, setDItems] = useState([]);
  const [items, setItems] = useState([]);
  const [exps, setExps] = useState([]);
  const [pc, setPc] = useState(null);
  const [prod, setProd] = useState([]);
  const [sum, setSum] = useState(null);
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState('grid');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const sess = (await supabase.auth.getSession()).data.session;
    const { data: week } = await supabase.from('timesheet_weeks')
      .select('*, projects(name_ar, project_no), contractors(name_ar)')
      .eq('id', id).maybeSingle();
    if (!week) { setErr('لم يُعثر على هذا الأسبوع.'); return; }
    setW(week);

    const [d, l, a, s, u] = await Promise.all([
      supabase.from('timesheet_days').select('*').eq('week_id', id).order('work_date'),
      supabase.from('laborers').select('*')
        .eq('contractor_id', week.contractor_id).eq('is_active', true).order('full_name'),
      supabase.from('project_contractors').select('*')
        .eq('project_id', week.project_id).eq('contractor_id', week.contractor_id).maybeSingle(),
      supabase.from('v_week_summary').select('*').eq('week_id', id).maybeSingle(),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setDays(d.data || []); setLabs(l.data || []); setPc(a.data || null);
    setSum(s.data || null); setRole(u.data?.role || null);

    const dayIds = (d.data || []).map((x)=>x.id);
    const [at, di, ex, pr, it] = await Promise.all([
      dayIds.length ? supabase.from('attendance').select('*').in('day_id', dayIds) : { data: [] },
      dayIds.length ? supabase.from('day_items').select('*').in('day_id', dayIds) : { data: [] },
      dayIds.length ? supabase.from('day_expenses').select('*').in('day_id', dayIds) : { data: [] },
      dayIds.length ? supabase.from('v_daily_productivity').select('*').in('day_id', dayIds) : { data: [] },
      supabase.from('project_items').select('id, description_ar, unit, sort_order')
        .eq('project_id', week.project_id).eq('kind','item').order('sort_order'),
    ]);
    setAtt(at.data || []); setDItems(di.data || []);
    setExps(ex.data || []); setProd(pr.data || []); setItems(it.data || []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const flash = (m) => { setMsg(m); setTimeout(()=>setMsg(''), 1400); };
  const cell = (dayId, labId) => att.find((a)=>a.day_id===dayId && a.laborer_id===labId);

  const rateFor = (l) => Number(
    l.daily_rate ??
    (l.labor_class === 'technician' ? pc?.tech_daily : pc?.worker_daily) ?? 0);

  // نقرة على الخلية تُدوّر الحالة
  async function cycle(day, lab) {
    const cur = cell(day.id, lab.id);
    const idx = cur ? ATTEND_CYCLE.indexOf(cur.status) : -1;
    const next = ATTEND_CYCLE[(idx + 1) % ATTEND_CYCLE.length];

    if (cur) {
      setAtt(att.map((a)=>a.id===cur.id ? {...a, status:next} : a));
      const { error } = await supabase.from('attendance')
        .update({ status: next }).eq('id', cur.id);
      if (error) setErr(error.message);
    } else {
      const { data, error } = await supabase.from('attendance').insert({
        day_id: day.id, laborer_id: lab.id, status: next, rate_used: rateFor(lab),
      }).select('*').single();
      if (error) setErr(error.message); else setAtt([...att, data]);
    }
  }

  async function fillDay(day, status) {
    setBusy(true);
    const { error } = await supabase.rpc('fill_day_attendance',
      { p_day: day.id, p_status: status });
    setBusy(false);
    if (error) setErr(error.message); else { flash('عُبّئ اليوم'); load(); }
  }

  async function setOutput(dayId, itemId, val) {
    const ex = dItems.find((x)=>x.day_id===dayId && x.project_item_id===itemId);
    if (ex) {
      setDItems(dItems.map((x)=>x.id===ex.id ? {...x, group_output:val} : x));
      await supabase.from('day_items').update({ group_output: val }).eq('id', ex.id);
    } else {
      const { data } = await supabase.from('day_items').insert({
        day_id: dayId, project_item_id: itemId, group_output: val,
      }).select('*').single();
      if (data) setDItems([...dItems, data]);
    }
  }

  async function addDayItem(dayId, itemId) {
    if (!itemId) return;
    if (dItems.some((x)=>x.day_id===dayId && x.project_item_id===itemId)) return;
    const it = items.find((i)=>i.id===itemId);
    const { data, error } = await supabase.from('day_items').insert({
      day_id: dayId, project_item_id: itemId, group_output: 0, unit: it?.unit,
    }).select('*').single();
    if (error) setErr(error.message); else setDItems([...dItems, data]);
  }

  async function delDayItem(rowId) {
    await supabase.from('day_items').delete().eq('id', rowId);
    setDItems(dItems.filter((x)=>x.id!==rowId));
  }

  async function updDay(dayId, fields) {
    setDays(days.map((d)=>d.id===dayId ? {...d, ...fields} : d));
    await supabase.from('timesheet_days').update(fields).eq('id', dayId);
  }

  async function addExpense(dayId, e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await supabase.from('day_expenses').insert({
      day_id: dayId,
      category: fd.get('category'),
      amount: Number(fd.get('amount')),
      payer: fd.get('payer'),
      contractor_id: w.contractor_id,
      notes: fd.get('notes') || null,
    });
    if (error) setErr(error.message); else { e.target.reset(); flash('سُجّل المصروف'); load(); }
  }

  async function delExpense(eid) {
    await supabase.from('day_expenses').delete().eq('id', eid);
    load();
  }

  async function buildSettlement() {
    setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('build_settlement', { p_week: id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    flash('بُنيت التسوية — راجعها في شاشة التسويات');
  }

  if (err && !w) return <div className="msg err">{err}</div>;
  if (!w) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant','supervisor'].includes(role);
  const dayTotal = (dayId) => att.filter((a)=>a.day_id===dayId)
    .reduce((t,a)=>t+Number(a.amount||0), 0);
  const labTotal = (labId) => att.filter((a)=>a.laborer_id===labId)
    .reduce((t,a)=>t+Number(a.amount||0), 0);
  const labDays = (labId) => att.filter((a)=>a.laborer_id===labId
    && ['full','stopped'].includes(a.status)).length
    + att.filter((a)=>a.laborer_id===labId && a.status==='half').length * 0.5;
  const grand = att.reduce((t,a)=>t+Number(a.amount||0), 0);
  const prodOf = (dayId) => prod.find((p)=>p.day_id===dayId);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الأسبوع #{w.week_no} — {w.projects?.name_ar}</h1>
          <p>
            <span className="mono">{dateAr(w.start_date)} — {dateAr(w.end_date)}</span>
            {w.contractors?.name_ar ? ` · ${w.contractors.name_ar}` : ''}
            {pc ? ` · عامل ${money(pc.worker_daily||0)} · صنايعي ${money(pc.tech_daily||0)}` : ''}
          </p>
        </div>
        <Link className="btn ghost" href="/dashboard/timesheet">كل الأسابيع</Link>
      </div>

      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}
      {!pc && (
        <div className="msg err" style={{marginBottom:12}}>
          لا اتفاق مسجَّل مع هذا المقاول في هذا المشروع — اليوميات ستكون صفراً
        </div>
      )}

      <div className="grid k4" style={{marginBottom:16}}>
        <div className="card">
          <h3>مستحقات الأسبوع</h3>
          <div className="big">{money(grand)}</div>
          <div className="foot">من الحضور</div>
        </div>
        <div className="card">
          <h3>مصروفات على أركان</h3>
          <div className="big">{money(sum?.expenses_arkan || 0)}</div>
          <div className="foot">تُضاف للتكلفة</div>
        </div>
        <div className="card">
          <h3>صرفها المقاول عنا</h3>
          <div className="big">{money(sum?.contractor_reimbursable || 0)}</div>
          <div className="foot">تُضاف لمستحقاته</div>
        </div>
        <div className="card">
          <h3>الغياب</h3>
          <div className="big" style={{color: Number(sum?.absent_days||0) ? 'var(--bad)' : undefined}}>
            {sum?.absent_days || 0}
          </div>
          <div className="foot">يوم غياب</div>
        </div>
      </div>

      <div className="tabs">
        {[['grid','جدول الحضور'],['items','عناوين الأيام والإنتاج'],
          ['exp','المصروفات'],['notes','ملاحظات الأيام']].map(([k,l])=>(
          <button key={k} className={tab===k?'on':''} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      {/* ============ جدول الحضور ============ */}
      {tab === 'grid' && (
        <>
          <div className="rowsplit" style={{marginBottom:10,flexWrap:'wrap'}}>
            <span style={{fontSize:12.5,color:'var(--ink-soft)'}}>انقر الخلية لتغيير الحالة:</span>
            {Object.entries(ATTEND).map(([k,v])=>(
              <span key={k} className={`legend ${v.cls}`}>{v.short} {v.ar}</span>
            ))}
          </div>

          {labs.length === 0 ? (
            <div className="section" style={{marginTop:0}}>
              <div className="empty">
                <h3>لا عمالة لهذا المقاول</h3>
                <p>أضف الأفراد من شاشة الأيدي العاملة أولاً.</p>
              </div>
            </div>
          ) : (
            <div className="section ts-wrap" style={{marginTop:0}}>
              <table className="ts-grid">
                <thead>
                  <tr>
                    <th className="sticky-c">الاسم</th>
                    <th style={{width:'60px'}}>الفئة</th>
                    <th style={{width:'60px'}} className="num">اليومية</th>
                    {days.map((d)=>(
                      <th key={d.id} className="dayhead">
                        <div>{dayName(d.work_date)}</div>
                        <div className="mono dnum">{dateAr(d.work_date).slice(0,5)}</div>
                      </th>
                    ))}
                    <th style={{width:'56px'}} className="num">أيام</th>
                    <th style={{width:'86px'}} className="num">المستحق</th>
                  </tr>
                </thead>
                <tbody>
                  {labs.map((l)=>(
                    <tr key={l.id}>
                      <td className="sticky-c nm">{l.full_name}
                        {l.trade && <div className="tr">{l.trade}</div>}
                      </td>
                      <td style={{fontSize:11.5}}>{CLASS_AR[l.labor_class]}</td>
                      <td className="num">{money(rateFor(l))}</td>
                      {days.map((d)=>{
                        const a = cell(d.id, l.id);
                        const st = a?.status;
                        return (
                          <td key={d.id} className={`acell ${st ? ATTEND[st].cls : ''}`}
                              onClick={canWrite ? ()=>cycle(d, l) : undefined}
                              title={st ? ATTEND[st].ar : 'لم يُسجَّل'}>
                            {st ? ATTEND[st].short : ''}
                          </td>
                        );
                      })}
                      <td className="num">{labDays(l.id)}</td>
                      <td className="num tot">{money(labTotal(l.id))}</td>
                    </tr>
                  ))}
                  <tr className="foot-row">
                    <td className="sticky-c">الإجمالي</td>
                    <td colSpan={2} />
                    {days.map((d)=>(
                      <td key={d.id} className="num">{money(dayTotal(d.id))}</td>
                    ))}
                    <td />
                    <td className="num tot">{money(grand)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {canWrite && labs.length > 0 && (
            <div className="section">
              <header><h2>تعبئة سريعة</h2></header>
              <div style={{padding:14,display:'flex',gap:8,flexWrap:'wrap'}}>
                {days.map((d)=>(
                  <button key={d.id} className="btn ghost" disabled={busy}
                          style={{padding:'6px 11px',fontSize:12.5}}
                          onClick={()=>fillDay(d,'full')}>
                    {dayName(d.work_date)} — الكل حاضر
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============ عناوين الأيام والإنتاج ============ */}
      {tab === 'items' && (
        <div className="section" style={{marginTop:0}}>
          <header>
            <h2>عنوان كل يوم وإنتاجه</h2>
            <span style={{fontSize:12.5,color:'var(--ink-soft)'}}>
              عدد الأيام التي حملت بنداً يكشف المدة التي استغرقها
            </span>
          </header>
          <div style={{padding:14}}>
            {days.map((d)=>{
              const mine = dItems.filter((x)=>x.day_id===d.id);
              const p = prodOf(d.id);
              return (
                <div key={d.id} className="daybox">
                  <div className="daybox-h">
                    <span>{dayName(d.work_date)} <span className="mono">{dateAr(d.work_date)}</span></span>
                    {p && p.target_output ? (
                      <span className={`pill ${Number(p.achieved_pct||0) >= 100 ? 'ok'
                        : Number(p.achieved_pct||0) >= 80 ? 'warn' : 'bad'}`}>
                        {fq(p.total_output)} من {fq(p.target_output)} {p.target_unit || ''}
                        {' '}({Number(p.achieved_pct||0).toFixed(0)}%)
                      </span>
                    ) : (
                      <span style={{fontSize:12,color:'var(--ink-soft)'}}>
                        {p?.present_count || 0} حاضراً
                      </span>
                    )}
                  </div>
                  <table className="mini">
                    <tbody>
                      {mine.map((x)=>{
                        const it = items.find((i)=>i.id===x.project_item_id);
                        return (
                          <tr key={x.id}>
                            <td>{it?.description_ar || '—'}</td>
                            <td style={{width:110}}>
                              <input type="number" step="any" dir="ltr" defaultValue={x.group_output}
                                     disabled={!canWrite}
                                     onBlur={(e)=>setOutput(d.id, x.project_item_id, Number(e.target.value||0))}
                                     style={{width:'100%',border:'1px solid var(--hair)',
                                             padding:'3px 5px',textAlign:'left'}} />
                            </td>
                            <td style={{width:44,fontSize:12}}>{it?.unit || ''}</td>
                            <td style={{width:56}}>
                              {canWrite && (
                                <button className="btn ghost" style={{padding:'2px 7px',fontSize:11.5}}
                                        onClick={()=>delDayItem(x.id)}>حذف</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {canWrite && (
                    <select defaultValue="" onChange={(e)=>{addDayItem(d.id, e.target.value); e.target.value='';}}
                            style={{fontSize:12.5,padding:'4px 6px',marginTop:6,maxWidth:'100%'}}>
                      <option value="">+ إضافة بند لهذا اليوم…</option>
                      {items.map((i)=>(
                        <option key={i.id} value={i.id}>{i.description_ar?.slice(0,50)}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ المصروفات ============ */}
      {tab === 'exp' && (
        <div className="section" style={{marginTop:0}}>
          <header>
            <h2>مصروفات الأسبوع</h2>
            {canWrite && (
              <button className="btn" disabled={busy} onClick={buildSettlement}
                      style={{padding:'5px 12px',fontSize:13}}>بناء التسوية الأسبوعية</button>
            )}
          </header>
          <div style={{padding:14}}>
            {days.map((d)=>{
              const mine = exps.filter((x)=>x.day_id===d.id);
              return (
                <div key={d.id} className="daybox">
                  <div className="daybox-h">
                    <span>{dayName(d.work_date)} <span className="mono">{dateAr(d.work_date)}</span></span>
                    <span className="mono" style={{fontSize:12}}>
                      {money(mine.reduce((t,x)=>t+Number(x.amount),0))}
                    </span>
                  </div>
                  {mine.length > 0 && (
                    <table className="mini">
                      <tbody>
                        {mine.map((x)=>(
                          <tr key={x.id}>
                            <td style={{width:90,fontSize:12.5}}>{x.category}</td>
                            <td className="num" style={{width:80}}>{money(x.amount)}</td>
                            <td style={{width:96}}>
                              <span className="pill" style={{fontSize:11}}>
                                {x.payer === 'contractor' ? 'دفعها المقاول' : 'من العهدة'}
                              </span>
                            </td>
                            <td style={{width:70}}>
                              <span className="pill" style={{fontSize:11}}>
                                {CHARGE_AR[x.charge_to]}</span>
                            </td>
                            <td style={{fontSize:12}}>{x.notes || ''}</td>
                            <td style={{width:52}}>
                              {canWrite && (
                                <button className="btn ghost" style={{padding:'2px 7px',fontSize:11.5}}
                                        onClick={()=>delExpense(x.id)}>حذف</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {canWrite && (
                    <form onSubmit={(e)=>addExpense(d.id, e)} className="expform">
                      <select name="category" required style={{fontSize:12.5}}>
                        {DAY_EXPENSE_CATS.map((c)=><option key={c} value={c}>{c}</option>)}
                      </select>
                      <input name="amount" type="number" step="0.01" required dir="ltr"
                             placeholder="المبلغ" style={{width:90,fontSize:12.5}} />
                      <select name="payer" style={{fontSize:12.5}}>
                        <option value="contractor">دفعها المقاول</option>
                        <option value="arkan_custody">من عهدة الموظف</option>
                        <option value="arkan_direct">من حساب أركان</option>
                      </select>
                      <input name="notes" placeholder="بيان" style={{fontSize:12.5,flex:1,minWidth:100}} />
                      <button className="btn" style={{padding:'4px 10px',fontSize:12.5}}>إضافة</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ الملاحظات ============ */}
      {tab === 'notes' && (
        <div className="section" style={{marginTop:0}}>
          <header><h2>ملاحظات الأيام</h2></header>
          <div style={{padding:14}}>
            {days.map((d)=>(
              <div key={d.id} className="daybox">
                <div className="daybox-h">
                  <span>{dayName(d.work_date)} <span className="mono">{dateAr(d.work_date)}</span></span>
                  {canWrite && (
                    <label style={{fontSize:12,display:'flex',alignItems:'center',gap:5}}>
                      <input type="checkbox" checked={!!d.weather_stop}
                             onChange={(e)=>updDay(d.id,{weather_stop:e.target.checked})} />
                      توقف لظرف خارجي
                    </label>
                  )}
                </div>
                <div className="form-grid" style={{marginTop:6}}>
                  <div className="field span2">
                    <label>تعقيدات وطلبات</label>
                    <textarea rows="2" defaultValue={d.notes || ''} disabled={!canWrite}
                              onBlur={(e)=>updDay(d.id,{notes:e.target.value})} />
                  </div>
                  <div className="field">
                    <label>آليات في الموقع</label>
                    <input defaultValue={d.machinery || ''} disabled={!canWrite}
                           onBlur={(e)=>updDay(d.id,{machinery:e.target.value})} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
