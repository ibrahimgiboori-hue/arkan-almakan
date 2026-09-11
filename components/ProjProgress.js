'use client';

import { useEffect, useState } from 'react';
import { money, qty as fq, dateAr } from '@/lib/format';
import { projectProgressService } from '@/lib/application/project-progress-service';
import {
  PROJECT_PROGRESS_CLAIM_STAGE_LABELS,
  progressClaimImpactMessage,
} from '@/lib/project-progress.mjs';

export default function ProjProgress({ projectId, canWrite, onChange }) {
  const [rows, setRows] = useState(null);
  const [entries, setEntries] = useState([]);
  const [claims, setClaims] = useState({});
  const [form, setForm] = useState({});
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    try {
      const workspace = await projectProgressService.loadWorkspace({ projectId });
      setRows(workspace.rows);
      setEntries(workspace.entries);
      setClaims(workspace.claims);
      onChange?.();
    } catch (error) {
      setErr('تعذّر تحميل الإنجاز: ' + (error?.message || error));
      setRows([]);
      setEntries([]);
      setClaims({});
    }
  }

  useEffect(() => { load(); }, [projectId]);

  async function record(item) {
    const value = form[item.project_item_id] || {};
    setErr('');
    setMsg('');
    try {
      await projectProgressService.record({ item, form:value });
      setMsg('سُجّل الإنجاز');
      setForm((current) => ({ ...current, [item.project_item_id]: {} }));
      await load();
    } catch (error) {
      setErr('تعذّر التسجيل: ' + (error?.message || error));
    }
  }

  function startEdit(entry) {
    setErr('');
    setMsg('');
    setEdit(entry.id);
    setDraft({
      entry_date: entry.entry_date || '',
      qty_done: entry.qty_done ?? '',
      manual_pct: entry.manual_pct ?? '',
      notes: entry.notes || '',
    });
  }

  function confirmKnownClaimImpact(entry, action='تعديل') {
    if (!entry.claim_id) return true;
    const claim = claims[entry.claim_id] || null;
    const intro = progressClaimImpactMessage(entry, claim) || 'هذا الإنجاز مرتبط بمستخلص.';
    return window.confirm(
      `${intro}\n` +
      `${action} الكمية سيغيّر قيمة ذلك المستخلص.\n\n` +
      (claim?.status === 'draft'
        ? 'المستخلص ما زال مسودة. متابعة؟'
        : 'المستخلص غادر المسودة أو حالته غير معروفة — راجع أثر التغيير على ما تم تقديمه. متابعة؟')
    );
  }

  async function retryAfterConcurrentClaimImpact(error, operation) {
    if (error?.code !== 'CLAIM_IMPACT_CONFIRM_REQUIRED') throw error;
    const impact = error.impact || {};
    const claimName = impact.claimNo || 'مستخلص مرتبط';
    const stage = impact.claimStageLabel ? ` — مرحلته «${impact.claimStageLabel}»` : '';
    const ok = window.confirm(
      `تغيّرت حالة تسجيل الإنجاز أثناء فتح الصفحة، وأصبح مرتبطًا بـ${claimName}${stage}.\n` +
      `${operation} سيؤثر على المستخلص. متابعة؟`
    );
    if (!ok) return false;
    return true;
  }

  async function saveEdit(entry) {
    const locallyLinked = Boolean(entry.claim_id);
    if (locallyLinked && !confirmKnownClaimImpact(entry, 'تعديل')) return;

    const reason = window.prompt(
      'سبب التعديل (يُحفظ مع السطر):',
      entry.notes ? '' : 'تصحيح قياس ميداني'
    ) ?? '';

    setBusy(true);
    setErr('');
    setMsg('');
    try {
      try {
        await projectProgressService.updateEntry({
          entryId:entry.id,
          draft,
          reason,
          acknowledgeClaimImpact:locallyLinked,
        });
      } catch (error) {
        const confirmed = await retryAfterConcurrentClaimImpact(error, 'التعديل');
        if (confirmed === false) { setBusy(false); return; }
        if (error?.code !== 'CLAIM_IMPACT_CONFIRM_REQUIRED') throw error;
        await projectProgressService.updateEntry({
          entryId:entry.id,
          draft,
          reason,
          acknowledgeClaimImpact:true,
        });
      }
      setMsg('عُدّل التسجيل' + (entry.claim_id ? ' — راجع قيمة المستخلص المرتبط' : ''));
      setEdit(null);
      await load();
    } catch (error) {
      setErr('تعذّر التعديل: ' + (error?.message || error));
    }
    setBusy(false);
  }

  async function delEntry(entry) {
    const locallyLinked = Boolean(entry.claim_id);
    const claim = locallyLinked ? claims[entry.claim_id] : null;
    const warning = locallyLinked
      ? `${progressClaimImpactMessage(entry, claim) || 'هذا الإنجاز مرتبط بمستخلص.'}\nحذفه ينقص قيمة ذلك المستخلص.\n\nحذف على أي حال؟`
      : 'حذف هذا التسجيل؟';
    if (!window.confirm(warning)) return;

    setBusy(true);
    setErr('');
    setMsg('');
    try {
      try {
        await projectProgressService.deleteEntry({
          entryId:entry.id,
          acknowledgeClaimImpact:locallyLinked,
        });
      } catch (error) {
        const confirmed = await retryAfterConcurrentClaimImpact(error, 'الحذف');
        if (confirmed === false) { setBusy(false); return; }
        if (error?.code !== 'CLAIM_IMPACT_CONFIRM_REQUIRED') throw error;
        await projectProgressService.deleteEntry({
          entryId:entry.id,
          acknowledgeClaimImpact:true,
        });
      }
      setMsg('حُذف التسجيل');
      await load();
    } catch (error) {
      setErr('تعذّر الحذف: ' + (error?.message || error));
    }
    setBusy(false);
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;
  if (rows.length === 0) return (
    <div className="section" style={{ marginTop: 0 }}>
      <div className="empty"><h3>لا بنود</h3><p>أضف بنود النطاق أولاً.</p></div>
    </div>
  );

  const setF = (id, key, value) => setForm((current) => ({ ...current, [id]: { ...(current[id] || {}), [key]: value } }));
  const inp = { border: '1px solid var(--hair)', padding: '3px', fontSize: 12.5 };
  const sm = { padding: '3px 8px', fontSize: 12 };

  return (
    <div data-project-progress-workspace="engineered-v1">
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
            {rows.map((row) => {
              const value = form[row.project_item_id] || {};
              const gap = row.manual_pct !== null && row.manual_pct !== undefined
                        && Math.abs(Number(row.manual_pct) - Number(row.computed_pct)) > 10;
              return (
                <tr key={row.project_item_id}>
                  <td>
                    {row.description_ar || '—'}
                    {!row.has_decision && (
                      <div><span className="pill bad" style={{ fontSize: 11 }}>بلا قرار تنفيذ</span></div>
                    )}
                  </td>
                  <td className="num">{fq(row.contract_qty)} {row.unit}</td>
                  <td className="num">{fq(row.qty_done)}</td>
                  <td className="num">
                    <span className={`pill ${Number(row.computed_pct) >= 100 ? 'ok' : ''}`}>
                      {Number(row.computed_pct).toFixed(1)}%
                    </span>
                  </td>
                  <td className="num">
                    {row.manual_pct !== null && row.manual_pct !== undefined ? (
                      <span className={`pill ${gap ? 'bad' : ''}`}>
                        {Number(row.manual_pct).toFixed(0)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="num">{money(row.earned_value)}</td>
                  {canWrite && (
                    <td>
                      <div className="rowsplit">
                        <input type="date" dir="ltr" value={value.date || ''}
                               onChange={(event) => setF(row.project_item_id, 'date', event.target.value)}
                               style={{ ...inp, width: 120 }} />
                        <input type="number" step="any" dir="ltr" placeholder="الكمية"
                               value={value.qty ?? ''}
                               onChange={(event) => setF(row.project_item_id, 'qty', event.target.value)}
                               style={{ ...inp, width: 80 }} />
                        <input type="number" step="any" dir="ltr" placeholder="نسبة %"
                               value={value.pct ?? ''}
                               onChange={(event) => setF(row.project_item_id, 'pct', event.target.value)}
                               style={{ ...inp, width: 70 }} />
                        <button className="btn" style={{ padding: '4px 9px', fontSize: 12.5 }}
                                onClick={() => record(row)}>تسجيل</button>
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
              {entries.map((entry) => {
                const item = rows.find((row) => row.project_item_id === entry.project_item_id);
                const claim = entry.claim_id ? claims[entry.claim_id] : null;
                const editing = edit === entry.id;
                return (
                  <tr key={entry.id} style={editing ? { background: '#FBF6F5' } : undefined}>
                    <td className="mono">
                      {editing ? (
                        <input type="date" dir="ltr" value={draft.entry_date}
                               onChange={(event) => setDraft({ ...draft, entry_date: event.target.value })}
                               style={{ ...inp, width: 125 }} />
                      ) : dateAr(entry.entry_date)}
                    </td>
                    <td>{item?.description_ar || '—'}</td>
                    <td className="num">
                      {editing ? (
                        <input type="number" step="any" dir="ltr" value={draft.qty_done}
                               onChange={(event) => setDraft({ ...draft, qty_done: event.target.value })}
                               style={{ ...inp, width: 85, textAlign: 'left' }} />
                      ) : fq(entry.qty_done)}
                    </td>
                    <td className="num">
                      {editing ? (
                        <input type="number" step="any" dir="ltr" value={draft.manual_pct}
                               placeholder="—"
                               onChange={(event) => setDraft({ ...draft, manual_pct: event.target.value })}
                               style={{ ...inp, width: 65, textAlign: 'left' }} />
                      ) : (entry.manual_pct ?? '—')}
                    </td>
                    <td>
                      {entry.claim_id ? (
                        <>
                          <span className="pill ok">{claim?.claim_no || 'مستخلص مرتبط'}</span>
                          <div style={{ fontSize: 10.5, color: '#8a8a8a' }}>
                            {claim ? (PROJECT_PROGRESS_CLAIM_STAGE_LABELS[claim.status] || claim.status) : 'الحالة تحتاج تحديثًا'}
                          </div>
                        </>
                      ) : (
                        <span className="pill warn">لم يُطالَب</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11.5, color: '#777', maxWidth: 260 }}>
                      {entry.notes || '—'}
                    </td>
                    {canWrite && (
                      <td>
                        <div className="rowsplit">
                          {editing ? (
                            <>
                              <button className="btn" style={sm} disabled={busy}
                                      onClick={() => saveEdit(entry)}>
                                {busy ? '…' : 'حفظ'}
                              </button>
                              <button className="btn ghost" style={sm}
                                      onClick={() => setEdit(null)}>إلغاء</button>
                            </>
                          ) : (
                            <>
                              <button className="btn ghost" style={sm}
                                      onClick={() => startEdit(entry)}>تعديل</button>
                              <button className="btn ghost"
                                      style={{ ...sm, borderColor: '#EBC3C0', color: '#A32B24' }}
                                      onClick={() => delEntry(entry)}>حذف</button>
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
    </div>
  );
}