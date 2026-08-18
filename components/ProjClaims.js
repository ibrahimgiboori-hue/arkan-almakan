'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { CLAIM_AR, CLAIM_CLASS } from '@/lib/projects';

const MAROON = '#8B3332';

// مراحل احتياطية تُستخدم إن تعذّر قراءة الجدول من القاعدة
const FALLBACK_STAGES = [
  { stage: 'draft',          seq: 1, name_ar: 'مسودة',        docs: [] },
  { stage: 'submitted',      seq: 2, name_ar: 'مقدَّم للمالك', docs: [] },
  { stage: 'owner_approved', seq: 3, name_ar: 'معتمد',         docs: [] },
  { stage: 'invoiced',       seq: 4, name_ar: 'مفوتر',         docs: [] },
  { stage: 'collected',      seq: 5, name_ar: 'محصَّل',         docs: [] },
];

const NEXT = {
  draft:          ['submitted',      'تقديم للمالك'],
  submitted:      ['owner_approved', 'تسجيل اعتماد المالك'],
  owner_approved: ['invoiced',       'إصدار الفاتورة'],
  invoiced:       ['collected',      'تسجيل التحصيل'],
};

export default function ProjClaims({ project, canWrite, onChange }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyDel, setBusyDel] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const [steps, setSteps] = useState([]);      // تعريف المراحل
  const [docs, setDocs] = useState({});        // claimId → [مرفقات]
  const [open, setOpen] = useState(null);      // المستخلص المفتوح سجلّه
  const [upl, setUpl] = useState(null);        // نافذة الرفع

  async function load() {
    const { data: c } = await supabase.from('progress_claims')
      .select('*').eq('project_id', project.id).order('seq_no');
    setRows(c || []);

    const ids = (c || []).map((x) => x.id);
    if (ids.length) {
      const { data: a } = await supabase.from('op_attachments')
        .select('*').eq('entity_type', 'claim').in('entity_id', ids)
        .order('created_at');
      const g = {};
      (a || []).forEach((x) => { (g[x.entity_id] = g[x.entity_id] || []).push(x); });
      setDocs(g);
    } else setDocs({});

    onChange?.();
  }

  useEffect(() => {
    (async () => {
      const [defs, dcs] = await Promise.all([
        supabase.from('claim_stage_defs').select('*').order('seq'),
        supabase.from('claim_stage_docs').select('*').order('seq'),
      ]);
      const byStage = {};
      (dcs.data || []).forEach((d) => { (byStage[d.stage] = byStage[d.stage] || []).push(d); });
      const built = (defs.data || []).map((s2) => ({ ...s2, docs: byStage[s2.stage] || [] }));
      setSteps(built.length ? built : FALLBACK_STAGES);
    })();
  }, []);

  useEffect(() => { load(); }, [project.id]);

  const stepOf = (st) => steps.find((s) => s.stage === st);
  const docsAt = (cid, st, code) => (docs[cid] || [])
    .filter((d) => d.stage === st && (!code || d.doc_code === code));

  // ما ينقص في المرحلة الحالية
  const lacking = (c) => {
    const st = steps.find((s2) => s2.stage === c.status);
    if (!st) return [];
    return (st.docs || []).filter((d) => d.required && docsAt(c.id, d.stage, d.code).length === 0);
  };

  // رابط الإصدار لكل مستند صادر
  const issueHref = (c, code) => {
    if (code === 'inv_request')  return `/print/claim/${c.id}?doc=memo`;
    if (code === 'claim_sheet')  return `/print/claim/${c.id}?doc=measure`;
    return `/print/claim/${c.id}?doc=demand`;
  };

  // ---------- إنشاء مستخلص ----------
  async function createClaim() {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const { data: items } = await supabase.from('project_items')
        .select('id, sell_price, description_ar')
        .eq('project_id', project.id).eq('kind', 'item');
      const ids = (items || []).map((i) => i.id);
      if (!ids.length) throw new Error('لا بنود في هذا المشروع');

      const { data: ent } = await supabase.from('progress_entries')
        .select('*').in('project_item_id', ids).eq('claimed', false);
      if (!ent?.length) throw new Error('لا إنجاز غير مُطالَب به');

      const seq = (rows.length ? Math.max(...rows.map((r) => r.seq_no)) : 0) + 1;
      const no = await supabase.rpc('next_document_number',
        { p_doc_type: 'CLAIM', p_prefix: 'CLM' });
      if (no.error) throw new Error(no.error.message);

      const byItem = {};
      ent.forEach((e) => {
        byItem[e.project_item_id] = (byItem[e.project_item_id] || 0) + Number(e.qty_done || 0);
      });

      let gross = 0;
      const lineRows = Object.entries(byItem).map(([itemId, q]) => {
        const it = items.find((i) => i.id === itemId);
        const price = Number(it?.sell_price || 0);
        gross += q * price;
        return { project_item_id: itemId, qty_this: q, unit_price: price };
      });

      const prevCum = rows.reduce((t, r) => t + Number(r.gross_amount || 0), 0);
      const retention = Math.round(gross * Number(project.retention_pct || 0) * 100) / 100;
      const dates = ent.map((e) => e.entry_date).sort();

      const { data: claim, error: e2 } = await supabase.from('progress_claims').insert({
        project_id: project.id, claim_no: no.data, seq_no: seq,
        period_from: dates[0], period_to: dates[dates.length - 1],
        gross_amount: Math.round(gross * 100) / 100,
        prev_cumulative: prevCum,
        retention_amount: retention,
        status: 'draft',
      }).select('id').single();
      if (e2) throw new Error(e2.message);

      const { error: e3 } = await supabase.from('claim_lines')
        .insert(lineRows.map((l) => ({ ...l, claim_id: claim.id })));
      if (e3) throw new Error(e3.message);

      await supabase.from('progress_entries')
        .update({ claimed: true, claim_id: claim.id })
        .in('id', ent.map((e) => e.id));

      setMsg(`أُنشئ المستخلص ${no.data} — اطبع الكشف ثم قدّمه`);
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  // ---------- توثيق المستند الصادر ----------
  async function markIssued(claim, doc) {
    const ref = window.prompt(`رقم أو مرجع «${doc.name_ar}» (اختياري):`) ?? '';
    const { error } = await supabase.from('op_attachments').insert({
      entity_type: 'claim', entity_id: claim.id, stage: doc.stage,
      doc_code: doc.code, direction: 'out', title: doc.name_ar,
      ref_no: ref || null, notes: 'صادر من النظام',
    });
    if (error) setErr(error.message);
    else { setMsg(`وُثّق إصدار ${doc.name_ar}`); load(); }
  }

  // ---------- رفع المستند الوارد ----------
  async function uploadDoc(claim, doc, file, ref, amount) {
    setBusy(true); setErr('');
    try {
      const safe = file.name.replace(/[^\w.\-]/g, '_');
      const path = `claims/${claim.id}/${doc.code}_${Date.now()}_${safe}`;
      const up = await supabase.storage.from('docs').upload(path, file);
      if (up.error) throw new Error(up.error.message);

      const { error } = await supabase.from('op_attachments').insert({
        entity_type: 'claim', entity_id: claim.id, stage: doc.stage,
        doc_code: doc.code, direction: doc.direction, title: doc.name_ar,
        file_path: path, ref_no: ref || null,
        amount: amount ? Number(amount) : null,
      });
      if (error) throw new Error(error.message);
      setMsg('رُفع المستند'); setUpl(null); load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function openFile(p) {
    const { data, error } = await supabase.storage.from('docs').createSignedUrl(p, 120);
    if (error) setErr(error.message); else window.open(data.signedUrl, '_blank');
  }

  async function delDoc(a) {
    if (!window.confirm('حذف هذا المستند من سجل المستخلص؟')) return;
    if (a.file_path) await supabase.storage.from('docs').remove([a.file_path]);
    const { error } = await supabase.from('op_attachments').delete().eq('id', a.id);
    if (error) setErr(error.message); else load();
  }

  // ---------- الانتقال للمرحلة التالية ----------
  async function advance(claim, to) {
    setErr(''); setMsg('');
    const chk = await supabase.rpc('claim_can_advance', { p_claim: claim.id });
    const r = Array.isArray(chk.data) ? chk.data[0] : chk.data;
    if (r && r.ok === false) { setErr(r.reason); setOpen(claim.id); return; }

    let ref = null, amount = null;
    if (to === 'owner_approved') ref = window.prompt('مرجع اعتماد المالك (اختياري):') ?? null;
    if (to === 'invoiced') ref = window.prompt('رقم الفاتورة:') ?? null;
    if (to === 'collected') {
      const v = window.prompt('المبلغ المحصَّل:', String(claim.net_payable));
      if (v === null) return;
      amount = Number(v);
    }
    const { error } = await supabase.rpc('advance_claim',
      { p_claim: claim.id, p_to: to, p_ref: ref, p_amount: amount });
    if (error) { setErr(error.message); return; }
    setMsg('حُدّثت حالة المستخلص'); load();
  }

  // الرجوع خطوة للخلف — القاعدة تسمح به لتصحيح الأخطاء
  async function goBack(claim) {
    const cur = stepOf(claim.status);
    if (!cur || cur.seq <= 1) { setErr('المستخلص في أول مرحلة'); return; }
    const prev = steps.find((x) => x.seq === cur.seq - 1);
    if (!prev) return;
    if (!window.confirm(
      `إرجاع ${claim.claim_no} من «${cur.name_ar}» إلى «${prev.name_ar}»؟\n` +
      'المستندات الموثّقة تبقى كما هي.')) return;

    setErr(''); setMsg('');
    const clear = {};
    if (cur.stage === 'collected')      Object.assign(clear, { collected_at: null, collected_amount: null });
    if (cur.stage === 'invoiced')       Object.assign(clear, { invoiced_at: null, invoice_no: null });
    if (cur.stage === 'owner_approved') Object.assign(clear, { owner_approved_at: null, owner_ref: null });
    if (cur.stage === 'submitted')      Object.assign(clear, { submitted_at: null });

    const { error } = await supabase.from('progress_claims')
      .update({ status: prev.stage, ...clear }).eq('id', claim.id);
    if (error) setErr(error.message);
    else { setMsg(`أُرجع إلى «${prev.name_ar}»`); load(); }
  }

  async function upd(id, fields) {
    const { error } = await supabase.from('progress_claims').update(fields).eq('id', id);
    if (error) setErr(error.message); else load();
  }

  // حذف من الجذور — متاح في أي مرحلة
  async function hardDelete(claim) {
    const typed = window.prompt(
      `حذف نهائي للمستخلص ${claim.claim_no} بكل مستنداته وبنوده.\n` +
      'الإنجاز سيعود قابلاً للمطالبة به من جديد.\n\n' +
      'اكتب: حذف');
    if (typed === null) return;
    if (typed.trim() !== 'حذف') { setErr('لم يُحذف — لم تُكتب كلمة التأكيد'); return; }

    setBusyDel(true); setErr(''); setMsg('');
    try {
      const { data, error } = await supabase.rpc('delete_claim_deep', { p_claim: claim.id });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      const files = row?.files || [];
      if (files.length) await supabase.storage.from('docs').remove(files);
      setMsg(`حُذف ${row?.deleted_no || claim.claim_no} نهائياً`);
      load();
    } catch (e) { setErr('تعذّر الحذف: ' + e.message); }
    setBusyDel(false);
  }

  async function del(claim) {
    if (!window.confirm(`حذف ${claim.claim_no}؟ سيعود إنجازه قابلاً للمطالبة.`)) return;
    await supabase.from('progress_entries')
      .update({ claimed: false, claim_id: null }).eq('claim_id', claim.id);
    await supabase.from('op_attachments')
      .delete().eq('entity_type', 'claim').eq('entity_id', claim.id);
    const { error } = await supabase.from('progress_claims').delete().eq('id', claim.id);
    if (error) setErr(error.message); else { setMsg('حُذف المستخلص'); load(); }
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  return (
    <>
      {err && <div className="msg err" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom: 12 }}>{msg}</div>}

      {canWrite && (
        <div className="rowsplit" style={{ marginBottom: 12 }}>
          <button className="btn" onClick={createClaim} disabled={busy}>
            {busy ? 'جارٍ…' : 'مستخلص جديد من الإنجاز'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            لا تنتقل مرحلة إلا بمستندها — صادر تُصدره أو وارد ترفعه
          </span>
        </div>
      )}

      <div className="section" style={{ marginTop: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr><th>الرقم</th><th>الفترة</th><th className="num">قيمة الأعمال</th>
                <th className="num">الوعاء</th><th className="num">الضريبة</th>
                <th className="num">محتجزات</th><th className="num">استرداد مقدمة</th>
                <th className="num">الصافي</th><th>الحالة</th>
                <th>التوثيق</th><th style={{ width: 280 }}>الإجراءات</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const nx = NEXT[c.status];
              const need = lacking(c);
              const ready = need.length === 0;
              const late = c.due_date && !c.collected_at && new Date(c.due_date) < new Date();

              return (
                <React.Fragment key={c.id}>
                <tr>
                  <td className="mono">{c.claim_no}</td>
                  <td className="mono" style={{ fontSize: 12.5 }}>
                    {dateAr(c.period_from)} — {dateAr(c.period_to)}
                  </td>
                  <td className="num">{money(c.gross_amount)}</td>
                  <td className="num">{money(c.taxable_base)}</td>
                  <td className="num" style={{ color: '#8B3332' }}>{money(c.vat_amount)}</td>
                  <td className="num">
                    {canWrite && c.status === 'draft' ? (
                      <input type="number" step="0.01" dir="ltr" defaultValue={c.retention_amount}
                             onBlur={(e) => upd(c.id, { retention_amount: Number(e.target.value || 0) })}
                             style={inp} />
                    ) : money(c.retention_amount)}
                  </td>
                  <td className="num">
                    {canWrite && c.status === 'draft' ? (
                      <input type="number" step="0.01" dir="ltr" defaultValue={c.advance_recovery}
                             onBlur={(e) => upd(c.id, { advance_recovery: Number(e.target.value || 0) })}
                             style={inp} />
                    ) : money(c.advance_recovery)}
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>{money(c.net_payable)}</td>
                  <td>
                    <span className={`pill ${CLAIM_CLASS[c.status] || ''}`}>
                      {stepOf(c.status)?.name_ar || CLAIM_AR[c.status] || c.status}
                    </span>
                    <div style={{ fontSize: 10.5, color: '#8a8a8a', marginTop: 2 }}>
                      المرحلة {stepOf(c.status)?.seq || '—'} من {steps.length || 5}
                    </div>
                    {c.invoice_no && (
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
                        {c.invoice_no}
                      </div>
                    )}
                  </td>
                  <td>
                    <button className="btn ghost" style={mini}
                            onClick={() => setOpen(open === c.id ? null : c.id)}>
                      {(docs[c.id] || []).length} مستند
                    </button>
                    {!ready && (
                      <div style={{ fontSize: 11, color: '#A32B24', marginTop: 3 }}>
                        ينقص {need.map((d) => d.name_ar).join(' و ')}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="rowsplit">
                      {c.status === 'draft' && (
                        <a className="btn ghost" style={mini} target="_blank" rel="noreferrer"
                           href={`/print/claim/${c.id}?doc=measure`}>محضر قياس</a>
                      )}
                      {['submitted','owner_approved','invoiced'].includes(c.status) && (
                        <a className="btn ghost" style={mini} target="_blank" rel="noreferrer"
                           href={`/print/claim/${c.id}?doc=demand`}>مطالبة مالية</a>
                      )}
                      {c.status === 'collected' && (
                        <>
                          <a className="btn ghost" style={mini} target="_blank" rel="noreferrer"
                             href={`/print/claim/${c.id}?doc=receipt`}>خطاب الاستلام</a>
                          <a className="btn ghost" style={mini} target="_blank" rel="noreferrer"
                             href={`/print/claim/${c.id}?doc=memo`}>مذكرة المحاسب</a>
                        </>
                      )}
                      {canWrite && nx && (
                        <button className="btn" style={{ ...mini,
                                  opacity: ready ? 1 : .5 }}
                                title={ready ? '' : `يلزم ${need.map((d)=>d.name_ar).join(' و ')}`}
                                onClick={() => advance(c, nx[0])}>{nx[1]}</button>
                      )}
                      {canWrite && c.status !== 'draft' && (
                        <button className="btn ghost" style={mini}
                                title="إرجاع المستخلص خطوة للخلف"
                                onClick={() => goBack(c)}>رجوع خطوة</button>
                      )}
                      {canWrite && (
                        <button className="btn ghost" disabled={busyDel}
                                style={{ ...mini, borderColor: '#EBC3C0', color: '#A32B24' }}
                                title="حذف نهائي بكل المستندات"
                                onClick={() => hardDelete(c)}>
                          {busyDel ? 'جارٍ…' : 'حذف نهائي'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {open === c.id && (
                  <tr>
                    <td colSpan={11} style={{ background: '#FCFAFA', padding: '10px 14px' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: MAROON, marginBottom: 8 }}>
                        سجل مستندات {c.claim_no}
                      </div>

                      {steps.map((st) => {
                        const isCur  = st.stage === c.status;
                        const passed = (stepOf(c.status)?.seq || 0) > st.seq;
                        return (
                          <div key={st.stage} style={{
                            padding: '8px 0', borderBottom: '1px solid #f1eded',
                            opacity: (isCur || passed) ? 1 : .45,
                          }}>
                            <div style={{
                              fontSize: 13, fontWeight: isCur ? 600 : 500,
                              color: isCur ? MAROON : '#444', marginBottom: 4,
                            }}>
                              {st.seq}. {st.name_ar}{isCur ? ' — المرحلة الحالية' : ''}
                            </div>

                            {(st.docs || []).map((d) => {
                              const list = docsAt(c.id, d.stage, d.code);
                              const lack = d.required && list.length === 0 && (isCur || passed);
                              return (
                                <div key={d.code} style={{
                                  display: 'flex', gap: 10, alignItems: 'flex-start',
                                  padding: '4px 0 4px 14px',
                                }}>
                                  <div style={{ minWidth: 210 }}>
                                    <span style={{ fontSize: 12.5 }}>
                                      {d.name_ar}
                                      {!d.required && (
                                        <span style={{ color: '#999', fontSize: 11 }}> (اختياري)</span>
                                      )}
                                    </span>
                                    <div style={{ fontSize: 10.5, color: '#8a8a8a' }}>
                                      {d.direction === 'out' ? 'يُصدره النظام' : 'يُرفع من خارج النظام'}
                                      {d.hint_ar ? ` · ${d.hint_ar}` : ''}
                                    </div>
                                  </div>

                                  <div style={{ flex: 1 }}>
                                    {list.length === 0 ? (
                                      <span style={{ fontSize: 12, color: lack ? '#A32B24' : '#aaa' }}>
                                        {lack ? 'مطلوب ولم يُوثَّق' : '—'}
                                      </span>
                                    ) : list.map((a) => (
                                      <div key={a.id} style={{ fontSize: 12, marginBottom: 2 }}>
                                        <span style={{ color: '#2E6B3A' }}>موثَّق</span>
                                        {a.ref_no && (
                                          <span className="mono" style={{ color: '#777' }}> · {a.ref_no}</span>
                                        )}
                                        <span style={{ color: '#999' }}> · {dateAr(a.doc_date)}</span>
                                        {a.file_path && (
                                          <button className="btn ghost" style={tiny}
                                                  onClick={() => openFile(a.file_path)}>فتح</button>
                                        )}
                                        {canWrite && (
                                          <button className="btn ghost" style={{ ...tiny, color: '#A32B24' }}
                                                  onClick={() => delDoc(a)}>حذف</button>
                                        )}
                                      </div>
                                    ))}
                                  </div>

                                  {canWrite && (isCur || passed) && (
                                    <div className="rowsplit">
                                      {d.direction === 'out' && (
                                        <>
                                          <a className="btn ghost" style={tiny} target="_blank"
                                             rel="noreferrer" href={issueHref(c, d.code)}>طباعة</a>
                                          <button className="btn ghost" style={tiny}
                                                  onClick={() => markIssued(c, d)}>توثيق الإصدار</button>
                                        </>
                                      )}
                                      <button className="btn ghost" style={tiny}
                                              onClick={() => setUpl({ claim: c, doc: d })}>
                                        رفع ملف
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={11}>
                <div className="empty"><h3>لا مستخلصات</h3>
                  <p>سجّل إنجازاً في تبويب الإنجاز ثم أنشئ مستخلصاً منه.</p></div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {upl && (
        <UploadBox
          step={upl.doc}
          busy={busy}
          onCancel={() => setUpl(null)}
          onSave={(f, ref, amt) => uploadDoc(upl.claim, upl.doc, f, ref, amt)}
        />
      )}
    </>
  );
}

function UploadBox({ step, busy, onCancel, onSave }) {
  const [file, setFile] = useState(null);
  const [ref, setRef] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} dir="rtl" style={{
        background: '#fff', borderRadius: 8, padding: 20, width: 420, maxWidth: '92vw',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: MAROON }}>
          {step?.name_ar || 'مستند'}
        </h3>
        <p style={{ fontSize: 12.5, color: '#777', margin: '0 0 14px' }}>
          {step?.hint_ar
            || (step?.direction === 'out'
                ? 'ارفع نسخة المستند الذي أصدرته وسلّمته'
                : 'ارفع المستند الوارد إثباتاً لهذه المرحلة')}
        </p>

        <div className="field" style={{ marginBottom: 10 }}>
          <label>الملف</label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>الرقم أو المرجع</label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>المبلغ (إن وُجد)</label>
          <input type="number" step="0.01" dir="ltr" value={amount}
                 onChange={(e) => setAmount(e.target.value)} />
        </div>

        <div className="rowsplit">
          <button className="btn" disabled={!file || busy}
                  onClick={() => onSave(file, ref, amount)}>
            {busy ? 'جارٍ الرفع…' : 'رفع وتوثيق'}
          </button>
          <button className="btn ghost" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

const inp   = { width: 90, border: '1px solid var(--hair)', padding: '3px', textAlign: 'left' };
const mini  = { padding: '4px 9px', fontSize: 12.5 };
const tiny  = { padding: '2px 8px', fontSize: 11.5, marginInlineStart: 6 };
