'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { useLiveRefresh } from '@/lib/live';

const PAYER_AR = {
  contractor: 'المقاول من حسابه الخاص',
  arkan_custody: 'أركان — صرف من عهدة',
  arkan_direct: 'أركان — صرف مباشر',
};

const CHARGE_AR = {
  arkan: 'أركان — تُحمَّل على تكلفة البند',
  contractor: 'المقاول — تُخصم من مستحقاته',
  owner: 'المالك — مطالبة تُسترد',
};

const KIND_AR = { settlement: 'سداد كشف', on_account: 'دفعة على الحساب', advance: 'سلفة' };
const SOURCE_AR = { bank: 'تحويل بنكي', cash: 'نقداً', custody: 'من عهدة' };

const CATEGORIES = ['وجبات', 'ترحيل', 'سكن', 'عدد وأدوات', 'سقالات', 'مواد', 'وقود', 'أخرى'];

export default function ExpensesPage() {
  const [role, setRole] = useState(null);
  const [projects, setProjects] = useState([]);
  const [cons, setCons] = useState([]);
  const [items, setItems] = useState([]);

  const [projectId, setProjectId] = useState('');
  const [contractorId, setContractorId] = useState('');

  const [acct, setAcct] = useState(null);
  const [exps, setExps] = useState([]);
  const [advs, setAdvs] = useState([]);
  const [pays, setPays] = useState([]);

  const [tab, setTab] = useState('expense');
  const [editing, setEditing] = useState(null);   // { kind, id }
  const [f, setF] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const canWrite = ['ceo', 'accountant', 'hr'].includes(role);
  const today = () => new Date().toISOString().slice(0, 10);

  useEffect(() => {
    (async () => {
      const [{ data: r }, p, c] = await Promise.all([
        supabase.rpc('current_app_role'),
        supabase.from('projects').select('id, project_no, name_ar').order('created_at', { ascending: false }),
        supabase.from('contractors').select('id, name_ar').eq('is_active', true).order('name_ar'),
      ]);
      setRole(r || null);
      setProjects(p.data || []);
      setCons(c.data || []);
    })();
  }, []);

  const loadItems = useCallback(async () => {
    if (!projectId) { setItems([]); return; }
    const { data } = await supabase.from('project_items')
      .select('id, description_ar, unit').eq('project_id', projectId).order('sort_order');
    setItems(data || []);
  }, [projectId]);

  const loadAll = useCallback(async () => {
    if (!projectId || !contractorId) { setAcct(null); setExps([]); setAdvs([]); setPays([]); return; }
    const [a, e, v, p] = await Promise.all([
      supabase.from('v_contractor_project_account').select('*')
        .eq('project_id', projectId).eq('contractor_id', contractorId).maybeSingle(),
      supabase.from('contractor_expenses').select('*')
        .eq('project_id', projectId).eq('contractor_id', contractorId)
        .order('expense_date', { ascending: false }).limit(60),
      supabase.from('contractor_advances').select('*')
        .eq('project_id', projectId).eq('contractor_id', contractorId)
        .order('advance_date', { ascending: false }).limit(40),
      supabase.from('contractor_payments').select('*')
        .eq('project_id', projectId).eq('contractor_id', contractorId)
        .order('payment_date', { ascending: false }).limit(40),
    ]);
    setAcct(a.data || null);
    setExps(e.data || []); setAdvs(v.data || []); setPays(p.data || []);
  }, [projectId, contractorId]);

  useEffect(() => { loadItems(); }, [loadItems]);
  useEffect(() => { loadAll(); }, [loadAll]);

  // تحديث تلقائي: عند أي تغيير في التايم شيت أو غيره، وعند العودة إلى الصفحة
  useLiveRefresh(loadAll, ['timesheet', 'exec', 'scope', 'settlement', 'all']);

  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') loadAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [loadAll]);

  function reset(t) {
    setTab(t); setErr(''); setMsg(''); setEditing(null);
    if (t === 'expense') setF({ expense_date: today(), payer: 'contractor', charge_to: 'arkan', category: 'وجبات' });
    if (t === 'advance') setF({ advance_date: today() });
    if (t === 'payment') setF({ payment_date: today(), kind: 'settlement', source: 'bank' });
  }

  useEffect(() => { reset('expense'); }, []);

  function openEdit(kind, row) {
    setErr(''); setMsg('');
    setTab(kind);
    setEditing({ kind, id: row.id });
    setF({ ...row });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function removeRow(kind, row) {
    if (kind === 'expense' && row.is_settled) {
      setErr('هذا المصروف مُدرج في كشف تسوية معتمد — لا يُحذف. سجّل حركة تصحيح.');
      return;
    }
    if (!window.confirm('حذف هذه الحركة نهائياً؟')) return;
    const table = kind === 'expense' ? 'contractor_expenses'
                : kind === 'advance' ? 'contractor_advances'
                : 'contractor_payments';
    const { error } = await supabase.from(table).delete().eq('id', row.id);
    if (error) { setErr('تعذّر الحذف: ' + error.message); return; }
    setMsg('حُذفت الحركة');
    if (editing?.id === row.id) reset(tab);
    loadAll();
  }

  async function save(e) {
    e.preventDefault(); setErr(''); setMsg('');
    if (!projectId || !contractorId) { setErr('اختر المشروع والمقاول أولاً'); return; }

    let res;
    if (tab === 'expense') {
      if (editing && f.is_settled) {
        setErr('هذا المصروف مُدرج في كشف تسوية معتمد — لا يُعدَّل.');
        return;
      }
      const payload = {
        project_id: projectId, contractor_id: contractorId,
        project_item_id: f.project_item_id || null,
        expense_date: f.expense_date, amount: Number(f.amount),
        category: f.category || 'أخرى',
        payer: f.payer, charge_to: f.charge_to,
        notes: f.notes || null,
      };
      res = editing
        ? await supabase.from('contractor_expenses').update(payload).eq('id', editing.id)
        : await supabase.from('contractor_expenses').insert(payload);
    } else if (tab === 'advance') {
      const payload = {
        project_id: projectId, contractor_id: contractorId,
        advance_date: f.advance_date, amount: Number(f.amount),
        notes: f.notes || null,
      };
      res = editing
        ? await supabase.from('contractor_advances').update(payload).eq('id', editing.id)
        : await supabase.from('contractor_advances').insert(payload);
    } else {
      const payload = {
        project_id: projectId, contractor_id: contractorId,
        payment_date: f.payment_date, amount: Number(f.amount),
        kind: f.kind, source: f.source,
        reference: f.reference || null, notes: f.notes || null,
      };
      res = editing
        ? await supabase.from('contractor_payments').update(payload).eq('id', editing.id)
        : await supabase.from('contractor_payments').insert(payload);
    }

    if (res.error) { setErr('تعذّر الحفظ: ' + res.error.message); return; }
    setMsg(editing ? 'حُدّثت الحركة' : 'حُفظت الحركة');
    reset(tab);
    loadAll();
  }

  const balance = Number(acct?.balance_due || 0);

  return (
    <div>
      <div className="section">
        <header><h2>المصروفات وحسابات المقاولين</h2></header>
        <div className="form-grid" style={{ padding: 18 }}>
          <div className="field">
            <label>المشروع *</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— اختر —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name_ar} — {p.project_no}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>المقاول *</label>
            <select value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
              <option value="">— اختر —</option>
              {cons.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
            </select>
          </div>
        </div>
      </div>

      {acct && (
        <div className="section" style={{ marginTop: 0 }}>
          <header>
            <h2>الحساب الجاري</h2>
            <button className="btn ghost" style={{ padding: '3px 10px', fontSize: 12 }}
                    onClick={loadAll}>تحديث</button>
          </header>
          <table>
            <tbody>
              {[
                [`قيمة أعماله — يوميات فعلية (${acct.days_worked || 0} يوم عمل)`, acct.works_amount],
                ['صرفه وليس عليه — يُردّ له', acct.reimbursable_amount],
                ['صرفناه وهو عليه — يُخصم منه', -acct.charged_amount],
                ['سلفه', -acct.advances_amount],
                ['المدفوع له', -acct.paid_amount],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ color: 'var(--ink-soft)' }}>{k}</td>
                  <td className="num">{money(Math.abs(Number(v || 0)))}</td>
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 700 }}>
                  {balance >= 0 ? 'الرصيد المستحق له' : 'الرصيد المستحق عليه'}
                </td>
                <td className="num" style={{ fontWeight: 700, color: balance >= 0 ? 'var(--maroon)' : 'var(--bad)' }}>
                  {money(Math.abs(balance))}
                </td>
              </tr>
            </tbody>
          </table>
          {Number(acct.by_item_value || 0) > 0 && (
            <div style={{ padding: '10px 18px', fontSize: 12.5,
                          color: Number(acct.headroom || 0) < 0 ? 'var(--bad)' : 'var(--ink-soft)' }}>
              السقف المخطط بحسب البند {money(acct.by_item_value)} —
              {Number(acct.headroom || 0) >= 0
                ? ` الفعلي دونه بـ ${money(acct.headroom)}، أي أن البند لم يتجاوز المخطط`
                : ` الفعلي يتجاوزه بـ ${money(Math.abs(Number(acct.headroom)))} — البند تجاوز المخطط`}
            </div>
          )}
          <div style={{ padding: '0 18px 12px', fontSize: 12.5, color: 'var(--ink-soft)' }}>
            الدفعات والسلف حركات خزينة — تنقص رصيده ولا تمسّ ميزانية البند ولا الربح.
          </div>
        </div>
      )}

      {projectId && contractorId && canWrite && (
        <div className="section" style={{ marginTop: 0 }}>
          <header>
            <div className="rowsplit" style={{ gap: 6 }}>
              {[['expense', 'مصروف'], ['advance', 'سلفة'], ['payment', 'دفعة']].map(([k, t]) => (
                <button key={k} className={tab === k ? 'btn' : 'btn ghost'}
                        style={{ padding: '4px 12px' }} onClick={() => reset(k)}>{t}</button>
              ))}
            </div>
          </header>

          <form onSubmit={save} style={{ padding: 18 }}>
            {err && <div className="msg err">{err}</div>}
            {msg && <div className="msg">{msg}</div>}
            {editing && (
              <div style={{ fontSize: 12.5, color: 'var(--maroon)', marginBottom: 10 }}>
                وضع التعديل — تُحدَّث الحركة المختارة ولا تُنشأ حركة جديدة
              </div>
            )}

            <div className="form-grid">
              {tab === 'expense' && (
                <>
                  <div className="field">
                    <label>التاريخ *</label>
                    <input type="date" dir="ltr" required value={f.expense_date || ''}
                           onChange={(e) => setF({ ...f, expense_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>التصنيف</label>
                    <select value={f.category || ''} onChange={(e) => setF({ ...f, category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>المبلغ *</label>
                    <input type="number" step="0.01" dir="ltr" required value={f.amount ?? ''}
                           onChange={(e) => setF({ ...f, amount: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>من دفعه؟ *</label>
                    <select value={f.payer || 'contractor'}
                            onChange={(e) => setF({ ...f, payer: e.target.value })}>
                      {Object.entries(PAYER_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>على من يُحمَّل؟ *</label>
                    <select value={f.charge_to || 'arkan'}
                            onChange={(e) => setF({ ...f, charge_to: e.target.value })}>
                      {Object.entries(CHARGE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>البند (اختياري)</label>
                    <select value={f.project_item_id || ''}
                            onChange={(e) => setF({ ...f, project_item_id: e.target.value })}>
                      <option value="">— غير مخصص لبند —</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>{i.description_ar}</option>
                      ))}
                    </select>
                    <span className="hint">
                      التحميل على أركان لا ينقص ميزانية بند بعينه إلا إذا حددته
                    </span>
                  </div>
                </>
              )}

              {tab === 'advance' && (
                <>
                  <div className="field">
                    <label>التاريخ *</label>
                    <input type="date" dir="ltr" required value={f.advance_date || ''}
                           onChange={(e) => setF({ ...f, advance_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>المبلغ *</label>
                    <input type="number" step="0.01" dir="ltr" required value={f.amount ?? ''}
                           onChange={(e) => setF({ ...f, amount: e.target.value })} />
                    <span className="hint">تُسترد من أول استحقاق — ليست تكلفة</span>
                  </div>
                </>
              )}

              {tab === 'payment' && (
                <>
                  <div className="field">
                    <label>التاريخ *</label>
                    <input type="date" dir="ltr" required value={f.payment_date || ''}
                           onChange={(e) => setF({ ...f, payment_date: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>المبلغ *</label>
                    <input type="number" step="0.01" dir="ltr" required value={f.amount ?? ''}
                           onChange={(e) => setF({ ...f, amount: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>نوع الدفعة</label>
                    <select value={f.kind || 'settlement'}
                            onChange={(e) => setF({ ...f, kind: e.target.value })}>
                      {Object.entries(KIND_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>مصدر المال</label>
                    <select value={f.source || 'bank'}
                            onChange={(e) => setF({ ...f, source: e.target.value })}>
                      {Object.entries(SOURCE_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>المرجع (رقم تحويل أو سند)</label>
                    <input value={f.reference || ''}
                           onChange={(e) => setF({ ...f, reference: e.target.value })} />
                  </div>
                </>
              )}

              <div className="field span2">
                <label>ملاحظات</label>
                <input value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} />
              </div>
            </div>

            <div className="rowsplit">
              <button className="btn" type="submit">
                {editing ? 'حفظ التعديل' : 'حفظ'}
              </button>
              {editing && (
                <button className="btn ghost" type="button" onClick={() => reset(tab)}>
                  إلغاء التعديل
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {projectId && contractorId && (
        <div className="section" style={{ marginTop: 0, overflowX: 'auto' }}>
          <header><h2>آخر الحركات</h2></header>
          <table>
            <thead>
              <tr>
                <th style={{ width: 110 }}>التاريخ</th>
                <th style={{ width: 90 }}>النوع</th>
                <th>البيان</th>
                <th style={{ width: 110 }} className="num">المبلغ</th>
                {canWrite && <th style={{ width: 110 }}>—</th>}
              </tr>
            </thead>
            <tbody>
              {exps.map((x) => (
                <tr key={x.id}>
                  <td dir="ltr">{x.expense_date}</td>
                  <td><span className="pill" style={{ fontSize: 11 }}>مصروف</span></td>
                  <td>
                    {x.category}
                    {' — '}{PAYER_AR[x.payer] || x.payer}
                    {' · '}{CHARGE_AR[x.charge_to] || x.charge_to}
                    {x.notes ? ` · ${x.notes}` : ''}
                  </td>
                  <td className="num">{money(x.amount)}</td>
                  {canWrite && <Actions kind="expense" row={x} onEdit={openEdit} onDel={removeRow} />}
                </tr>
              ))}
              {advs.map((x) => (
                <tr key={x.id}>
                  <td dir="ltr">{x.advance_date}</td>
                  <td><span className="pill warn" style={{ fontSize: 11 }}>سلفة</span></td>
                  <td>{x.notes || 'سلفة نقدية على الحساب'}</td>
                  <td className="num">{money(x.amount)}</td>
                  {canWrite && <Actions kind="advance" row={x} onEdit={openEdit} onDel={removeRow} />}
                </tr>
              ))}
              {pays.map((x) => (
                <tr key={x.id}>
                  <td dir="ltr">{x.payment_date}</td>
                  <td><span className="pill ok" style={{ fontSize: 11 }}>دفعة</span></td>
                  <td>
                    {KIND_AR[x.kind] || x.kind} · {SOURCE_AR[x.source] || x.source}
                    {x.reference ? ` · ${x.reference}` : ''}
                  </td>
                  <td className="num">{money(x.amount)}</td>
                  {canWrite && <Actions kind="payment" row={x} onEdit={openEdit} onDel={removeRow} />}
                </tr>
              ))}
              {!exps.length && !advs.length && !pays.length && (
                <tr><td colSpan={canWrite ? 5 : 4} style={{ color: 'var(--ink-soft)' }}>لا حركات بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Actions({ kind, row, onEdit, onDel }) {
  const locked = kind === 'expense' && row.is_settled;
  return (
    <td>
      {locked ? (
        <span className="pill" style={{ fontSize: 11 }}>مُسوّى</span>
      ) : (
        <div className="rowsplit" style={{ gap: 4 }}>
          <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11.5 }}
                  onClick={() => onEdit(kind, row)}>تعديل</button>
          <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11.5 }}
                  onClick={() => onDel(kind, row)}>حذف</button>
        </div>
      )}
    </td>
  );
}
