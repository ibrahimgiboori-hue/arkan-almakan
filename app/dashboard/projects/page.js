'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { STAGE_AR, STAGE_CLASS, SCOPE_AR } from '@/lib/projects';

export default function Projects() {
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [fin, setFin] = useState({});
  const [emps, setEmps] = useState([]);
  const [role, setRole] = useState(null);
  const [stage, setStage] = useState('all');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [p, f, e, u] = await Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('v_project_financials').select('*'),
      supabase.from('employees').select('id, full_name_ar, employee_no').order('employee_no'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(p.data || []);
    const m = {}; (f.data || []).forEach((x) => { m[x.project_id] = x; });
    setFin(m); setEmps(e.data || []); setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setErr(''); setBusy(true);
    const { data: num, error: e1 } = await supabase
      .rpc('next_document_number', { p_doc_type: 'PROJECT', p_prefix: 'PRJ' });
    if (e1) { setErr('تعذّر توليد الرقم: ' + e1.message); setBusy(false); return; }

    const { data, error } = await supabase.from('projects').insert({
      project_no: num, name_ar: 'مشروع جديد', stage: 'opportunity',
      status: 'active', supply_scope: 'labor_only',
    }).select('id').single();

    setBusy(false);
    if (error) { setErr('تعذّر الإنشاء: ' + error.message); return; }
    router.push(`/dashboard/projects/${data.id}`);
  }

  async function remove(r) {
    if (!window.confirm(`حذف مشروع "${r.name_ar}" وكل بنوده ومستخلصاته؟`)) return;
    const { error } = await supabase.from('projects').delete().eq('id', r.id);
    if (error) { setErr('تعذّر الحذف: ' + error.message); return; }
    setMsg('حُذف المشروع'); load();
  }

  async function setStage2(r, v) {
    const { error } = await supabase.from('projects').update({ stage: v }).eq('id', r.id);
    if (error) setErr(error.message); else load();
  }

  const list = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    return rows
      .filter((r) => stage === 'all' || r.stage === stage)
      .filter((r) => !t || [r.name_ar, r.project_no, r.city, r.project_ref]
        .filter(Boolean).some((v) => String(v).includes(t)));
  }, [rows, stage, q]);

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant'].includes(role);
  const active = rows.filter((r) => r.stage === 'execution');
  const totalProfit = active.reduce((t,r) => t + Number(fin[r.id]?.current_profit || 0), 0);
  const totalPending = active.reduce((t,r) => t + Number(fin[r.id]?.pending_collection || 0), 0);
  const noDecision = active.reduce((t,r) => t + Number(fin[r.id]?.items_without_decision || 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>المشاريع</h1>
          <p>{active.length} قيد التنفيذ من {rows.length} مشروعاً</p>
        </div>
        {canWrite && (
          <button className="btn" onClick={create} disabled={busy}>
            {busy ? 'جارٍ…' : 'مشروع جديد'}
          </button>
        )}
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="grid k4" style={{marginBottom:20}}>
        <div className="card">
          <h3>الربح الحالي</h3>
          <div className="big">{money(totalProfit)}</div>
          <div className="foot">من المشاريع قيد التنفيذ</div>
        </div>
        <div className="card">
          <h3>مستحق ولم يُحصَّل</h3>
          <div className="big">{money(totalPending)}</div>
          <div className="foot">مستخلصات مقدَّمة أو مفوترة</div>
        </div>
        <div className="card">
          <h3>قيد التنفيذ</h3>
          <div className="big">{active.length}</div>
          <div className="foot">مشاريع نشطة</div>
        </div>
        <div className="card">
          <h3>بنود بلا قرار تنفيذ</h3>
          <div className="big" style={{color: noDecision ? 'var(--bad)' : undefined}}>{noDecision}</div>
          <div className="foot">لا يبدأ تنفيذها قبل القرار</div>
        </div>
      </div>

      <div className="section" style={{marginTop:0}}>
        <header>
          <h2>السجل</h2>
          <div className="rowsplit">
            <select value={stage} onChange={(e)=>setStage(e.target.value)}
                    style={{fontSize:13,padding:'6px 8px'}}>
              <option value="all">كل المراحل</option>
              {Object.entries(STAGE_AR).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
            <input className="search" placeholder="ابحث بالاسم أو الرقم أو المدينة"
                   value={q} onChange={(e)=>setQ(e.target.value)} />
          </div>
        </header>

        {list.length === 0 ? (
          <div className="empty">
            <h3>لا مشاريع</h3>
            <p>أنشئ مشروعاً، أو حوّل عرض سعر مقبول إلى مشروع من شاشة العروض.</p>
          </div>
        ) : (
          <div style={{overflowX:'auto'}}>
            <table>
              <thead>
                <tr><th>الرقم</th><th>المشروع</th><th>النطاق</th><th>المرحلة</th>
                    <th className="num">قيمة العقد</th><th className="num">الإنجاز</th>
                    <th className="num">الربح الحالي</th><th className="num">لم يُحصَّل</th>
                    <th>المشرف</th><th style={{width:150}}>الإجراءات</th></tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const f = fin[r.id] || {};
                  const sup = emps.find((e) => e.id === r.supervisor_id);
                  const profit = Number(f.current_profit || 0);
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.project_no}</td>
                      <td>
                        <Link href={`/dashboard/projects/${r.id}`}>{r.name_ar}</Link>
                        {r.city && <div style={{fontSize:12,color:'var(--ink-soft)'}}>{r.city}</div>}
                      </td>
                      <td style={{fontSize:12.5}}>{SCOPE_AR[r.supply_scope]}</td>
                      <td>
                        {canWrite ? (
                          <select value={r.stage} onChange={(e)=>setStage2(r, e.target.value)}
                                  style={{fontSize:12.5,padding:'2px 4px'}}>
                            {Object.entries(STAGE_AR).map(([k,v])=>(
                              <option key={k} value={k}>{v}</option>))}
                          </select>
                        ) : (
                          <span className={`pill ${STAGE_CLASS[r.stage]}`}>{STAGE_AR[r.stage]}</span>
                        )}
                      </td>
                      <td className="num">{money(r.contract_value)}</td>
                      <td className="num">
                        {Number(f.computed_progress_pct || 0).toFixed(0)}%
                      </td>
                      <td className="num" style={{color: profit < 0 ? 'var(--bad)' : 'var(--ok)'}}>
                        {money(profit)}
                      </td>
                      <td className="num">{money(f.pending_collection || 0)}</td>
                      <td style={{fontSize:12.5}}>{sup?.full_name_ar || '—'}</td>
                      <td>
                        <div className="rowsplit">
                          <Link className="btn ghost" style={{padding:'4px 9px',fontSize:12.5}}
                                href={`/dashboard/projects/${r.id}`}>فتح</Link>
                          {canWrite && (
                            <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                            borderColor:'#EBC3C0',color:'#A32B24'}}
                                    onClick={()=>remove(r)}>حذف</button>
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
