'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { money, qty as fq } from '@/lib/format';

const KIND_AR = {
  material:'مواد', labor:'أجور', equipment:'معدات', transport:'ترحيل',
  custody:'عهدة', supervision:'إشراف', contingency:'طوارئ', other:'أخرى',
};

export default function ItemBudget({ item, canWrite, onClose, onSaved }) {
  const [b, setB] = useState(null);
  const [lines, setLines] = useState([]);
  const [crew, setCrew] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const flash = (m) => { setMsg(m); setTimeout(()=>setMsg(''), 1300); };

  const load = useCallback(async () => {
    let { data: bud } = await supabase.from('item_budgets')
      .select('*').eq('project_item_id', item.id).maybeSingle();

    if (!bud) {
      const ins = await supabase.from('item_budgets').insert({
        project_item_id: item.id, target_mode: 'per_unit',
      }).select('*').single();
      if (ins.error) { setErr('تعذّر إنشاء الميزانية: ' + ins.error.message); return; }
      bud = ins.data;
    }

    const [v, l] = await Promise.all([
      supabase.from('v_item_budget').select('*').eq('budget_id', bud.id).maybeSingle(),
      supabase.from('budget_lines').select('*').eq('budget_id', bud.id).order('sort_order'),
    ]);
    setB({ ...bud, ...(v.data || {}) });
    setLines(l.data || []);
    onSaved?.();
  }, [item.id]);

  useEffect(() => { load(); }, [load]);

  async function patch(fields) {
    setB({ ...b, ...fields });
    const { error } = await supabase.from('item_budgets').update(fields).eq('id', b.id);
    if (error) setErr(error.message); else load();
  }

  async function addLine(kind) {
    const order = (lines.length ? Math.max(...lines.map((l)=>l.sort_order)) : 0) + 1;
    const base = { budget_id: b.id, sort_order: order, kind, label: KIND_AR[kind], amount: 0 };
    if (kind === 'labor') {
      Object.assign(base, { worker_daily: 130, tech_daily: 180, workers_count: 0, techs_count: 0,
                            lock_side: 'techs' });
    }
    const { error } = await supabase.from('budget_lines').insert(base);
    if (error) setErr(error.message); else load();
  }

  async function updLine(id, fields) {
    setLines(lines.map((l)=>l.id===id ? {...l, ...fields} : l));
    const { error } = await supabase.from('budget_lines').update(fields).eq('id', id);
    if (error) setErr(error.message); else load();
  }

  async function delLine(id) {
    await supabase.from('budget_lines').delete().eq('id', id);
    load();
  }

  async function askCrew(lineId, lock) {
    const { data, error } = await supabase.rpc('suggest_crew', {
      p_budget: b.id, p_labor_line: lineId, p_lock: lock,
    });
    if (error) { setErr(error.message); return; }
    setCrew({ ...crew, [lineId]: data });
  }

  if (err && !b) return <div className="msg err">{err}</div>;
  if (!b) return <div className="empty">جارٍ التحميل…</div>;

  const revenue = Number(b.revenue || 0);
  const profit = Number(b.target_profit || 0);
  const budget = Number(b.spend_budget || 0);
  const allocated = Number(b.allocated || 0);
  const remaining = Number(b.remaining || 0);
  const over = !!b.over_budget;

  const lineAmount = (l) => l.as_percent != null
    ? Math.round(revenue * Number(l.as_percent) * 100) / 100
    : Number(l.amount || 0);

  return (
    <div className="section budget-panel">
      <header>
        <h2>ميزانية: {item.description_ar || 'بند'}</h2>
        {onClose && (
          <button className="btn ghost" style={{padding:'4px 10px',fontSize:12.5}}
                  onClick={onClose}>إغلاق</button>
        )}
      </header>

      {err && <div className="msg err" style={{margin:'12px 18px'}}>{err}</div>}
      {msg && <div className="msg ok" style={{margin:'12px 18px'}}>{msg}</div>}

      {/* ---------- الشريط المالي ---------- */}
      <div className="bud-bar">
        <div className="bud-cell">
          <span className="bk">الإيراد</span>
          <span className="bv">{money(revenue)}</span>
          <span className="bs">{fq(b.contract_qty)} {b.unit} × {money(b.sell_price)}</span>
        </div>
        <div className="bud-cell">
          <span className="bk">الربح المستهدف</span>
          <span className="bv ok">{money(profit)}</span>
          <span className="bs">{(Number(b.target_margin||0)*100).toFixed(1)}٪ من الإيراد</span>
        </div>
        <div className="bud-cell">
          <span className="bk">ميزانية الصرف</span>
          <span className="bv">{money(budget)}</span>
          <span className="bs">حتى {money(b.max_unit_cost)} لكل {b.unit}</span>
        </div>
        <div className="bud-cell">
          <span className="bk">الموزَّع</span>
          <span className="bv">{money(allocated)}</span>
          <span className="bs">{lines.length} بند صرف</span>
        </div>
        <div className={`bud-cell ${over ? 'over' : 'left'}`}>
          <span className="bk">{over ? 'التجاوز' : 'المتبقي'}</span>
          <span className="bv">{money(Math.abs(remaining))}</span>
          <span className="bs">
            الهامش الفعلي {(Number(b.actual_margin||0)*100).toFixed(1)}٪
          </span>
        </div>
      </div>

      {over && (
        <div className="msg err" style={{margin:'0 18px 12px'}}>
          تجاوزت ميزانية الصرف بـ{money(Math.abs(remaining))} — الهامش الفعلي
          {' '}{(Number(b.actual_margin||0)*100).toFixed(1)}٪ بدل {(Number(b.target_margin||0)*100).toFixed(1)}٪.
          يمكنك الحفظ، لكن راجع الأرقام.
        </div>
      )}

      {/* ---------- الربح المستهدف والمدة ---------- */}
      <div style={{padding:'0 18px 12px'}}>
        <div className="form-grid">
          <div className="field">
            <label>طريقة تحديد الربح</label>
            <select value={b.target_mode} disabled={!canWrite}
                    onChange={(e)=>patch({target_mode:e.target.value})}>
              <option value="per_unit">ريال لكل وحدة</option>
              <option value="percent">نسبة مئوية</option>
              <option value="lump">مبلغ إجمالي</option>
            </select>
          </div>

          {b.target_mode === 'per_unit' && (
            <div className="field">
              <label>الربح لكل {b.unit || 'وحدة'}</label>
              <input type="number" step="0.01" dir="ltr" disabled={!canWrite}
                     defaultValue={b.target_per_unit ?? ''}
                     onBlur={(e)=>patch({target_per_unit: e.target.value === '' ? null : Number(e.target.value)})} />
              <span className="hint">
                من فئة بيع {money(b.sell_price)} — يبقى {money(b.max_unit_cost)} للتكلفة
              </span>
            </div>
          )}
          {b.target_mode === 'percent' && (
            <div className="field">
              <label>نسبة الربح</label>
              <input type="number" step="0.01" min="0" max="1" dir="ltr" disabled={!canWrite}
                     defaultValue={b.target_percent ?? ''}
                     onBlur={(e)=>patch({target_percent: e.target.value === '' ? null : Number(e.target.value)})} />
              <span className="hint">0.25 تعني ٢٥٪</span>
            </div>
          )}
          {b.target_mode === 'lump' && (
            <div className="field">
              <label>الربح الإجمالي</label>
              <input type="number" step="0.01" dir="ltr" disabled={!canWrite}
                     defaultValue={b.target_lump ?? ''}
                     onBlur={(e)=>patch({target_lump: e.target.value === '' ? null : Number(e.target.value)})} />
            </div>
          )}

          <div className="field">
            <label>مدة التنفيذ (أيام عمل)</label>
            <input type="number" dir="ltr" disabled={!canWrite}
                   defaultValue={b.work_days ?? ''}
                   onBlur={(e)=>patch({work_days: e.target.value === '' ? null : Number(e.target.value),
                                       daily_output: null})} />
            {b.eff_daily_output && (
              <span className="hint">
                يعني إنتاج {fq(b.eff_daily_output)} {b.unit} يومياً
              </span>
            )}
          </div>
          <div className="field">
            <label>الإنتاج اليومي المتوقع</label>
            <input type="number" step="any" dir="ltr" disabled={!canWrite}
                   defaultValue={b.daily_output ?? ''}
                   onBlur={(e)=>patch({daily_output: e.target.value === '' ? null : Number(e.target.value),
                                       work_days: null})} />
            {b.eff_work_days && (
              <span className="hint">يعني {b.eff_work_days} يوم عمل</span>
            )}
          </div>
        </div>
      </div>

      {/* ---------- بنود الصرف ---------- */}
      {canWrite && (
        <div className="rowsplit" style={{padding:'0 18px 12px',flexWrap:'wrap'}}>
          {Object.entries(KIND_AR).map(([k,v])=>(
            <button key={k} className="btn ghost" style={{padding:'5px 11px',fontSize:12.5}}
                    onClick={()=>addLine(k)}>+ {v}</button>
          ))}
        </div>
      )}

      {lines.length === 0 ? (
        <div className="empty">
          <h3>لا بنود صرف</h3>
          <p>أضف بنداً من الأزرار أعلاه — ميزانية الصرف {money(budget)}.</p>
        </div>
      ) : (
        <div style={{overflowX:'auto'}}>
          <table>
            <thead>
              <tr><th style={{width:150}}>البند</th><th style={{width:90}}>النوع</th>
                  <th style={{width:120}} className="num">المبلغ</th>
                  <th style={{width:100}} className="num">نسبة</th>
                  <th>تفصيل</th>
                  {canWrite && <th style={{width:60}}>—</th>}</tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const c = crew[l.id];
                return (
                  <tr key={l.id}>
                    <td>
                      <input value={l.label} disabled={!canWrite}
                             onChange={(e)=>setLines(lines.map((x)=>x.id===l.id?{...x,label:e.target.value}:x))}
                             onBlur={(e)=>updLine(l.id,{label:e.target.value})}
                             style={{width:'100%',border:'1px solid var(--hair)',
                                     padding:'4px 6px',fontFamily:'inherit',fontSize:13.5}} />
                    </td>
                    <td style={{fontSize:12.5}}>{KIND_AR[l.kind]}</td>
                    <td className="num">
                      {l.kind === 'labor' ? (
                        <span className="mono">{money(lineAmount(l))}</span>
                      ) : (
                        <input type="number" step="0.01" dir="ltr" disabled={!canWrite || l.as_percent != null}
                               defaultValue={l.amount ?? 0}
                               onBlur={(e)=>updLine(l.id,{amount:Number(e.target.value||0), as_percent:null})}
                               style={{width:'100%',border:'1px solid var(--hair)',
                                       padding:'4px',textAlign:'left'}} />
                      )}
                    </td>
                    <td className="num">
                      {l.kind === 'labor' ? '—' : (
                        <input type="number" step="0.01" min="0" max="1" dir="ltr" disabled={!canWrite}
                               defaultValue={l.as_percent ?? ''}
                               placeholder="0.05"
                               onBlur={(e)=>updLine(l.id,{as_percent: e.target.value === '' ? null : Number(e.target.value)})}
                               style={{width:'100%',border:'1px solid var(--hair)',
                                       padding:'4px',textAlign:'left'}} />
                      )}
                    </td>
                    <td>
                      {l.kind === 'labor' ? (
                        <div className="crew">
                          <div className="crew-row">
                            <label>صنايعية</label>
                            <input type="number" min="0" dir="ltr" disabled={!canWrite}
                                   defaultValue={l.techs_count ?? 0}
                                   onBlur={(e)=>updLine(l.id,{techs_count:Number(e.target.value||0)})} />
                            <span className="x">×</span>
                            <input type="number" step="0.01" dir="ltr" disabled={!canWrite}
                                   defaultValue={l.tech_daily ?? 180}
                                   onBlur={(e)=>updLine(l.id,{tech_daily:Number(e.target.value||0)})} />
                            {canWrite && (
                              <button className="btn ghost" onClick={()=>askCrew(l.id,'techs')}>
                                ثبّتهم واقترح العمال
                              </button>
                            )}
                          </div>
                          <div className="crew-row">
                            <label>عمال</label>
                            <input type="number" min="0" dir="ltr" disabled={!canWrite}
                                   defaultValue={l.workers_count ?? 0}
                                   onBlur={(e)=>updLine(l.id,{workers_count:Number(e.target.value||0)})} />
                            <span className="x">×</span>
                            <input type="number" step="0.01" dir="ltr" disabled={!canWrite}
                                   defaultValue={l.worker_daily ?? 130}
                                   onBlur={(e)=>updLine(l.id,{worker_daily:Number(e.target.value||0)})} />
                            {canWrite && (
                              <button className="btn ghost" onClick={()=>askCrew(l.id,'workers')}>
                                ثبّتهم واقترح الصنايعية
                              </button>
                            )}
                          </div>

                          {c && !c.error && (
                            <div className={`crew-hint ${c.over ? 'bad' : ''}`}>
                              {c.over ? (
                                <>المثبَّت وحده يكلّف {money(c.locked_cost)} ويتجاوز
                                  {' '}{money(c.labor_pool)} المتاحة للأجور</>
                              ) : (
                                <>بالمتبقي {money(c.left_for_other)} على {c.work_days} يوم:
                                  {' '}<b>{c.suggested_count}</b>
                                  {' '}{c.locked_side === 'techs' ? 'عامل' : 'صنايعي'}
                                  {canWrite && (
                                    <button className="apply"
                                            onClick={()=>updLine(l.id, c.locked_side === 'techs'
                                              ? {workers_count:c.suggested_count}
                                              : {techs_count:c.suggested_count})}>
                                      تطبيق
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                          {c?.error && <div className="crew-hint bad">{c.error}</div>}
                          {b.eff_work_days && (
                            <div className="crew-hint">
                              على {b.eff_work_days} يوم — التكلفة الحالية
                              {' '}{money(lineAmount(l))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <input value={l.notes || ''} disabled={!canWrite}
                               placeholder="ملاحظة"
                               onBlur={(e)=>updLine(l.id,{notes:e.target.value})}
                               style={{width:'100%',border:'1px solid var(--hair)',
                                       padding:'4px 6px',fontSize:13}} />
                      )}
                    </td>
                    {canWrite && (
                      <td>
                        <button className="btn ghost" style={{padding:'3px 8px',fontSize:12,
                                        borderColor:'#EBC3C0',color:'#A32B24'}}
                                onClick={()=>delLine(l.id)}>حذف</button>
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="bud-total">
                <td colSpan={2}>الإجمالي الموزَّع</td>
                <td className="num">{money(allocated)}</td>
                <td colSpan={canWrite ? 3 : 2} className="num">
                  {over
                    ? <span style={{color:'var(--bad)'}}>تجاوز {money(Math.abs(remaining))}</span>
                    : <span style={{color:'var(--ok)'}}>متبقٍ {money(remaining)}</span>}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
