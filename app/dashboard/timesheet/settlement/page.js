'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================
//  تسوية المقاول بالفترة
//  الأرقام تُحسب من واقع ما أُدخل — لا تُكتب باليد
//  المسار : /dashboard/timesheet/settlement
// ============================================================

const MAROON = '#8B3332';

const BASIS = {
  item:      'بحسب البند (الموصى به)',
  daywork:   'بالمياومة لكل الأيام',
  piecework: 'بالمتر لكل الأيام',
};

const CHARGE_AR = { owner: 'المالك', contractor: 'المقاول', arkan: 'أركان' };
const PAYER_AR  = { contractor: 'المقاول', arkan_custody: 'عهدة أركان', arkan_direct: 'أركان مباشرة' };

const DAY_AR = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const satOf = (s) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return iso(d); };
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n || 0).toLocaleString('en-US');

export default function ContractorSettlement() {
  const [projects, setProjects] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [contractorId, setContractorId] = useState('');
  const [from, setFrom] = useState(satOf(iso(new Date())));
  const [to, setTo] = useState(addDays(satOf(iso(new Date())), 5));
  const [basis, setBasis] = useState('item');
  const [penalty, setPenalty] = useState('');
  const [other, setOther] = useState('');

  const [pv, setPv] = useState(null);        // أرقام المعاينة
  const [days, setDays] = useState([]);      // تفصيل الأيام
  const [exps, setExps] = useState([]);      // تفصيل المنصرفات
  const [advs, setAdvs] = useState([]);      // السلف المفتوحة
  const [saved, setSaved] = useState([]);    // التسويات المحفوظة

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.from('projects').select('id, project_no, name_ar').order('project_no')
      .then(({ data }) => setProjects(data || []));
    supabase.from('contractors').select('id, name_ar, iban, bank_name')
      .eq('is_active', true).order('name_ar')
      .then(({ data }) => setContractors(data || []));
  }, []);

  const loadSaved = useCallback(async () => {
    if (!projectId) { setSaved([]); return; }
    let q = supabase.from('contractor_settlements')
      .select('id, settlement_no, contractor_id, period_from, period_to, net_payable, status, paid_at')
      .eq('project_id', projectId).order('period_from', { ascending: false });
    if (contractorId) q = q.eq('contractor_id', contractorId);
    const { data } = await q;
    setSaved(data || []);
  }, [projectId, contractorId]);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  // ---------- المعاينة ----------
  const preview = useCallback(async () => {
    if (!projectId || !contractorId) { setErr('اختر المشروع والمقاول'); return; }
    if (to < from) { setErr('تاريخ النهاية قبل البداية'); return; }
    setLoading(true); setErr(''); setMsg(''); setPv(null);
    try {
      const { data, error } = await supabase.rpc('fn_settlement_preview', {
        p_project_id: projectId, p_contractor_id: contractorId,
        p_from: from, p_to: to, p_basis: basis,
      });
      if (error) throw error;
      setPv(Array.isArray(data) ? data[0] : data);

      const [d, e, a] = await Promise.all([
        supabase.from('v_day_contractor_value').select('*')
          .eq('project_id', projectId).eq('contractor_id', contractorId)
          .gte('work_date', from).lte('work_date', to).order('work_date'),
        supabase.from('v_contractor_expense_split').select('*')
          .eq('project_id', projectId).eq('contractor_id', contractorId)
          .gte('expense_date', from).lte('expense_date', to).order('expense_date'),
        supabase.from('contractor_advances')
          .select('id, advance_date, amount, deducted, remaining, notes')
          .eq('project_id', projectId).eq('contractor_id', contractorId)
          .eq('is_closed', false).lte('advance_date', to).order('advance_date'),
      ]);
      setDays(d.data || []); setExps(e.data || []); setAdvs(a.data || []);
    } catch (ex) {
      setErr('تعذّر الحساب: ' + (ex.message || ex));
    }
    setLoading(false);
  }, [projectId, contractorId, from, to, basis]);

  // ---------- الاعتماد ----------
  async function approve() {
    if (!pv) return;
    if (!window.confirm('اعتماد هذه التسوية وحفظها؟')) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const { data, error } = await supabase.rpc('fn_build_period_settlement', {
        p_project_id: projectId, p_contractor_id: contractorId,
        p_from: from, p_to: to, p_basis: basis,
        p_penalty: penalty === '' ? 0 : Number(penalty),
        p_other: other === '' ? 0 : Number(other),
      });
      if (error) throw error;
      const { data: row } = await supabase.from('contractor_settlements')
        .select('settlement_no').eq('id', data).maybeSingle();
      setMsg('اعتُمدت التسوية برقم ' + (row?.settlement_no || '—'));
      loadSaved();
    } catch (ex) {
      setErr('تعذّر الاعتماد: ' + (ex.message || ex));
    }
    setBusy(false);
  }

  const quick = {
    week:  () => { const s = satOf(iso(new Date())); setFrom(s); setTo(addDays(s, 5)); },
    prev:  () => { const s = addDays(satOf(iso(new Date())), -7); setFrom(s); setTo(addDays(s, 5)); },
    month: () => {
      const d = new Date();
      setFrom(iso(new Date(d.getFullYear(), d.getMonth(), 1)));
      setTo(iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    },
  };

  const ctr = contractors.find((c) => c.id === contractorId);
  const proj = projects.find((p) => p.id === projectId);
  const nameOfContractor = (id) => contractors.find((c) => c.id === id)?.name_ar || '—';

  const pen = penalty === '' ? 0 : Number(penalty);
  const oth = other === '' ? 0 : Number(other);
  const net = pv ? Number(pv.works_amount || 0) + Number(pv.reimbursable_amount || 0)
                   - Number(pv.charged_amount || 0) - Number(pv.advances_amount || 0)
                   - pen + oth : 0;

  // الفرق بين الأساسين — تحذير من الازدواج
  const gap = pv ? Number(pv.daywork_value || 0) - Number(pv.by_item_value || 0) : 0;

  return (
    <div dir="rtl">
      <div className="page-head no-print">
        <div>
          <h1>تسوية المقاول</h1>
          <p>اختر المقاول والفترة — الأرقام تُحسب من الحضور والمنجز والمنصرفات والسلف</p>
        </div>
      </div>

      <div className="section no-print" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>المشروع</label>
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setPv(null); }}>
              <option value="">— اختر —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.project_no} — {p.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 200 }}>
            <label>المقاول</label>
            <select value={contractorId} onChange={(e) => { setContractorId(e.target.value); setPv(null); }}>
              <option value="">— اختر —</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name_ar}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>من</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPv(null); }} /></div>
          <div className="field"><label>إلى</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPv(null); }} /></div>
          <div className="field" style={{ minWidth: 210 }}>
            <label>أساس احتساب الأعمال</label>
            <select value={basis} onChange={(e) => { setBasis(e.target.value); setPv(null); }}>
              {Object.entries(BASIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button className="btn" onClick={preview} disabled={!projectId || !contractorId || loading}>
            {loading ? 'جارٍ الحساب…' : 'احسب'}
          </button>
          <button className="btn ghost" onClick={() => window.print()} disabled={!pv}>طباعة</button>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12.5, color: '#777' }}>مدد سريعة:</span>
          <button className="btn ghost" style={sm} onClick={quick.week}>هذا الأسبوع</button>
          <button className="btn ghost" style={sm} onClick={quick.prev}>الأسبوع الماضي</button>
          <button className="btn ghost" style={sm} onClick={quick.month}>هذا الشهر</button>
        </div>
      </div>

      {err && <div className="msg err no-print" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="msg ok no-print" style={{ marginBottom: 12 }}>{msg}</div>}

      {pv && (
        <>
          <div className="section wk">
            <header>
              <h2>{proj?.name_ar} — {ctr?.name_ar}</h2>
              <span style={{ fontSize: 12.5, color: '#777', direction: 'ltr' }}>
                {from} → {to}
              </span>
            </header>

            <div style={{ padding: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                <tbody>
                  <Row label="قيمة الأعمال" value={pv.works_amount}
                       hint={`${num(pv.days_worked)} يوم عمل · ${BASIS[basis]}`} />
                  <Row label="يُردّ للمقاول (دفعه وهو على غيره)" value={pv.reimbursable_amount} sign="+" />
                  <Row label="يُخصم عليه (دفعته أركان وهو عليه)" value={pv.charged_amount} sign="−" />
                  <Row label="السلف المفتوحة" value={pv.advances_amount} sign="−" />
                  <tr>
                    <td style={{ padding: '9px 10px' }}>غرامة تأخير أو خصم</td>
                    <td style={{ width: 170, padding: '6px' }}>
                      <input type="number" step="any" dir="ltr" className="no-print"
                             style={{ width: '100%', textAlign: 'center' }}
                             value={penalty} onChange={(e) => setPenalty(e.target.value)} />
                      <span className="print-only" style={{ direction: 'ltr' }}>{money(pen)}</span>
                    </td>
                    <td style={{ width: 40, textAlign: 'center', color: '#A32B24' }}>−</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '9px 10px' }}>إضافات أخرى</td>
                    <td style={{ width: 170, padding: '6px' }}>
                      <input type="number" step="any" dir="ltr" className="no-print"
                             style={{ width: '100%', textAlign: 'center' }}
                             value={other} onChange={(e) => setOther(e.target.value)} />
                      <span className="print-only" style={{ direction: 'ltr' }}>{money(oth)}</span>
                    </td>
                    <td style={{ width: 40, textAlign: 'center', color: '#2E6B3A' }}>+</td>
                  </tr>
                  <tr style={{ background: '#faf8f8', fontWeight: 600, fontSize: 15 }}>
                    <td style={{ padding: '12px 10px' }}>الصافي المستحق</td>
                    <td style={{ textAlign: 'center', direction: 'ltr', color: MAROON }}>{money(net)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>

              {ctr?.iban && (
                <div style={{ fontSize: 12.5, color: '#666', marginTop: 10 }}>
                  التحويل إلى: {ctr.bank_name || ''} — <span style={{ direction: 'ltr' }}>{ctr.iban}</span>
                </div>
              )}
            </div>

            <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '0 16px 16px' }}>
              <button className="btn" onClick={approve} disabled={busy}>
                {busy ? 'جارٍ…' : 'اعتماد التسوية وحفظها'}
              </button>
              <span style={{ fontSize: 12.5, color: '#777' }}>
                الاعتماد يحفظ الأرقام كما تراها الآن — وإعادة الاعتماد لنفس الفترة تُحدّث السجل نفسه
              </span>
            </div>
          </div>

          {/* تنبيه الازدواج */}
          {basis === 'item' && gap !== 0 && (
            <div className="msg err no-print" style={{ marginBottom: 12 }}>
              لو حُسبت بالمياومة لكل الأيام لزاد المستحق بمقدار{' '}
              <b style={{ direction: 'ltr' }}>{money(gap)}</b> — لأن أياماً منها بنودها بالمتر،
              والحضور فيها سجلّ وجود لا سند دفع.
            </div>
          )}

          {/* تفصيل الأيام */}
          <div className="section wk">
            <header>
              <h2>تفصيل الأيام ({days.length})</h2>
              <span style={{ fontSize: 12.5, color: '#777' }}>الأساسان معاً — والمعتمد بحسب البند</span>
            </header>
            {days.length === 0 ? (
              <div className="empty"><h3>لا أيام في هذه الفترة</h3></div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: '8px 10px', width: 150 }}>اليوم</th>
                    <th style={{ padding: '8px' }}>الحاضرون</th>
                    <th style={{ padding: '8px' }}>قيمة المياومة</th>
                    <th style={{ padding: '8px' }}>قيمة المتر</th>
                    <th style={{ padding: '8px' }}>المعتمد</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const dt = new Date(d.work_date + 'T00:00:00');
                    return (
                      <tr key={d.work_date}>
                        <td style={{ padding: '6px 10px' }}>
                          {DAY_AR[dt.getDay()]}
                          <span style={{ fontSize: 11, opacity: .65, marginInlineStart: 8, direction: 'ltr' }}>
                            {d.work_date}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{d.present_count}</td>
                        <td style={{ textAlign: 'center', direction: 'ltr', opacity: d.is_piece_day ? .45 : 1 }}>
                          {money(d.daywork_value)}
                        </td>
                        <td style={{ textAlign: 'center', direction: 'ltr', opacity: d.is_piece_day ? 1 : .45 }}>
                          {money(d.piecework_value)}
                        </td>
                        <td style={{ textAlign: 'center', direction: 'ltr', fontWeight: 500 }}>
                          {money(d.by_item_value)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: '#faf8f8', fontWeight: 500 }}>
                    <td style={{ padding: '8px 10px' }}>الإجمالي</td>
                    <td />
                    <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(pv.daywork_value)}</td>
                    <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(pv.piecework_value)}</td>
                    <td style={{ textAlign: 'center', direction: 'ltr', color: MAROON }}>
                      {money(pv.by_item_value)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* تفصيل المنصرفات */}
          <div className="section wk">
            <header><h2>المنصرفات ({exps.length})</h2></header>
            {exps.length === 0 ? (
              <div className="empty"><h3>لا منصرفات في هذه الفترة</h3></div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: '8px 10px', width: 110 }}>التاريخ</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>البند</th>
                    <th style={{ padding: '8px' }}>من دفع</th>
                    <th style={{ padding: '8px' }}>على من</th>
                    <th style={{ padding: '8px' }}>المبلغ</th>
                    <th style={{ padding: '8px' }}>يُردّ له</th>
                    <th style={{ padding: '8px' }}>يُخصم عليه</th>
                  </tr>
                </thead>
                <tbody>
                  {exps.map((x, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 10px', direction: 'ltr' }}>{x.expense_date}</td>
                      <td style={{ padding: '6px 10px' }}>{x.category || x.notes || '—'}</td>
                      <td style={{ textAlign: 'center', fontSize: 12.5 }}>{PAYER_AR[x.payer] || x.payer}</td>
                      <td style={{ textAlign: 'center', fontSize: 12.5 }}>{CHARGE_AR[x.charge_to] || x.charge_to}</td>
                      <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(x.amount)}</td>
                      <td style={{ textAlign: 'center', direction: 'ltr', color: '#2E6B3A' }}>
                        {Number(x.reimbursable) ? money(x.reimbursable) : '—'}
                      </td>
                      <td style={{ textAlign: 'center', direction: 'ltr', color: '#A32B24' }}>
                        {Number(x.charged) ? money(x.charged) : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: '#faf8f8', fontWeight: 500 }}>
                    <td colSpan={5} style={{ padding: '8px 10px' }}>الإجمالي</td>
                    <td style={{ textAlign: 'center', direction: 'ltr', color: '#2E6B3A' }}>
                      {money(pv.reimbursable_amount)}
                    </td>
                    <td style={{ textAlign: 'center', direction: 'ltr', color: '#A32B24' }}>
                      {money(pv.charged_amount)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* السلف */}
          {advs.length > 0 && (
            <div className="section wk">
              <header><h2>السلف المفتوحة ({advs.length})</h2></header>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: '8px 10px', width: 110 }}>التاريخ</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px' }}>البيان</th>
                    <th style={{ padding: '8px' }}>المبلغ</th>
                    <th style={{ padding: '8px' }}>المحسوم</th>
                    <th style={{ padding: '8px' }}>المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {advs.map((a) => (
                    <tr key={a.id}>
                      <td style={{ padding: '6px 10px', direction: 'ltr' }}>{a.advance_date}</td>
                      <td style={{ padding: '6px 10px' }}>{a.notes || '—'}</td>
                      <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(a.amount)}</td>
                      <td style={{ textAlign: 'center', direction: 'ltr' }}>{money(a.deducted)}</td>
                      <td style={{ textAlign: 'center', direction: 'ltr', fontWeight: 500 }}>
                        {money(a.remaining ?? (Number(a.amount || 0) - Number(a.deducted || 0)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* التسويات المحفوظة */}
      {saved.length > 0 && (
        <div className="section no-print">
          <header><h2>التسويات المحفوظة ({saved.length})</h2></header>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'right', padding: '8px 10px', width: 140 }}>الرقم</th>
                <th style={{ textAlign: 'right', padding: '8px 10px' }}>المقاول</th>
                <th style={{ padding: '8px' }}>الفترة</th>
                <th style={{ padding: '8px' }}>الصافي</th>
                <th style={{ padding: '8px' }}>الحالة</th>
                <th style={{ padding: '8px', width: 90 }}>—</th>
              </tr>
            </thead>
            <tbody>
              {saved.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: '6px 10px', direction: 'ltr' }}>{s.settlement_no}</td>
                  <td style={{ padding: '6px 10px' }}>{nameOfContractor(s.contractor_id)}</td>
                  <td style={{ textAlign: 'center', direction: 'ltr', fontSize: 12.5 }}>
                    {s.period_from} → {s.period_to}
                  </td>
                  <td style={{ textAlign: 'center', direction: 'ltr', fontWeight: 500 }}>
                    {money(s.net_payable)}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 12.5 }}>
                    {s.paid_at ? 'مدفوعة' : (s.status || 'مسودة')}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="btn ghost" style={sm} onClick={() => {
                      setContractorId(s.contractor_id);
                      setFrom(s.period_from); setTo(s.period_to);
                      setPv(null);
                    }}>فتح</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx global>{`
        .print-only { display: none; }
        @media print {
          .no-print, aside, nav, header.app-head { display: none !important; }
          .print-only { display: inline !important; }
          .wk { break-inside: avoid; }
          body { background: #fff; }
        }
      `}</style>
    </div>
  );
}

function Row({ label, value, hint, sign }) {
  const color = sign === '−' ? '#A32B24' : sign === '+' ? '#2E6B3A' : undefined;
  return (
    <tr>
      <td style={{ padding: '9px 10px' }}>
        {label}
        {hint && <div style={{ fontSize: 11.5, color: '#888' }}>{hint}</div>}
      </td>
      <td style={{ width: 170, textAlign: 'center', direction: 'ltr' }}>
        {Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td style={{ width: 40, textAlign: 'center', color }}>{sign || ''}</td>
    </tr>
  );
}

const sm = { padding: '3px 11px', fontSize: 12.5 };
