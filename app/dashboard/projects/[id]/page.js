'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { STAGE_AR, SCOPE_AR } from '@/lib/projects';
import { normalizeProjectView } from '@/lib/app-constitution';
import { useLiveRefresh, notifyChange } from '@/lib/live';
import ProjScope from '@/components/ProjScope';
import ProjProgress from '@/components/ProjProgress';
import ProjClaims from '@/components/ProjClaims';
import ProjDocs from '@/components/ProjDocs';
import ProjGuarantees from '@/components/ProjGuarantees';

export default function ProjectCard() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const activeView = normalizeProjectView(searchParams.get('view'));
  const [p, setP] = useState(null);
  const [fin, setFin] = useState(null);
  const [tot, setTot] = useState(null);
  const [emps, setEmps] = useState([]);
  const [ents, setEnts] = useState([]);
  const [access, setAccess] = useState({ full:false, keys:[] });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const loadFin = useCallback(async () => {
    const [fr, tr] = await Promise.all([
      supabase.from('v_project_financials').select('*').eq('project_id', id).maybeSingle(),
      supabase.from('v_project_totals').select('*').eq('project_id', id).maybeSingle(),
    ]);
    setFin(fr.data || null);
    setTot(tr.data || null);
  }, [id]);

  const load = useCallback(async () => {
    const sess = (await supabase.auth.getSession()).data.session;
    const [pr, e, en, capsQ, primaryQ, userQ] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).maybeSingle(),
      supabase.from('employees').select('id, full_name_ar, employee_no').order('employee_no'),
      supabase.from('entities').select('id, name_ar').order('name_ar'),
      supabase.from('v_my_capabilities').select('capability_key,module_key,scope_type,scope_key,source_key'),
      supabase.rpc('fn_is_primary_user'),
      sess?.user?.id ? supabase.from('app_users').select('is_system_admin').eq('id', sess.user.id).maybeSingle() : Promise.resolve({data:null,error:null}),
    ]);
    if (!pr.data) { setErr('لم يُعثر على هذا المشروع.'); return; }
    const caps=(capsQ.data||[]).filter((cap)=>cap.module_key==='projects'&&(cap.scope_type==='all'||(cap.scope_type==='project'&&cap.scope_key===id)));
    const systemFull=primaryQ.data===true||Boolean(userQ.data?.is_system_admin);
    const portalFull=systemFull||caps.some((cap)=>cap.source_key==='projects_full_access');
    setP(pr.data);
    setEmps(e.data || []);
    setEnts(en.data || []);
    setAccess({full:portalFull,keys:[...new Set(caps.map((cap)=>cap.capability_key))]});
    await loadFin();
  }, [id, loadFin]);

  useEffect(() => { load(); }, [load]);
  useLiveRefresh(loadFin, ['all']);

  const has = (key) => access.full || access.keys.includes(key);
  const canWrite = activeView === 'scope'
    ? has('projects.scope.edit')
    : activeView === 'progress'
      ? has('projects.progress.edit')
      : activeView === 'claims'
        ? (has('projects.claims.edit') || has('projects.claims.create'))
        : activeView === 'docs'
          ? (has('projects.documents.edit') || has('projects.documents.create') || has('projects.materials.edit') || has('projects.materials.create'))
          : has('projects.projects.edit');
  const canApproveContractValue = has('projects.contract_value.approve');

  async function patch(fields) {
    setP({ ...p, ...fields });
    const { error } = await supabase.from('projects').update(fields).eq('id', id);
    if (error) setErr('تعذّر الحفظ: ' + error.message);
    else {
      setMsg('حُفظ');
      setTimeout(() => setMsg(''), 1200);
      loadFin();
      notifyChange('project');
    }
  }

  async function approveContractValue() {
    const { data, error } = await supabase.rpc('approve_project_contract_value', { p_project_id:id });
    if (error) { setErr('تعذّر الاعتماد: ' + error.message); return; }
    setMsg('اعتُمدت قيمة العقد ' + money(data));
    setTimeout(() => setMsg(''), 1800);
    load();
    notifyChange('project');
  }

  if (err && !p) return <div className="msg err">{err}</div>;
  if (!p) return <div className="empty">جارٍ التحميل…</div>;

  const f = fin || {};
  const t = tot || {};
  const contractValue = Number(
    t.contract_value_effective !== undefined && t.contract_value_effective !== null
      ? t.contract_value_effective
      : (p.contract_value || 0)
  );
  const contractApproved = !!t.contract_value_approved;
  const profit = Number(f.current_profit || 0);
  const daysLeft = f.days_remaining;

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      {activeView === 'overview' && Number(f.items_without_decision || 0) > 0 && (
        <div className="msg err" style={{marginBottom:14}}>
          {f.items_without_decision} بنداً بلا قرار تنفيذ
        </div>
      )}
      {activeView === 'overview' && Number(f.unclassified_spend || 0) > 0 && (
        <div className="msg err" style={{marginBottom:14}}>
          {f.unclassified_spend} حركة صرف بلا تصنيف — الربح غير دقيق حتى تصنّفها
        </div>
      )}

      {activeView === 'overview' && (
        <>
          <div className="grid k4" style={{marginBottom:18}}>
            <div className="card">
              <h3>الربح الحالي</h3>
              <div className="big" style={{color:profit < 0 ? 'var(--bad)' : 'var(--maroon-dark)'}}>{money(profit)}</div>
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
                  <tr>
                    <td style={{color:'var(--ink-soft)'}}>
                      قيمة العقد
                      {!contractApproved && contractValue > 0 && (
                        <span style={{marginInlineStart:8,fontSize:11.5,padding:'1px 7px',border:'1px solid var(--ink-soft)',borderRadius:4,color:'var(--ink-soft)'}}>
                          محسوبة من البنود — غير معتمدة
                        </span>
                      )}
                    </td>
                    <td className="num">{money(contractValue)}</td>
                  </tr>
                  {t.contract_value_mismatch && (
                    <tr>
                      <td colSpan={2} style={{color:'var(--bad)',fontSize:12.5}}>
                        المعتمد {money(t.contract_value_signed)} يخالف مجموع البنود {money(t.items_contract_value)} — سجّل أمر تغيير مرقّماً بالفرق أو أعد الاعتماد
                      </td>
                    </tr>
                  )}
                  {[
                    ['القيمة المكتسبة من الإنجاز', f.earned_value],
                    ['إجمالي المستخلصات', f.claimed_gross],
                    ['المحصَّل', f.collected],
                    ['مستحق لم يُحصَّل', f.pending_collection],
                    ['محتجزات لدى المالك', f.retention_held],
                    ['مطالبات على المالك من العهد', f.charged_to_owner],
                    ['منها لم يُسترد', f.owner_recovery_pending],
                  ].map(([label,value]) => (
                    <tr key={label}><td style={{color:'var(--ink-soft)'}}>{label}</td><td className="num">{money(value || 0)}</td></tr>
                  ))}
                </tbody>
              </table>
              {canApproveContractValue && !contractApproved && Number(t.items_contract_value || 0) > 0 && (
                <div style={{padding:'12px 18px'}}>
                  <button className="btn" onClick={approveContractValue}>اعتماد قيمة البنود كقيمة عقد</button>
                  <div style={{fontSize:12.5,color:'var(--ink-soft)',marginTop:6}}>بعد الاعتماد لا تتغير قيمة العقد إلا بأمر تغيير مرقّم</div>
                </div>
              )}
            </div>

            <div className="section" style={{marginTop:0}}>
              <header><h2>التكاليف</h2></header>
              <table>
                <tbody>
                  {[
                    ['الميزانية المخططة للبنود', f.budget_total],
                    ['تكلفة المواد', f.material_cost],
                    ['تكلفة العمالة من التايم شيت', f.labor_cost],
                    ['منصرف العهد على أركان', f.custody_cost_arkan],
                    ['خصومات على المقاولين', f.charged_to_contractor],
                    ['إجمالي ما تتحمله أركان', f.direct_cost_known],
                  ].map(([label,value]) => (
                    <tr key={label}><td style={{color:'var(--ink-soft)'}}>{label}</td><td className="num">{money(value || 0)}</td></tr>
                  ))}
                  <tr>
                    <td style={{fontWeight:600,color:'var(--maroon-dark)'}}>الربح الحالي</td>
                    <td className="num" style={{fontWeight:700,color:profit < 0 ? 'var(--bad)' : 'var(--ok)'}}>{money(profit)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{padding:'12px 18px',fontSize:12.5,color:'var(--ink-soft)'}}>
                تكلفة العمالة تُحتسب من الحضور المسجل مرة واحدة؛ الدفعات اللاحقة تسوية للمستحق ولا تُضاف كتكلفة جديدة.
              </div>
            </div>
          </div>
        </>
      )}

      {activeView === 'scope' && <ProjScope projectId={id} canWrite={canWrite} onChange={load} />}
      {activeView === 'progress' && <ProjProgress projectId={id} canWrite={canWrite} onChange={loadFin} />}
      {activeView === 'claims' && <ProjClaims project={p} canWrite={canWrite} onChange={loadFin} />}
      {activeView === 'guarantees' && <ProjGuarantees project={p} canWrite={canWrite} onChange={loadFin} />}
      {activeView === 'docs' && <ProjDocs project={p} canWrite={canWrite} />}

      {activeView === 'settings' && (
        <div className="section" style={{marginTop:0,padding:18}}>
          {!canWrite && <div className="msg" style={{marginBottom:14}}>لديك صلاحية عرض بيانات المشروع دون تعديلها.</div>}
          <fieldset style={{borderTop:'none',paddingTop:0}} disabled={!canWrite}>
            <legend>التعريف</legend>
            <div className="form-grid">
              <div className="field span2">
                <label>اسم المشروع *</label>
                <input value={p.name_ar || ''} onChange={(e)=>setP({...p,name_ar:e.target.value})
                       } onBlur={(e)=>patch({name_ar:e.target.value})} />
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
                  {Object.entries(STAGE_AR).map(([key,label])=><option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>نطاق التوريد</label>
                <select value={p.supply_scope} onChange={(e)=>patch({supply_scope:e.target.value})}>
                  {Object.entries(SCOPE_AR).map(([key,label])=><option key={key} value={key}>{label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>مصدر المشروع</label>
                <select value={p.source_kind || ''} onChange={(e)=>patch({source_kind:e.target.value})}>
                  <option value="">—</option>
                  {['من المالك مباشرة','عطاء أو مناقصة','باطن من شركة أخرى','أسندناه بالباطن'].map((x)=><option key={x} value={x}>{x}</option>)}
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

          <fieldset disabled={!canWrite}>
            <legend>الفريق</legend>
            <div className="form-grid">
              <div className="field">
                <label>جالب المشروع</label>
                <select value={p.originator_id || ''} onChange={(e)=>patch({originator_id:e.target.value || null})}>
                  <option value="">—</option>
                  {emps.map((x)=><option key={x.id} value={x.id}>{x.full_name_ar}</option>)}
                </select>
                <span className="hint">يستحق ٢.٥٪ من الربح مع كل مستخلص محصَّل</span>
              </div>
              <div className="field">
                <label>المشرف</label>
                <select value={p.supervisor_id || ''} onChange={(e)=>patch({supervisor_id:e.target.value || null})}>
                  <option value="">—</option>
                  {emps.map((x)=><option key={x.id} value={x.id}>{x.full_name_ar}</option>)}
                </select>
                <span className="hint">يرى هذا المشروع وحده ويسجّل إنجازه</span>
              </div>
            </div>
          </fieldset>

          <fieldset disabled={!canWrite}>
            <legend>العقد والمدد</legend>
            <div className="form-grid">
              <div className="field">
                <label>تاريخ التوقيع</label>
                <input type="date" dir="ltr" value={p.signed_date || ''} onChange={(e)=>patch({signed_date:e.target.value || null})} />
              </div>
              <div className="field">
                <label>تاريخ أمر المباشرة</label>
                <input type="date" dir="ltr" value={p.commencement_date || ''} onChange={(e)=>patch({commencement_date:e.target.value || null})} />
              </div>
              <div className="field">
                <label>مدة التنفيذ (يوم)</label>
                <input type="number" dir="ltr" value={p.duration_days ?? ''}
                       onChange={(e)=>setP({...p,duration_days:e.target.value})}
                       onBlur={(e)=>patch({duration_days:e.target.value === '' ? null : Number(e.target.value)})} />
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
                       onBlur={(e)=>patch({delay_penalty_daily:e.target.value === '' ? null : Number(e.target.value)})} />
              </div>
            </div>
          </fieldset>

          <fieldset disabled={!canWrite}>
            <legend>الشروط المالية</legend>
            <div className="form-grid">
              <div className="field">
                <label>الدفعة المقدمة (نسبة)</label>
                <input type="number" step="0.01" dir="ltr" value={p.advance_pct ?? 0}
                       onChange={(e)=>setP({...p,advance_pct:e.target.value})}
                       onBlur={(e)=>patch({advance_pct:Number(e.target.value || 0)})} />
                <span className="hint">0.10 تعني ١٠٪</span>
              </div>
              <div className="field">
                <label>الدفعة المقدمة (مبلغ)</label>
                <input type="number" step="0.01" dir="ltr" value={p.advance_amount ?? 0}
                       onChange={(e)=>setP({...p,advance_amount:e.target.value})}
                       onBlur={(e)=>patch({advance_amount:Number(e.target.value || 0)})} />
              </div>
              <div className="field">
                <label>نسبة المحتجزات</label>
                <input type="number" step="0.01" dir="ltr" value={p.retention_pct ?? 0}
                       onChange={(e)=>setP({...p,retention_pct:e.target.value})}
                       onBlur={(e)=>patch({retention_pct:Number(e.target.value || 0)})} />
                <span className="hint">0.05 تعني ٥٪ — تُحسب مع كل مستخلص</span>
              </div>
              <div className="field">
                <label>مدة السداد (يوم)</label>
                <input type="number" dir="ltr" value={p.payment_terms_days ?? 30}
                       onChange={(e)=>setP({...p,payment_terms_days:e.target.value})}
                       onBlur={(e)=>patch({payment_terms_days:Number(e.target.value || 30)})} />
              </div>
              <div className="field span2">
                <label>أساس المستخلصات</label>
                <select value={p.claim_basis || ''} onChange={(e)=>patch({claim_basis:e.target.value})}>
                  <option value="">—</option>
                  {['مستخلص شهري','عند نسبة إنجاز','دفعة واحدة عند التسليم','بحسب سير الأعمال'].map((x)=><option key={x} value={x}>{x}</option>)}
                </select>
              </div>
              <div className="field span2">
                <label>ملاحظات</label>
                <input value={p.notes || ''}
                       onChange={(e)=>setP({...p,notes:e.target.value})}
                       onBlur={(e)=>patch({notes:e.target.value})} />
              </div>
            </div>
          </fieldset>
        </div>
      )}
    </>
  );
}
