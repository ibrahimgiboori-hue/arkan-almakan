'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, qty as fq, dateAr } from '@/lib/format';

const STAGE_AR = {
  draft: 'مسودة', submitted: 'مقدَّم للمالك', owner_approved: 'معتمد',
  invoiced: 'مفوتر', collected: 'محصَّل',
};

export default function ProjProgress({ projectId, canWrite, onChange }) {
  const [rows, setRows] = useState(null);
  const [entries, setEntries] = useState([]);
  const [claims, setClaims] = useState({});
  const [form, setForm] = useState({});
  const [edit, setEdit] = useState(null);      // معرّف السطر قيد التعديل
  const [draft, setDraft] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data: prog } = await supabase.from('v_item_progress')
      .select('*').eq('project_id', projectId);
    const ids = (prog || []).map((p) => p.project_item_id);
    const { data: ent } = ids.length
      ? await supabase.from('progress_entries').select('*')
          .in('project_item_id', ids).order('entry_date', { ascending: false })
      : { data: [] };

    const cids = [...new Set((ent || []).map((e) => e.claim_id).filter(Boolean))];
    const cmap = {};
    if (cids.length) {
      const { data: cl } = await supabase.from('progress_claims')
        .select('id, claim_no, status').in('id', cids);
      (cl || []).forEach((c) => { cmap[c.id] = c; });
    }

    setRows(prog || []); setEntries(ent || []); setClaims(cmap); onChange?.();
  }

  useEffect(() => { load(); }, [projectId]);

  async function record(item) {
    const v = form[item.project_item_id] || {};
    if (!v.qty && !v.pct) { setErr('أدخل الكمية المنفَّذة أو النسبة'); return; }
    setErr(''); setMsg('');
    const { error } = await supabase.from('progress_entries').insert({
      project_item_id: item.project_item_id,
      entry_date: v.date || new Date().toISOString().slice(0, 10),
      qty_done: Number(v.qty || 0),
      manual_pct: v.pct === '' || v.pct === undefined ? null : Number(v.pct),
      notes: v.notes || null,
    });
    if (error) { setErr('تعذّر التسجيل: ' + error.message); return; }
    setMsg('سُجّل الإنجاز');
    setForm({ ...form, [item.project_item_id]: {} });
    load();
  }

  // ---------- تعديل تسجيل قائم ----------
  function startEdit(e) {
    setErr(''); setMsg('');
    setEdit(e.id);
    setDraft({
      entry_date: e.entry_date || '',
      qty_done: e.qty_done ?? '',
      manual_pct: e.manual_pct ?? '',
      notes: e.notes || '',
    });
  }

  async function saveEdit(e) {
    const c = e.claim_id ? claims[e.claim_id] : null;
    if (c) {
      const ok = window.confirm(
        `هذا الإنجاز داخل المستخلص ${c.claim_no} — مرحلته «${STAGE_AR[c.status] || c.status}».\n` +
        'تعديل الكمية سيغيّر قيمة ذلك المستخلص.\n\n' +
        (c.status === 'draft'
          ? 'المستخلص ما زال مسودة، فالتعديل آمن. متابعة؟'
          : 'المستخلص غادر المسودة — راجع أثر التعديل على ما قُدِّم للمالك. متابعة؟'));
      if (!ok) return;
    }

    const reason = window.prompt('سبب التعديل (يُحفظ مع السطر):',
      e.notes ? '' : 'تصحيح قياس ميداني') ?? '';

    setBusy(true); setErr(''); setMsg('');
    const stamp = reason.trim()
      ? `${e.notes ? e.notes + ' | ' : ''}تعديل ${new Date().toISOString().slice(0, 10)}: ${reason.trim()}`
      : e.notes;

    const { error } = await supabase.from('progress_entries').update({
      entry_date: draft.entry_date || e.entry_date,
      qty_done: draft.qty_done === '' ? 0 : Number(draft.qty_done),
      manual_pct: draft.manual_pct === '' ? null : Number(draft.manual_pct),
      notes: stamp,
    }).eq('id', e.id);

    setBusy(false);
    if (error) { setErr('تعذّر التعديل: ' + error.message); return; }
    setMsg('عُدّل التسجيل' + (e.claim_id ? ' — راجع قيمة المستخلص المرتبط' : ''));
    setEdit(null); load();
  }

  async function delEntry(e) {
    const c = e.claim_id ? claims[e.claim_id] : null;
    const warn = c
      ? `هذا الإنجاز مُطالَب به في ${c.claim_no} (${STAGE_AR[c.status] || c.status}).\n` +
        'حذفه ينقص قيمة ذلك المستخلص.\n\nحذف على أي حال؟'
      : 'حذف هذا التسجيل؟';
    if (!window.confirm(warn)) return;
    const { error } = await supabase.from('progress_entries').delete().eq('id', e.id);
    if (error) setErr('تعذّر الحذف: ' + error.message);
    else { setMsg('حُذف التسجيل'); load(); }
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;
  if (rows.length === 0) return (
    <div className="section" style={{ marginTop: 0 }}>
      <div className="empty"><h3>لا بنود</h3><p>أضف بنود النطاق أولاً.</p></div>
    </div>
  );

  const setF = (id, k, v) => setForm({ ...form, [id]: { ...(form[id] || {}), [k]: v } });
  const inp = { border: '1px solid var(--hair)', padding: '3px', fontSize: 12.5 };
  const sm  = { padding: '3px 8px', fontSize: 12 };

  return (
    <>
      {err && <div className="msg err" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="section" style={{ marginTop: 0, overflowX: 'auto' }}>
        <header><h2>الإنجاز لكل بند</h2></header>
        <table>
          <thead>
            <tr><th>البند</th><th className="num">الكمية التعاقدية</th>
                <th className="num">المنفَّذ</th><th className="num">النسبة المحسوبة</th>
                <th className="num">النسبة اليدوية</th><th className="num">القيمة المكتسبة</th>
                {canWrite && <th style={{ width: 300 }}>تسجيل إنجاز</th>}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const f = form[r.project_item_id] || {};
              const gap = r.manual_pct !== null && r.manual_pct !== undefined
                        && Math.abs(Number(r.manual_pct) - Number(r.computed_pct)) > 10;
              return (
                <tr key={r.project_item_id}>
                  <td>
                    {r.description_ar || '—'}
                    {!r.has_decision && (
                      <div><span className="pill bad" style={{ fontSize: 11 }}>بلا قرار تنفيذ</span></div>
                    )}
                  </td>
                  <td className="num">{fq(r.contract_qty)} {r.unit}</td>
                  <td className="num">{fq(r.qty_done)}</td>
                  <td className="num">
                    <span className={`pill ${Number(r.computed_pct) >= 100 ? 'ok' : ''}`}>
                      {Number(r.computed_pct).toFixed(1)}%
                    </span>
                  </td>
                  <td className="num">
                    {r.manual_pct !== null && r.manual_pct !== undefined ? (
                      <span className={`pill ${gap ? 'bad' : ''}`}>
                        {Number(r.manual_pct).toFixed(0)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="num">{money(r.earned_value)}</td>
                  {canWrite && (
                    <td>
                      <div className="rowsplit">
                        <input type="date" dir="ltr" value={f.date || ''}
                               onChange={(e) => setF(r.project_item_id, 'date', e.target.value)}
                               style={{ ...inp, width: 120 }} />
                        <input type="number" step="any" dir="ltr" placeholder="الكمية"
                               value={f.qty ?? ''}
                               onChange={(e) => setF(r.project_item_id, 'qty', e.target.value)}
                               style={{ ...inp, width: 80 }} />
                        <input type="number" step="any" dir="ltr" placeholder="نسبة %"
                               value={f.pct ?? ''}
                               onChange={(e) => setF(r.project_item_id, 'pct', e.target.value)}
                               style={{ ...inp, width: 70 }} />
                        <button className="btn" style={{ padding: '4px 9px', fontSize: 12.5 }}
                                onClick={() => record(r)}>تسجيل</button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section">
        <header>
          <h2>سجل التسجيلات</h2>
          <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
            القياس يُخطئ ويُعاد — كل تسجيل قابل للتعديل مع حفظ سببه
          </span>
        </header>
        {entries.length === 0 ? (
          <div className="empty"><h3>لا تسجيلات</h3><p>سجّل أول إنجاز من الجدول أعلاه.</p></div>
        ) : (
          <table>
            <thead>
              <tr><th>التاريخ</th><th>البند</th><th className="num">الكمية</th>
                  <th className="num">النسبة</th><th>في مستخلص</th><th>ملاحظات</th>
                  {canWrite && <th style={{ width: 150 }}>—</th>}</tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const it = rows.find((r) => r.project_item_id === e.project_item_id);
                const c = e.claim_id ? claims[e.claim_id] : null;
                const editing = edit === e.id;
                return (
                  <tr key={e.id} style={editing ? { background: '#FBF6F5' } : undefined}>
                    <td className="mono">
                      {editing ? (
                        <input type="date" dir="ltr" value={draft.entry_date}
                               onChange={(ev) => setDraft({ ...draft, entry_date: ev.target.value })}
                               style={{ ...inp, width: 125 }} />
                      ) : dateAr(e.entry_date)}
                    </td>
                    <td>{it?.description_ar || '—'}</td>
                    <td className="num">
                      {editing ? (
                        <input type="number" step="any" dir="ltr" value={draft.qty_done}
                               onChange={(ev) => setDraft({ ...draft, qty_done: ev.target.value })}
                               style={{ ...inp, width: 85, textAlign: 'left' }} />
                      ) : fq(e.qty_done)}
                    </td>
                    <td className="num">
                      {editing ? (
                        <input type="number" step="any" dir="ltr" value={draft.manual_pct}
                               placeholder="—"
                               onChange={(ev) => setDraft({ ...draft, manual_pct: ev.target.value })}
                               style={{ ...inp, width: 65, textAlign: 'left' }} />
                      ) : (e.manual_pct ?? '—')}
                    </td>
                    <td>
                      {c ? (
                        <>
                          <span className="pill ok">{c.claim_no}</span>
                          <div style={{ fontSize: 10.5, color: '#8a8a8a' }}>
                            {STAGE_AR[c.status] || c.status}
                          </div>
                        </>
                      ) : (
                        <span className="pill warn">لم يُطالَب</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11.5, color: '#777', maxWidth: 260 }}>
                      {e.notes || '—'}
                    </td>
                    {canWrite && (
                      <td>
                        <div className="rowsplit">
                          {editing ? (
                            <>
                              <button className="btn" style={sm} disabled={busy}
                                      onClick={() => saveEdit(e)}>
                                {busy ? '…' : 'حفظ'}
                              </button>
                              <button className="btn ghost" style={sm}
                                      onClick={() => setEdit(null)}>إلغاء</button>
                            </>
                          ) : (
                            <>
                              <button className="btn ghost" style={sm}
                                      onClick={() => startEdit(e)}>تعديل</button>
                              <button className="btn ghost"
                                      style={{ ...sm, borderColor: '#EBC3C0', color: '#A32B24' }}
                                      onClick={() => delEntry(e)}>حذف</button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
