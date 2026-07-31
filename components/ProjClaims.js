'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money, dateAr } from '@/lib/format';
import { CLAIM_AR, CLAIM_CLASS } from '@/lib/projects';

export default function ProjClaims({ project, canWrite, onChange }) {
  const [rows, setRows] = useState(null);
  const [lines, setLines] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const { data: c } = await supabase.from('progress_claims')
      .select('*').eq('project_id', project.id).order('seq_no');
    const ids = (c || []).map((x) => x.id);
    const { data: l } = ids.length
      ? await supabase.from('claim_lines').select('*').in('claim_id', ids)
      : { data: [] };
    setRows(c || []); setLines(l || []); onChange?.();
  }

  useEffect(() => { load(); }, [project.id]);

  // إنشاء مستخلص من الإنجاز غير المطالَب به
  async function createClaim() {
    setErr(''); setMsg(''); setBusy(true);
    try {
      const { data: items } = await supabase.from('project_items')
        .select('id, sell_price, description_ar').eq('project_id', project.id).eq('kind','item');
      const ids = (items || []).map((i) => i.id);
      if (!ids.length) throw new Error('لا بنود في هذا المشروع');

      const { data: ent } = await supabase.from('progress_entries')
        .select('*').in('project_item_id', ids).eq('claimed', false);
      if (!ent?.length) throw new Error('لا إنجاز غير مُطالَب به');

      const seq = (rows.length ? Math.max(...rows.map((r)=>r.seq_no)) : 0) + 1;
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

      const prevCum = rows.reduce((t,r) => t + Number(r.gross_amount || 0), 0);
      const retention = Math.round(gross * Number(project.retention_pct || 0) * 100) / 100;
      const dates = ent.map((e) => e.entry_date).sort();

      const { data: claim, error: e2 } = await supabase.from('progress_claims').insert({
        project_id: project.id, claim_no: no.data, seq_no: seq,
        period_from: dates[0], period_to: dates[dates.length - 1],
        gross_amount: Math.round(gross * 100) / 100,
        prev_cumulative: prevCum,
        retention_amount: retention,
        vat_amount: 0,
        status: 'draft',
      }).select('id').single();
      if (e2) throw new Error(e2.message);

      const { error: e3 } = await supabase.from('claim_lines')
        .insert(lineRows.map((l) => ({ ...l, claim_id: claim.id })));
      if (e3) throw new Error(e3.message);

      await supabase.from('progress_entries')
        .update({ claimed: true, claim_id: claim.id })
        .in('id', ent.map((e) => e.id));

      setMsg(`أُنشئ المستخلص ${no.data} بقيمة ${money(gross)}`);
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function advance(claim, to) {
    let ref = null, amount = null;
    if (to === 'owner_approved') ref = window.prompt('مرجع اعتماد المالك (اختياري):') ?? null;
    if (to === 'invoiced') ref = window.prompt('رقم الفاتورة:') ?? null;
    if (to === 'collected') {
      const v = window.prompt('المبلغ المحصَّل:', String(claim.net_payable));
      if (v === null) return;
      amount = Number(v);
    }
    setErr(''); setMsg('');
    const { error } = await supabase.rpc('advance_claim',
      { p_claim: claim.id, p_to: to, p_ref: ref, p_amount: amount });
    if (error) { setErr(error.message); return; }
    setMsg('حُدّثت حالة المستخلص'); load();
  }

  async function upd(id, fields) {
    const { error } = await supabase.from('progress_claims').update(fields).eq('id', id);
    if (error) setErr(error.message); else load();
  }

  async function del(claim) {
    if (!window.confirm(`حذف ${claim.claim_no}؟ سيعود إنجازه قابلاً للمطالبة.`)) return;
    await supabase.from('progress_entries')
      .update({ claimed: false, claim_id: null }).eq('claim_id', claim.id);
    const { error } = await supabase.from('progress_claims').delete().eq('id', claim.id);
    if (error) setErr(error.message); else { setMsg('حُذف المستخلص'); load(); }
  }

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const NEXT = {
    draft: ['submitted','تقديم للمالك'],
    submitted: ['owner_approved','تسجيل اعتماد المالك'],
    owner_approved: ['invoiced','إصدار الفاتورة'],
    invoiced: ['collected','تسجيل التحصيل'],
  };

  return (
    <>
      {err && <div className="msg err" style={{marginBottom:12}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:12}}>{msg}</div>}

      {canWrite && (
        <div className="rowsplit" style={{marginBottom:12}}>
          <button className="btn" onClick={createClaim} disabled={busy}>
            {busy ? 'جارٍ…' : 'مستخلص جديد من الإنجاز'}
          </button>
          <span style={{fontSize:13,color:'var(--ink-soft)'}}>
            يجمع كل إنجاز لم يُطالَب به ويحسب المحتجزات بنسبة
            {' '}{(Number(project.retention_pct||0)*100).toFixed(0)}٪
          </span>
        </div>
      )}

      <div className="section" style={{marginTop:0,overflowX:'auto'}}>
        <table>
          <thead>
            <tr><th>الرقم</th><th>الفترة</th><th className="num">قيمة الأعمال</th>
                <th className="num">محتجزات</th><th className="num">استرداد مقدمة</th>
                <th className="num">الصافي</th><th>الحالة</th>
                <th>الاستحقاق</th><th style={{width:230}}>الإجراءات</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const nx = NEXT[c.status];
              const late = c.due_date && !c.collected_at
                        && new Date(c.due_date) < new Date();
              return (
                <tr key={c.id}>
                  <td className="mono">{c.claim_no}</td>
                  <td className="mono" style={{fontSize:12.5}}>
                    {dateAr(c.period_from)} — {dateAr(c.period_to)}
                  </td>
                  <td className="num">{money(c.gross_amount)}</td>
                  <td className="num">
                    {canWrite && c.status === 'draft' ? (
                      <input type="number" step="0.01" dir="ltr" defaultValue={c.retention_amount}
                             onBlur={(e)=>upd(c.id,{retention_amount:Number(e.target.value||0)})}
                             style={{width:90,border:'1px solid var(--hair)',padding:'3px',textAlign:'left'}} />
                    ) : money(c.retention_amount)}
                  </td>
                  <td className="num">
                    {canWrite && c.status === 'draft' ? (
                      <input type="number" step="0.01" dir="ltr" defaultValue={c.advance_recovery}
                             onBlur={(e)=>upd(c.id,{advance_recovery:Number(e.target.value||0)})}
                             style={{width:90,border:'1px solid var(--hair)',padding:'3px',textAlign:'left'}} />
                    ) : money(c.advance_recovery)}
                  </td>
                  <td className="num" style={{fontWeight:600}}>{money(c.net_payable)}</td>
                  <td>
                    <span className={`pill ${CLAIM_CLASS[c.status]}`}>{CLAIM_AR[c.status]}</span>
                    {c.invoice_no && (
                      <div className="mono" style={{fontSize:11.5,color:'var(--ink-soft)'}}>
                        {c.invoice_no}
                      </div>
                    )}
                  </td>
                  <td className="mono" style={{fontSize:12.5}}>
                    {c.due_date ? (
                      <span className={late ? 'pill bad' : ''}>{dateAr(c.due_date)}</span>
                    ) : '—'}
                  </td>
                  <td>
                    <div className="rowsplit">
                      {canWrite && nx && (
                        <button className="btn" style={{padding:'4px 9px',fontSize:12.5}}
                                onClick={()=>advance(c, nx[0])}>{nx[1]}</button>
                      )}
                      {canWrite && c.status === 'draft' && (
                        <button className="btn ghost" style={{padding:'4px 9px',fontSize:12.5,
                                        borderColor:'#EBC3C0',color:'#A32B24'}}
                                onClick={()=>del(c)}>حذف</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9}>
                <div className="empty"><h3>لا مستخلصات</h3>
                  <p>سجّل إنجازاً في تبويب الإنجاز ثم أنشئ مستخلصاً منه.</p></div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
