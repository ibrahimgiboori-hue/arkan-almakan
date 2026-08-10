'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { MODE_AR } from '@/lib/projects';
import ItemBudget from '@/components/ItemBudget';
import { notifyChange, useLiveRefresh } from '@/lib/live';

export default function ProjScope({ projectId, canWrite, onChange }) {
  const [items, setItems] = useState(null);
  const [execs, setExecs] = useState([]);
  const [cons, setCons] = useState([]);
  const [decideFor, setDecideFor] = useState(null);
  const [editExec, setEditExec] = useState(null);
  const [tots, setTots] = useState([]);
  const [acts, setActs] = useState([]);
  const [endFor, setEndFor] = useState(null);
  const [endF, setEndF] = useState({});
  const [budgetFor, setBudgetFor] = useState(null);
  const [buds, setBuds] = useState([]);
  const [states, setStates] = useState([]);
  const [starting, setStarting] = useState(null);
  const [askStart, setAskStart] = useState(null);
  const [sDate, setSDate] = useState('');
  const [d, setD] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [i, e, c, bg, st, tt, ac] = await Promise.all([
      supabase.from('project_items').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('item_execution').select('*').order('decided_at', { ascending: true }),
      supabase.from('contractors').select('id, name_ar, worker_daily, tech_daily')
        .eq('is_active', true).order('name_ar'),
      supabase.from('v_item_budget').select('*').eq('project_id', projectId),
      supabase.from('v_item_execution_state').select('*').eq('project_id', projectId),
      supabase.from('v_item_assignment_totals').select('*').eq('project_id', projectId),
      supabase.from('v_item_assignment_actuals').select('*'),
    ]);
    setItems(i.data || []); setExecs(e.data || []); setCons(c.data || []);
    setBuds(bg.data || []); setStates(st.data || []); setTots(tt.data || []);
    setActs(ac.data || []);
    onChange?.();
  }

  useEffect(() => { load(); }, [projectId]);
  useLiveRefresh(load, ['scope','budget','exec','all']);

  const execsOf = (id) => execs.filter((x) => x.project_item_id === id);
  const execOf = (id) => execsOf(id)[0];
  const totOf = (id) => tots.find((x) => x.project_item_id === id) || {};
  const actOf = (execId) => acts.find((x) => x.exec_id === execId) || {};

  const END_AR = {
    completed: 'اكتمال', mutual: 'اتفاق', underperformance: 'تقصير',
    dispute: 'خلاف', other: 'أخرى',
  };

  async function addLine(kind) {
    const order = (items.length ? Math.max(...items.map((l)=>l.sort_order)) : 0) + 1;
    const { error } = await supabase.from('project_items').insert({
      project_id: projectId, sort_order: order, kind,
      description_ar: kind === 'title' ? 'عنوان قسم' : '',
      unit: kind === 'item' ? 'م2' : null, contract_qty: 1, sell_price: 0, budget_cost: 0,
    });
    if (error) setErr('تعذّر الإضافة: ' + error.message);
    else { load(); notifyChange('scope'); }
  }

  async function insertAfter(afterOrder, kind) {
    const { error } = await supabase.rpc('project_item_insert_after', {
      p_project: projectId, p_after_order: afterOrder, p_kind: kind,
    });
    if (error) setErr('تعذّر الإدراج: ' + error.message); else load();
  }

  // الحقول التي تغيّر الحسابات: تُعيد قراءة كل شيء مرتبط
  const CALC_FIELDS = ['contract_qty','sell_price','budget_cost'];

  async function upd(id, fields) {
    setItems(items.map((x) => x.id === id ? { ...x, ...fields } : x));
    const { error } = await supabase.from('project_items').update(fields).eq('id', id);
    if (error) { setErr('تعذّر الحفظ: ' + error.message); return; }

    // إن مسّ التعديل رقماً محسوباً، أعِد قراءة الملخصات كلها
    if (Object.keys(fields).some((k) => CALC_FIELDS.includes(k))) {
      await refreshCalc();
    }
    notifyChange('scope');
    onChange?.();
  }

  // إعادة قراءة الملخصات المحسوبة: القيم والميزانيات وحالات التنفيذ
  async function refreshCalc() {
    const [i, bg, st] = await Promise.all([
      supabase.from('project_items').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('v_item_budget').select('*').eq('project_id', projectId),
      supabase.from('v_item_execution_state').select('*').eq('project_id', projectId),
    ]);
    if (i.data) setItems(i.data);
    setBuds(bg.data || []);
    setStates(st.data || []);
  }

  async function del(id) {
    if (!window.confirm('حذف هذا البند وقراره وإنجازه؟')) return;
    const { error } = await supabase.from('project_items').delete().eq('id', id);
    if (error) setErr('تعذّر الحذف: ' + error.message);
    else { load(); notifyChange('scope'); }
  }

  async function move(id, dir) {
    const i = items.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const a = items[i], b = items[j];
    await supabase.from('project_items').update({ sort_order: -1 }).eq('id', a.id);
    await supabase.from('project_items').update({ sort_order: a.sort_order }).eq('id', b.id);
    await supabase.from('project_items').update({ sort_order: b.sort_order }).eq('id', a.id);
    load();
  }

  function openDecide(item, ex) {
    const t = totOf(item.id);
    setDecideFor(item);
    setEditExec(ex || null);
    setD(ex ? { ...ex } : {
      mode: 'piecework', contractor_id: '', agreed_rate: '', worker_daily: '',
      tech_daily: '', target_output: '', shortfall_deduction: '', planned_cost: '',
      share_qty: t.qty_remaining != null ? String(t.qty_remaining) : '',
      start_date: '', notes: '',
    });
    setErr(''); setMsg('');
  }

  async function saveDecision(e) {
    e.preventDefault(); setErr('');
    const payload = {
      project_item_id: decideFor.id,
      mode: d.mode,
      contractor_id: d.contractor_id || null,
      agreed_rate: d.agreed_rate === '' ? null : Number(d.agreed_rate),
      worker_daily: d.worker_daily === '' ? null : Number(d.worker_daily),
      tech_daily: d.tech_daily === '' ? null : Number(d.tech_daily),
      target_output: d.target_output === '' ? null : Number(d.target_output),
      shortfall_deduction: d.shortfall_deduction === '' ? null : Number(d.shortfall_deduction),
      planned_cost: d.planned_cost === '' ? null : Number(d.planned_cost),
      share_qty: d.share_qty === '' || d.share_qty == null ? null : Number(d.share_qty),
      start_date: d.start_date || null,
      notes: d.notes || null,
    };
    const res = editExec
      ? await supabase.from('item_execution').update(payload).eq('id', editExec.id)
      : await supabase.from('item_execution').insert(payload);
    if (res.error) { setErr('تعذّر الحفظ: ' + res.error.message); return; }
    setMsg(editExec ? 'حُدّث الإسناد' : 'أُضيف الإسناد');
    setDecideFor(null); setEditExec(null);
    await load(); notifyChange('exec'); onChange?.();
  }

  async function startExec(ex, date) {
    setStarting(ex.id); setErr(''); setMsg('');
    const { data, error } = await supabase.rpc('start_item_assignment',
      { p_exec: ex.id, p_start_date: date || null });
    setStarting(null);
    if (error) { setErr(error.message); return; }
    const parts = ['بدأ التنفيذ'];
    if (data?.created_agreement) parts.push('وأُنشئ اتفاق المقاول');
    setMsg(parts.join(' ') + '.');
    setAskStart(null);
    load();
  }

  function openEnd(ex, item) {
    setEndFor({ ex, item });
    setEndF({ date: new Date().toISOString().slice(0,10), reason: 'completed', qty: '' });
    setErr(''); setMsg('');
  }

  async function submitEnd(e) {
    e.preventDefault(); setErr('');
    const { error } = await supabase.rpc('end_item_assignment', {
      p_exec: endFor.ex.id,
      p_end_date: endF.date,
      p_end_reason: endF.reason,
      p_closing_qty: endF.qty === '' ? null : Number(endF.qty),
      p_notes: endF.notes || null,
    });
    if (error) { setErr(error.message); return; }
    setMsg('أُقفل الإسناد وتحرّرت الكمية المتبقية.');
    setEndFor(null);
    await load(); notifyChange('exec'); onChange?.();
  }

  async function delDecision(ex) {
    if (!ex || !window.confirm('حذف هذا الإسناد؟')) return;
    if (ex.end_date) { setErr('الإسناد المنتهي لا يُحذف — التاريخ يبقى.'); return; }
    const { error } = await supabase.from('item_execution').delete().eq('id', ex.id);
    if (error) setErr('تعذّر الحذف: ' + error.message);
    else load();
  }

  if (!items) return <div className="empty">جارٍ التحميل…</div>;

  // الترقيم الهرمي
  let top = 0, sub = 0, inTitle = false;
  const numbered = items.map((l) => {
    let number = '';
    if (l.kind === 'title') { top += 1; sub = 0; inTitle = true; number = String(top); }
    else if (inTitle) { sub += 1; number = `${top}-${sub}`; }
    else { top += 1; number = String(top); }
    return { ...l, number };
  });

  const totalContract = items.reduce((t,x) => t + Number(x.contract_value || 0), 0);
  const totalBudget = items.reduce((t,x) => t + Number(x.budget_value || 0), 0);
  const noDecision = items.filter((x) => x.kind === 'item' && !execOf(x.id)).length;

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      {noDecision > 0 && (
        <div className="msg err" style={{marginBottom:12}}>
          {noDecision} بنداً بلا إسناد — لا يبدأ التنفيذ قبل إسناد منفّذ
        </div>
      )}

      {canWrite && (
        <div className="rowsplit stickybar">
          <button className="btn" onClick={()=>addLine('item')}>+ بند في النهاية</button>
          <button className="btn ghost" onClick={()=>addLine('title')}>+ عنوان قسم</button>
          <span className="spacer" />
          <span style={{fontSize:13,color:'var(--ink-soft)'}}>
            قيمة العقد {money(totalContract)} · الميزانية {money(totalBudget)} ·
            الهامش المخطط {money(totalContract - totalBudget)}
          </span>
        </div>
      )}

      <div className="section" style={{marginTop:0,overflowX:'auto'}}>
        <table>
          <thead>
            <tr>
              <th style={{width:60}}>م</th>
              <th>بيان الأعمال</th>
              <th style={{width:70}}>الوحدة</th>
              <th style={{width:90}} className="num">الكمية</th>
              <th style={{width:100}} className="num">فئة البيع</th>
              <th style={{width:100}} className="num">تكلفة مخططة</th>
              <th style={{width:110}} className="num">قيمة البند</th>
              <th style={{width:260}}>الإسنادات</th>
              <th style={{width:120}}>—</th>
            </tr>
          </thead>
          <tbody>
            {numbered.map((l) => {
              const ex = execOf(l.id);
              if (l.kind === 'title') return (
                <tr key={l.id} style={{background:'var(--rose-wash)'}}>
                  <td className="mono" style={{fontWeight:700,color:'var(--maroon-dark)'}}>{l.number}</td>
                  <td colSpan={6}>
                    <input value={l.description_ar || ''} disabled={!canWrite}
                           onChange={(e)=>upd(l.id,{description_ar:e.target.value})}
                           style={{width:'100%',fontWeight:600,color:'var(--maroon-dark)',
                                   border:'none',background:'transparent',fontSize:14.5,fontFamily:'inherit'}} />
                  </td>
                  <td>—</td>
                  <td>
                    {canWrite && (
                      <div className="rowsplit">
                        <button className="btn" style={{padding:'3px 7px',fontSize:12}}
                                title="إدراج بند بعده" onClick={()=>insertAfter(l.sort_order,'item')}>+</button>
                        <button className="btn ghost" style={{padding:'3px 7px',fontSize:12}}
                                title="إدراج عنوان بعده" onClick={()=>insertAfter(l.sort_order,'title')}>+ع</button>
                        <button className="btn ghost" style={{padding:'3px 7px',fontSize:12}}
                                onClick={()=>move(l.id,-1)}>▲</button>
                        <button className="btn ghost" style={{padding:'3px 7px',fontSize:12}}
                                onClick={()=>move(l.id,1)}>▼</button>
                        <button className="btn ghost" style={{padding:'3px 7px',fontSize:12}}
                                onClick={()=>del(l.id)}>حذف</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
              return (
                <tr key={l.id}>
                  <td className="mono">{l.number}</td>
                  <td>
                    <textarea rows="2" value={l.description_ar || ''} disabled={!canWrite}
                              onChange={(e)=>upd(l.id,{description_ar:e.target.value})}
                              style={{width:'100%',border:'1px solid var(--hair)',fontFamily:'inherit',
                                      fontSize:13.5,padding:'4px 6px',resize:'vertical'}} />
                  </td>
                  <td>
                    <input value={l.unit || ''} disabled={!canWrite}
                           onChange={(e)=>upd(l.id,{unit:e.target.value})}
                           style={{width:'100%',border:'1px solid var(--hair)',padding:'4px',fontSize:13}} />
                  </td>
                  <td>
                    <input type="number" step="any" dir="ltr" value={l.contract_qty ?? ''} disabled={!canWrite}
                           onChange={(e)=>upd(l.id,{contract_qty:Number(e.target.value||0)})}
                           style={{width:'100%',border:'1px solid var(--hair)',padding:'4px',textAlign:'left'}} />
                  </td>
                  <td>
                    <input type="number" step="0.01" dir="ltr" value={l.sell_price ?? ''} disabled={!canWrite}
                           onChange={(e)=>upd(l.id,{sell_price:Number(e.target.value||0)})}
                           style={{width:'100%',border:'1px solid var(--hair)',padding:'4px',textAlign:'left'}} />
                  </td>
                  <td>
                    <input type="number" step="0.01" dir="ltr" value={l.budget_cost ?? ''} disabled={!canWrite}
                           onChange={(e)=>upd(l.id,{budget_cost:Number(e.target.value||0)})}
                           style={{width:'100%',border:'1px solid var(--hair)',padding:'4px',textAlign:'left'}} />
                  </td>
                  <td className="num">{money(l.contract_value)}</td>
                  <td>
                    {(() => {
                      const bd = buds.find((x)=>x.project_item_id===l.id);
                      if (!bd) return null;
                      return (
                        <div style={{marginBottom:3}}>
                          <span className={`pill ${bd.over_budget ? 'bad' : 'ok'}`}
                                style={{fontSize:11}}>
                            هامش {(Number(bd.actual_margin||0)*100).toFixed(0)}٪
                          </span>
                        </div>
                      );
                    })()}
                    {(() => {
                      const list = execsOf(l.id);
                      const t = totOf(l.id);
                      const st = states.find((x)=>x.project_item_id===l.id);
                      if (!list.length) {
                        return (
                          <div>
                            <span className="pill bad" style={{fontSize:11.5}}>بلا إسناد</span>
                            {canWrite && (
                              <div style={{marginTop:4}}>
                                <button className="btn" style={{padding:'3px 9px',fontSize:11.5}}
                                        onClick={()=>openDecide(l, null)}>+ إسناد مقاول</button>
                              </div>
                            )}
                          </div>
                        );
                      }
                      const over = Number(t.budget_remaining || 0) < 0;
                      return (
                        <div className="exec-cell">
                          {list.map((a) => {
                            const c = cons.find((x)=>x.id===a.contractor_id);
                            const ended = !!a.end_date;
                            const active = !ended && !!a.start_date && (a.is_active !== false);
                            const S = ended ? 'done' : active ? 'active' : 'planned';
                            const SAR = { planned:'جاهز للبدء', active:'قيد التنفيذ', done:'منتهٍ' };
                            const SCLS = { planned:'warn', active:'ok', done:'' };
                            return (
                              <div key={a.id} style={{borderTop:'1px solid var(--hair)',padding:'5px 0',
                                                      opacity: ended ? 0.72 : 1}}>
                                <div className="rowsplit" style={{gap:4}}>
                                  <span className="pill" style={{fontSize:11}}>{MODE_AR[a.mode]}</span>
                                  <span className={`pill ${SCLS[S]}`} style={{fontSize:11}}>{SAR[S]}</span>
                                </div>
                                <div className="ec-line" style={{fontWeight:600}}>
                                  {c?.name_ar || 'بلا منفّذ'}
                                </div>
                                {a.agreed_rate ? (
                                  <div className="ec-line">{money(a.agreed_rate)} / {l.unit}</div>
                                ) : a.worker_daily ? (
                                  <div className="ec-line">
                                    عامل {money(a.worker_daily)} · صنايعي {money(a.tech_daily)}
                                  </div>
                                ) : null}
                                <div className="ec-line">
                                  {a.share_qty ? `حصة ${Number(a.share_qty).toLocaleString('en-US')} ${l.unit || ''}` : 'حصة مفتوحة'}
                                  {a.planned_cost ? ` · مخطط ${money(a.planned_cost)}` : ''}
                                </div>
                                {(a.start_date || a.end_date) && (
                                  <div className="ec-line" dir="ltr" style={{textAlign:'right'}}>
                                    {a.start_date || '—'} → {a.end_date || '…'}
                                  </div>
                                )}
                                {(() => {
                                  const ac = actOf(a.id);
                                  if (!Number(ac.days_worked || 0)) return null;
                                  return (
                                    <div className="ec-line" style={{color:'var(--maroon-dark)'}}>
                                      فعلياً {Number(ac.actual_output||0).toLocaleString('en-US')} {l.unit || ''}
                                      {' · '}{ac.days_worked} يوم
                                      {' · '}منصرف {money(ac.actual_cost||0)}
                                    </div>
                                  );
                                })()}
                                {ended && (
                                  <div className="ec-line">
                                    أُقفل على {Number(a.closing_qty||0).toLocaleString('en-US')} {l.unit || ''}
                                    {a.end_reason ? ` · ${END_AR[a.end_reason] || a.end_reason}` : ''}
                                  </div>
                                )}
                                {canWrite && !ended && (
                                  <div className="rowsplit" style={{gap:4,marginTop:3}}>
                                    {!a.start_date && (
                                      <button className="btn" style={{padding:'3px 9px',fontSize:11.5}}
                                              disabled={starting === a.id}
                                              onClick={()=>{ setAskStart({ ex:a, item:l });
                                                             setSDate(new Date().toISOString().slice(0,10)); }}>
                                        {starting === a.id ? 'جارٍ…' : 'ابدأ'}
                                      </button>
                                    )}
                                    <button className="btn ghost" style={{padding:'3px 9px',fontSize:11.5}}
                                            onClick={()=>openDecide(l, a)}>تعديل</button>
                                    <button className="btn ghost" style={{padding:'3px 9px',fontSize:11.5}}
                                            onClick={()=>openEnd(a, l)}>إنهاء</button>
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          <div style={{borderTop:'1px solid var(--hair)',marginTop:4,paddingTop:5,
                                       fontSize:11.5,color: over ? 'var(--bad)' : 'var(--ink-soft)'}}>
                            متبقٍ مخططاً {Number(t.qty_remaining || 0).toLocaleString('en-US')} {l.unit || ''}
                            {' · '}ميزانية متبقية {money(t.budget_remaining || 0)}
                          </div>
                          {Number(t.actual_cost || 0) > 0 && (
                            <div style={{fontSize:11.5,
                                         color: Number(t.budget_remaining_actual||0) < 0
                                                ? 'var(--bad)' : 'var(--ink-soft)'}}>
                              فعلياً {Number(t.actual_output||0).toLocaleString('en-US')} {l.unit || ''}
                              {' · '}منصرف {money(t.actual_cost || 0)}
                              {' · '}من الميزانية بقي {money(t.budget_remaining_actual || 0)}
                            </div>
                          )}
                          {canWrite && Number(t.qty_remaining || 0) > 0 && (
                            <div style={{marginTop:4}}>
                              <button className="btn" style={{padding:'3px 9px',fontSize:11.5}}
                                      onClick={()=>openDecide(l, null)}>+ إسناد مقاول</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    <div className="rowsplit">
                      {canWrite && (
                        <>
                          <button className="btn ghost" style={{padding:'3px 7px',fontSize:11.5}}
                                  onClick={()=>{setBudgetFor(l); setDecideFor(null);}}>ميزانية</button>
                          <button className="btn ghost" style={{padding:'3px 7px',fontSize:11.5}}
                                  onClick={()=>openDecide(l, null)}>+ إسناد</button>
                          {ex && !ex.end_date && (
                            <button className="btn ghost" style={{padding:'3px 7px',fontSize:11.5}}
                                    onClick={()=>delDecision(ex)}>إلغاء</button>
                          )}
                          <button className="btn" style={{padding:'3px 7px',fontSize:11.5}}
                                  title="إدراج بند بعده" onClick={()=>insertAfter(l.sort_order,'item')}>+</button>
                          <button className="btn ghost" style={{padding:'3px 7px',fontSize:11.5}}
                                  title="إدراج عنوان بعده" onClick={()=>insertAfter(l.sort_order,'title')}>+ع</button>
                          <button className="btn ghost" style={{padding:'3px 7px',fontSize:11.5}}
                                  onClick={()=>move(l.id,-1)}>▲</button>
                          <button className="btn ghost" style={{padding:'3px 7px',fontSize:11.5}}
                                  onClick={()=>move(l.id,1)}>▼</button>
                          <button className="btn ghost" style={{padding:'3px 7px',fontSize:11.5,
                                          borderColor:'#EBC3C0',color:'#A32B24'}}
                                  onClick={()=>del(l.id)}>حذف</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length > 0 && canWrite && (
              <tr className="addrow">
                <td colSpan={9}>
                  <div className="rowsplit">
                    <button className="btn" style={{padding:'5px 12px',fontSize:13}}
                            onClick={()=>addLine('item')}>+ بند جديد</button>
                    <button className="btn ghost" style={{padding:'5px 12px',fontSize:13}}
                            onClick={()=>addLine('title')}>+ عنوان قسم</button>
                    <span className="spacer" />
                    <span style={{fontSize:12,color:'var(--ink-soft)'}}>يُضاف في نهاية الجدول</span>
                  </div>
                </td>
              </tr>
            )}
            {items.length === 0 && (
              <tr><td colSpan={9}>
                <div className="empty"><h3>لا بنود</h3>
                  <p>أضف بنوداً، أو حوّل عرض سعر مقبول إلى مشروع فتُنسخ بنوده تلقائياً.</p></div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {askStart && (
        <div className="section" style={{borderColor:'var(--maroon)'}}>
          <header><h2>بدء إسناد: {askStart.item?.description_ar}</h2></header>
          <div style={{padding:18}}>
            <div className="field" style={{maxWidth:280}}>
              <label>تاريخ بدء التنفيذ الفعلي *</label>
              <input type="date" dir="ltr" value={sDate}
                     onChange={(e)=>setSDate(e.target.value)} />
              <span className="hint">منه تُحتسب يوميات هذا المنفّذ</span>
            </div>
            <div className="rowsplit">
              <button className="btn" disabled={starting === askStart.ex?.id}
                      onClick={()=>startExec(askStart.ex, sDate)}>
                {starting === askStart.ex?.id ? 'جارٍ…' : 'ابدأ التنفيذ'}
              </button>
              <button className="btn ghost" onClick={()=>setAskStart(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {endFor && (
        <div className="section" style={{borderColor:'var(--maroon)'}}>
          <header><h2>إنهاء إسناد: {cons.find((c)=>c.id===endFor.ex.contractor_id)?.name_ar || 'منفّذ'}</h2></header>
          <form onSubmit={submitEnd} style={{padding:18}}>
            <div className="form-grid">
              <div className="field">
                <label>تاريخ الإنهاء *</label>
                <input type="date" dir="ltr" required value={endF.date || ''}
                       onChange={(e)=>setEndF({...endF, date:e.target.value})} />
                <span className="hint">لا يُحتسب لهذا المنفّذ عمل بعد هذا التاريخ</span>
              </div>
              <div className="field">
                <label>سبب الإنهاء *</label>
                <select value={endF.reason || 'completed'}
                        onChange={(e)=>setEndF({...endF, reason:e.target.value})}>
                  {Object.entries(END_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field">
                <label>الكمية المنفَّذة حتى التاريخ *</label>
                <input type="number" step="any" dir="ltr" required value={endF.qty ?? ''}
                       onChange={(e)=>setEndF({...endF, qty:e.target.value})} />
                <span className="hint">
                  الرقم الموقَّع في المحضر — يُقفل ولا يُعدَّل، ومنه تُحسب الكمية المتبقية
                </span>
              </div>
              <div className="field span2">
                <label>ملاحظات (عيوب، أعمال ناقصة، اتفاقات)</label>
                <input value={endF.notes || ''}
                       onChange={(e)=>setEndF({...endF, notes:e.target.value})} />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" type="submit">إنهاء وإقفال</button>
              <button className="btn ghost" type="button" onClick={()=>setEndFor(null)}>إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {budgetFor && (
        <ItemBudget key={budgetFor.id}
                    item={items.find((x)=>x.id===budgetFor.id) || budgetFor} canWrite={canWrite}
                    onClose={()=>{ setBudgetFor(null); refreshCalc(); }}
                    onSaved={()=>{ refreshCalc(); onChange?.(); }} />
      )}

      {decideFor && (
        <div className="section">
          <header><h2>
            {editExec ? 'تعديل إسناد' : 'إسناد منفّذ'}: {decideFor.description_ar || 'بند'}
          </h2></header>
          <form onSubmit={saveDecision} style={{padding:18}}>
            <div className="form-grid">
              <div className="field">
                <label>طريقة التنفيذ *</label>
                <select value={d.mode} onChange={(e)=>setD({...d, mode:e.target.value})}>
                  {Object.entries(MODE_AR).map(([k,v])=><option key={k} value={v ? k : k}>{v}</option>)}
                </select>
              </div>
              <div className="field span2">
                <label>المنفّذ</label>
                <select value={d.contractor_id || ''}
                        onChange={(e)=>{
                          const c = cons.find((x)=>x.id===e.target.value);
                          setD({...d, contractor_id:e.target.value,
                                worker_daily: d.worker_daily || c?.worker_daily || '',
                                tech_daily: d.tech_daily || c?.tech_daily || ''});
                        }}>
                  <option value="">—</option>
                  {cons.map((c)=><option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </select>
              </div>

              {['piecework','sublet'].includes(d.mode) && (
                <div className="field">
                  <label>السعر المتفق عليه للوحدة</label>
                  <input type="number" step="0.01" dir="ltr" value={d.agreed_rate ?? ''}
                         onChange={(e)=>setD({...d, agreed_rate:e.target.value})} />
                  <span className="hint">فئة البيع {money(decideFor.sell_price)} — الفرق هو ربحك</span>
                </div>
              )}

              {d.mode === 'daywork' && (
                <>
                  <div className="field">
                    <label>يومية العامل</label>
                    <input type="number" step="0.01" dir="ltr" value={d.worker_daily ?? ''}
                           onChange={(e)=>setD({...d, worker_daily:e.target.value})} />
                  </div>
                  <div className="field">
                    <label>يومية الصنايعي</label>
                    <input type="number" step="0.01" dir="ltr" value={d.tech_daily ?? ''}
                           onChange={(e)=>setD({...d, tech_daily:e.target.value})} />
                  </div>
                  <div className="field">
                    <label>متوسط الإنتاج المطلوب للفرد يومياً</label>
                    <input type="number" step="any" dir="ltr" value={d.target_output ?? ''}
                           onChange={(e)=>setD({...d, target_output:e.target.value})} />
                  </div>
                  <div className="field">
                    <label>الخصم عند عدم التحقيق</label>
                    <input type="number" step="0.01" dir="ltr" value={d.shortfall_deduction ?? ''}
                           onChange={(e)=>setD({...d, shortfall_deduction:e.target.value})} />
                  </div>
                </>
              )}

              <div className="field">
                <label>حصته من الكمية</label>
                <input type="number" step="any" dir="ltr" value={d.share_qty ?? ''}
                       onChange={(e)=>setD({...d, share_qty:e.target.value})} />
                <span className="hint">
                  المتبقي من البند {Number(totOf(decideFor.id).qty_remaining || 0).toLocaleString('en-US')}
                  {' '}{decideFor.unit || ''} — اتركها فارغة لحصة مفتوحة
                </span>
              </div>
              <div className="field">
                <label>تاريخ بدء عمله</label>
                <input type="date" dir="ltr" value={d.start_date || ''}
                       onChange={(e)=>setD({...d, start_date:e.target.value})} />
              </div>
              <div className="field">
                <label>التكلفة الكلية المخططة</label>
                <input type="number" step="0.01" dir="ltr" value={d.planned_cost ?? ''}
                       onChange={(e)=>setD({...d, planned_cost:e.target.value})} />
                <span className="hint">
                  ميزانية البند {money(decideFor.budget_value)} · المتبقي منها
                  {' '}{money(totOf(decideFor.id).budget_remaining || 0)}
                </span>
              </div>
              <div className="field span2">
                <label>ملاحظات</label>
                <input value={d.notes || ''} onChange={(e)=>setD({...d, notes:e.target.value})} />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" type="submit">
                {editExec ? 'حفظ التعديل' : 'حفظ الإسناد'}
              </button>
              <button className="btn ghost" type="button"
                      onClick={()=>{ setDecideFor(null); setEditExec(null); }}>إلغاء</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
