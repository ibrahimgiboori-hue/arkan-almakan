'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import { useLiveRefresh, notifyChange } from '@/lib/live';
import ProjScope from '@/components/ProjScope';
import ProjProgress from '@/components/ProjProgress';
import ProjClaims from '@/components/ProjClaims';
import ProjMoney from '@/components/ProjMoney';
import ProjDocs from '@/components/ProjDocs';
import ProjExecution from '@/components/ProjExecution';

const TABS = [
  ['overview','نظرة عامة'],
  ['scope','النطاق والقرارات'],
  ['exec','التنفيذ'],
  ['progress','الإنجاز'],
  ['claims','المستخلصات'],
  ['money','العهد والضمانات'],
  ['docs','المستندات والمواد'],
  ['settings','بيانات المشروع'],
];

export default function ProjectCard() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [fin, setFin] = useState(null);
  const [emps, setEmps] = useState([]);
  const [ents, setEnts] = useState([]);
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState('overview');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const loadFin = useCallback(async () => {
    const { data } = await supabase.from('v_project_financials')
      .select('*').eq('project_id', id).maybeSingle();
    setFin(data || null);
  }, [id]);

  const load = useCallback(async () => {
    const sess = (await supabase.auth.getSession()).data.session;
    const [pr, e, en, u] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).maybeSingle(),
      supabase.from('employees').select('id, full_name_ar, employee_no').order('employee_no'),
      supabase.from('entities').select('id, name_ar').order('name_ar'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    if (!pr.data) { setErr('لم يُعثر على هذا المشروع.'); return; }
    setP(pr.data); setEmps(e.data || []); setEnts(en.data || []); setRole(u.data?.role || null);
    loadFin();
  }, [id, loadFin]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(loadFin, ['all']);

  async function patch(fields) {
    setP({ ...p, ...fields });
    const { error } = await supabase.from('projects').update(fields).eq('id', id);
    if (error) setErr('تعذّر الحفظ: ' + error.message);
    else { setMsg('حُفظ'); setTimeout(()=>setMsg(''), 1200); loadFin(); notifyChange('project'); }
  }

  if (err && !p) return <div className="msg err">{err}</div>;
  if (!p) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant'].includes(role);
  const f = fin || {};
  const profit = Number(f.current_profit || 0);
  const daysLeft = f.days_remaining;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{p.name_ar}</h1>
          <p>
            <span className="mono">{p.project_no}</span>
            {' — '}{STAGE_AR[p.stage]}{' · '}{SCOPE_AR[p.supply_scope]}
            {p.city ? ` · ${p.city}` : ''}
          </p>
        </div>
        <Link className="btn ghost" href="/dashboard/projects">كل المشاريع</Link>
      </div>

      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      {Number(f.items_without_decision || 0) > 0 && (
        <div className="msg err" style={{marginBottom:14}}>
          {f.items_without_decision} بنداً بلا قرار تنفيذ — سجّل القرار من تبويب «النطاق والقرارات»
        </div>
      )}
      {Number(f.unclassified_spend || 0) > 0 && (
        <div className="msg err" style={{marginBottom:14}}>
          {f.unclassified_spend} حركة صرف بلا تصنيف — الربح غير دقيق حتى تصنّفها
        </div>
      )}

      <div className="tabs">
        {TABS.map(([k,label]) => (
          <button key={k} className={tab===k?'on':''}
                  onClick={()=>{ setTab(k); loadFin(); }}>{label}</button>
        ))}
      </div>

      {/* ============ نظرة عامة ============ */}
      {tab === 'overview' && (
        <>
          <div className="grid k4" style={{marginBottom:18}}>
            <div className="card">
              <h3>الربح الحالي</h3>
              <div className="big" style={{color: profit < 0 ? 'var(--bad)' : 'var(--maroon-dark)'}}>
                {money(profit)}
              </div>
              <div className="foot">القيمة المكتسبة − ما تتحمله أركان</div>
            </div>
            <div className="card">
              <h3>المحصَّل</h3>
              <div className="big">{money(f.collected || 0)}</div>
              <div className="foot">لم يُحصَّل بعد {money(f.pending_collection || 0)}</div>
            </div>
            <div className="card">
              <h3>رصيد العهد</h3>
              <div className="big">{money(f.custody_balance || 0)}</div>
              <div className="foot">منصرف {money(f.custody_spent || 0)}</div>
            </div>
            <div className="card">
              <h3>الإنجاز</h3>
              <div className="big">{Number(f.computed_progress_pct || 0).toFixed(0)}%</div>
              <div className="foot">
                {daysLeft === null || daysLeft === undefined ? 'بلا مدة محددة'
                  : daysLeft < 0 ? `تجاوز المدة بـ${Math.abs(daysLeft)} يوم`
                  : `${daysLeft} يوماً متبقياً`}
              </div>
            </div>
          </div>

          <div className="grid k2">
            <div className="section" style={{marginTop:0}}>
              <header><h2>الإيرادات</h2></header>
              <table>
                <tbody>
                  {[['قيمة العقد', p.contract_value],
                    ['القيمة المكتسبة من الإنجاز', f.earned_value],
                    ['إجمالي المستخلصات', f.claimed_gross],
                    ['المحصَّل', f.collected],
                    ['مستحق لم يُحصَّل', f.pending_collection],
                    ['محتجزات لدى المالك', f.retention_held],
                    ['مطالبات على المالك من العهد', f.charged_to_owner],
                    ['منها لم يُسترد', f.owner_recovery_pending],
                  ].map(([k,v]) => (
                    <tr key={k}>
                      <td style={{color:'var(--ink-soft)'}}>{k}</td>
                      <td className="num">{money(v || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="section" style={{marginTop:0}}>
              <header><h2>التكاليف</h2></header>
              <table>
                <tbody>
                  {[['الميزانية المخططة للبنود', f.budget_total],
                    ['تكلفة المواد', f.material_cost],
                    ['منصرف العهد على أركان', f.custody_cost_arkan],
                    ['خصومات على المقاولين', f.charged_to_contractor],
                    ['إجمالي ما تتحمله أركان', f.direct_cost_known],
                  ].map(([k,v]) => (
                    <tr key={k}>
                      <td style={{color:'var(--ink-soft)'}}>{k}</td>
                      <td className="num">{money(v || 0)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{fontWeight:600,color:'var(--maroon-dark)'}}>الربح الحالي</td>
                    <td className="num" style={{fontWeight:700,
                        color: profit < 0 ? 'var(--bad)' : 'var(--ok)'}}>{money(profit)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{padding:'12px 18px',fontSize:12.5,color:'var(--ink-soft)'}}>
                لا يشمل مستحقات المقاولين واليوميات — تُضاف عند بناء التايم شيت
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'scope' && (
        <ProjScope projectId={id} canWrite={canWrite} onChange={load} />
      )}
      {tab === 'exec' && (
        <ProjExecution projectId={id} canWrite={canWrite} onChange={load} />
      )}
      {tab === 'progress' && (
        <ProjProgress projectId={id} canWrite={canWrite} onChange={loadFin} />
      )}
      {tab === 'claims' && (
        <ProjClaims project={p} canWrite={canWrite} onChange={loadFin} />
      )}
      {tab === 'money' && (
        <ProjMoney project={p} canWrite={canWrite} onChange={loadFin} />
      )}
      {tab === 'docs' && (
        <ProjDocs project={p} canWrite={canWrite} />
      )}

      {/* ============ بيانات المشروع ============ */}
      {tab === 'settings' && (
        <div className="section" style={{marginTop:0,padding:18}}>
          <fieldset style={{borderTop:'none',paddingTop:0}}>
            <legend>التعريف</legend>
            <div className="form-grid">
              <div className="field span2">
                <label>اسم المشروع *</label>
                <input value={p.name_ar || ''} onChange={(e)=>setP({...p,name_ar:e.target.value})}
                       onBlur={(e)=>patch({name_ar:e.target.value})} />
              </div>
              <div className="field">
                <label>المدينة</label>
                <input value={p.city || ''} onChange={(e)=>setP({...p,city:e.target.value})}
                       onBlur={(e)=>patch({city:e.target.value})} />
              </div>
              <div className="field span2">
                <label>الموقع / العنوان</label>
                <input value={p.site_address || ''} onChange={(e)=>setP({...p,site_address:e.target.value})}
                       onBlur={(e)=>patch({site_address:e.target.value})} />
              </div>
              <div className="field">
                <label>المرحلة</label>
                <select value={p.stage} onChange={(e)=>patch({stage:e.target.value})}>
                  {Object.entries(STAGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field">
                <label>نطاق التوريد</label>
                <select value={p.supply_scope} onChange={(e)=>patch({supply_scope:e.target.value})}>
                  {Object.entries(SCOPE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="field">
                <label>مصدر المشروع</label>
                <select value={p.source_kind || ''} onChange={(e)=>patch({source_kind:e.target.value})}>
                  <option value="">—</option>
                  {['من المالك مباشرة','عطاء أو مناقصة','باطن من شركة أخرى','أسندناه بالباطن']
                    .map((x)=><option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div className="field">
                <label>صفة أركان</label>
                <select value={p.our_role || ''} onChange={(e)=>patch({our_role:e.target.value})}>
                  <option value="">—</option>
                  <option value="طرف أول (مالك العمل)">طرف أول (مالك العمل)</option>
                  <option value="طرف ثاني (منفذ)">طرف ثاني (منفذ)</option>
                </select>
              </div>
              <div className="field span2">
                <label>الجهة</label>
                <select value={p.entity_id || ''} onChange={(e)=>patch({entity_id:e.target.value || null})}>
                  <option value="">—</option>
                  {ents.map((x)=><option key={x.id} value={x.id}>{x.name_ar}</option>)}
                </select>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>الفريق</legend>
            <div className="form-grid">
              <div className="field">
                <label>جالب المشروع</label>
                <select value={p.originator_id || ''}
                        onChange={(e)=>patch({originator_id:e.target.value || null})}>
                  <option value="">—</option>
                  {emps.map((x)=><option key={x.id} value={x.id}>{x.full_name_ar}</option>)}
                </select>
                <span className="hint">يستحق ٢.٥٪ من الربح مع كل مستخلص محصَّل</span>
              </div>
              <div className="field">
                <label>المشرف</label>
                <select value={p.supervisor_id || ''}
                        onChange={(e)=>patch({supervisor_id:e.target.value || null})}>
                  <option value="">—</option>
                  {emps.map((x)=><option key={x.id} value={x.id}>{x.full_name_ar}</option>)}
                </select>
                <span className="hint">يرى هذا المشروع وحده ويسجّل إنجازه</span>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>العقد والمدد</legend>
            <div className="form-grid">
              <div className="field">
                <label>تاريخ التوقيع</label>
                <input type="date" dir="ltr" value={p.signed_date || ''}
                       onChange={(e)=>patch({signed_date:e.target.value || null})} />
              </div>
              <div className="field">
                <label>تاريخ أمر المباشرة</label>
                <input type="date" dir="ltr" value={p.commencement_date || ''}
                       onChange={(e)=>patch({commencement_date:e.target.value || null})} />
              </div>
              <div className="field">
                <label>مدة التنفيذ (يوم)</label>
                <input type="number" dir="ltr" value={p.duration_days ?? ''}
                       onChange={(e)=>setP({...p,duration_days:e.target.value})}
                       onBlur={(e)=>patch({duration_days: e.target.value === '' ? null : Number(e.target.value)})} />
              </div>
              <div className="field span2">
                <label>غرامة التأخير</label>
                <input value={p.delay_penalty_text || ''}
                       onChange={(e)=>setP({...p,delay_penalty_text:e.target.value})}
                       onBlur={(e)=>patch({delay_penalty_text:e.target.value})}
                       placeholder="مثال: ١٪ من قيمة العقد لكل أسبوع تأخير" />
              </div>
              <div className="field">
                <label>الغرامة اليومية</label>
                <input type="number" step="0.01" dir="ltr" value={p.delay_penalty_daily ?? ''}
                       onChange={(e)=>setP({...p,delay_penalty_daily:e.target.value})}
                       onBlur={(e)=>patch({delay_penalty_daily: e.target.value === '' ? null : Number(e.target.value)})} />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>الشروط المالية</legend>
            <div className="form-grid">
              <div className="field">
                <label>الدفعة المقدمة (نسبة)</label>
                <input type="number" step="0.01" dir="ltr" value={p.advance_pct ?? 0}
                       onChange={(e)=>setP({...p,advance_pct:e.target.value})}
                       onBlur={(e)=>patch({advance_pct:Number(e.target.value||0)})} />
                <span className="hint">0.10 تعني ١٠٪</span>
              </div>
              <div className="field">
                <label>الدفعة المقدمة (مبلغ)</label>
                <input type="number" step="0.01" dir="ltr" value={p.advance_amount ?? 0}
                       onChange={(e)=>setP({...p,advance_amount:e.target.value})}
                       onBlur={(e)=>patch({advance_amount:Number(e.target.value||0)})} />
              </div>
              <div className="field">
                <label>نسبة المحتجزات</label>
                <input type="number" step="0.01" dir="ltr" value={p.retention_pct ?? 0}
                       onChange={(e)=>setP({...p,retention_pct:e.target.value})}
                       onBlur={(e)=>patch({retention_pct:Number(e.target.value||0)})} />
                <span className="hint">0.05 تعني ٥٪ — تُحسب مع كل مستخلص</span>
              </div>
              <div className="field">
                <label>مدة السداد (يوم)</label>
                <input type="number" dir="ltr" value={p.payment_terms_days ?? 30}
                       onChange={(e)=>setP({...p,payment_terms_days:e.target.value})}
                       onBlur={(e)=>patch({payment_terms_days:Number(e.target.value||30)})} />
              </div>
              <div className="field span2">
                <label>أساس المستخلصات</label>
                <select value={p.claim_basis || ''} onChange={(e)=>patch({claim_basis:e.target.value})}>
                  <option value="">—</option>
                  {['مستخلص شهري','عند نسبة إنجاز','دفعة واحدة عند التسليم','بحسب سير الأعمال']
                    .map((x)=><option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div className="field span2">
                <label>ملاحظات</label>
                <input value={p.notes || ''} onChange={(e)=>setP({...p,notes:e.target.value})}
                       onBlur={(e)=>patch({notes:e.target.value})} />
              </div>
            </div>
          </fieldset>
        </div>
      )}
    </>
  );
}
