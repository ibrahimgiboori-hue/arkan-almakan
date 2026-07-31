'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { MODE_AR } from '@/lib/projects';

export default function ProjScope({ projectId, canWrite, onChange }) {
  const [items, setItems] = useState(null);
  const [execs, setExecs] = useState([]);
  const [cons, setCons] = useState([]);
  const [decideFor, setDecideFor] = useState(null);
  const [d, setD] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const [i, e, c] = await Promise.all([
      supabase.from('project_items').select('*').eq('project_id', projectId).order('sort_order'),
      supabase.from('item_execution').select('*'),
      supabase.from('contractors').select('id, name_ar, worker_daily, tech_daily')
        .eq('is_active', true).order('name_ar'),
    ]);
    setItems(i.data || []); setExecs(e.data || []); setCons(c.data || []);
    onChange?.();
  }

  useEffect(() => { load(); }, [projectId]);

  const execOf = (id) => execs.find((x) => x.project_item_id === id);

  async function addLine(kind) {
    const order = (items.length ? Math.max(...items.map((l)=>l.sort_order)) : 0) + 1;
    const { error } = await supabase.from('project_items').insert({
      project_id: projectId, sort_order: order, kind,
      description_ar: kind === 'title' ? 'عنوان قسم' : '',
      unit: kind === 'item' ? 'م2' : null, contract_qty: 1, sell_price: 0, budget_cost: 0,
    });
    if (error) setErr('تعذّر الإضافة: ' + error.message); else load();
  }

  async function insertAfter(afterOrder, kind) {
    const { error } = await supabase.rpc('project_item_insert_after', {
      p_project: projectId, p_after_order: afterOrder, p_kind: kind,
    });
    if (error) setErr('تعذّر الإدراج: ' + error.message); else load();
  }

  async function upd(id, fields) {
    setItems(items.map((x) => x.id === id ? { ...x, ...fields } : x));
    const { error } = await supabase.from('project_items').update(fields).eq('id', id);
    if (error) setErr('تعذّر الحفظ: ' + error.message); else onChange?.();
  }

  async function del(id) {
    if (!window.confirm('حذف هذا البند وقراره وإنجازه؟')) return;
    const { error } = await supabase.from('project_items').delete().eq('id', id);
    if (error) setErr('تعذّر الحذف: ' + error.message); else load();
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

  function openDecide(item) {
    const ex = execOf(item.id);
    setDecideFor(item);
    setD(ex ? { ...ex } : {
      mode: 'piecework', contractor_id: '', agreed_rate: '', worker_daily: '',
      tech_daily: '', target_output: '', shortfall_deduction: '', planned_cost: '', notes: '',
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
      notes: d.notes || null,
    };
    const ex = execOf(decideFor.id);
    const res = ex
      ? await supabase.from('item_execution').update(payload).eq('id', ex.id)
      : await supabase.from('item_execution').insert(payload);
    if (res.error) { setErr('تعذّر الحفظ: ' + res.error.message); return; }
    setMsg('سُجّل قرار التنفيذ'); setDecideFor(null); load();
  }

  async function delDecision(item) {
    const ex = execOf(item.id);
    if (!ex || !window.confirm('حذف قرار التنفيذ لهذا البند؟')) return;
    await supabase.from('item_execution').delete().eq('id', ex.id);
    load();
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
          {noDecision} بنداً بلا قرار تنفيذ — لا يبدأ التنفيذ قبل تسجيل القرار
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
              <th style={{width:190}}>قرار التنفيذ</th>
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
                    {ex ? (
                      <div>
                        <span className="pill ok" style={{fontSize:11.5}}>{MODE_AR[ex.mode]}</span>
                        {ex.agreed_rate && (
                          <div style={{fontSize:11.5,color:'var(--ink-soft)',marginTop:2}}>
                            {money(ex.agreed_rate)} / {l.unit}
                          </div>
                        )}
                        {ex.planned_cost && (
                          <div style={{fontSize:11.5,color: Number(ex.planned_cost) > Number(l.budget_value)
                                        ? 'var(--bad)' : 'var(--ink-soft)'}}>
                            مخطط {money(ex.planned_cost)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="pill bad" style={{fontSize:11.5}}>بلا قرار</span>
                    )}
                  </td>
                  <td>
                    <div className="rowsplit">
                      {canWrite && (
                        <>
                          <button className="btn ghost" style={{padding:'3px 7px',fontSize:11.5}}
                                  onClick={()=>openDecide(l)}>{ex ? 'تعديل القرار' : 'قرار'}</button>
                          {ex && (
                            <button className="btn ghost" style={{padding:'3px 7px',fontSize:11.5}}
                                    onClick={()=>delDecision(l)}>إلغاء</button>
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

      {decideFor && (
        <div className="section">
          <header><h2>قرار تنفيذ: {decideFor.description_ar || 'بند'}</h2></header>
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
                <label>التكلفة الكلية المخططة</label>
                <input type="number" step="0.01" dir="ltr" value={d.planned_cost ?? ''}
                       onChange={(e)=>setD({...d, planned_cost:e.target.value})} />
                <span className="hint">ميزانية البند {money(decideFor.budget_value)}</span>
              </div>
              <div className="field span2">
                <label>ملاحظات</label>
                <input value={d.notes || ''} onChange={(e)=>setD({...d, notes:e.target.value})} />
              </div>
            </div>
            <div className="rowsplit">
              <button className="btn" type="submit">حفظ القرار</button>
              <button className="btn ghost" type="button" onClick={()=>setDecideFor(null)}>إلغاء</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
