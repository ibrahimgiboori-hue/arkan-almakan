'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Notice } from '@/components/ui/ConstitutionUI';
import QuoteEditorAssistant from '@/components/quotes/QuoteEditorAssistant';
import QuoteCellLineBreakShortcut from '@/components/quotes/QuoteCellLineBreakShortcut';

function copyFor(state) {
  if (!state) return { title:'جاري قراءة مسار المعاملة…', detail:'' };
  if (state.external_status === 'sent') return { title:'أُرسل العرض إلى العميل', detail:'المراجعة الداخلية مكتملة، والمرحلة الحالية خارجية لدى العميل.' };
  if (state.external_status === 'accepted') return { title:'قبِل العميل العرض', detail:'انتهت دورة عرض السعر ويمكن متابعة التحويل إلى مشروع عند الحاجة.' };
  if (state.external_status === 'rejected') return { title:'رفض العميل العرض', detail:'هذه نتيجة خارجية ولا تعني رفضًا داخليًا من المالية.' };
  if (!state.workflow_id) return { title:'مسودة لدى المشاريع', detail:'يمكنك استكمال العرض. عند الجاهزية أرسله للمراجعة المالية قبل إرساله للعميل.' };
  if (state.workflow_status === 'pending') return { title:`أُرسل إلى ${state.target_group_label || 'المالية'} — بانتظار المراجعة`, detail:'أنت الآن في جهة المنشأ. القرار يتم من «أعمالي» لدى الجهة المستلمة، وليس من هذه الشاشة.' };
  if (state.workflow_status === 'approved') return { title:'تمت المراجعة المالية', detail:'العرض جاهز للإرسال إلى العميل. لا تظهر هنا أدوات اعتماد أو تسوية مالية.' };
  if (state.workflow_status === 'returned') return { title:'أُعيد للتعديل', detail:'راجع ملاحظات الإرجاع، عدّل العرض ثم أرسله للمراجعة من جديد.' };
  if (state.workflow_status === 'rejected') return { title:'رُفض داخليًا', detail:'يمكن تعديل المسودة ثم إعادة إرسالها إذا استدعى الأمر.' };
  return { title:'حالة المراجعة', detail:state.workflow_status || '' };
}

export default function QuoteApprovalLayout({ children }) {
  const { id } = useParams();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('fn_quotation_approval_state', { p_quote_id:id });
    if (error) setErr(error.message); else { setErr(''); setState(data || null); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.rpc('fn_submit_quotation_for_approval', { p_quote_id:id, p_note:null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg('أُرسل عرض السعر إلى المالية للمراجعة.');
    await load();
  }

  async function markSent() {
    setBusy(true); setErr(''); setMsg('');
    const { error } = await supabase.rpc('fn_quotation_set_status', { p_quote_id:id, p_status:'sent' });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMsg('سُجل إرسال العرض إلى العميل.');
    await load();
  }

  const copy = copyFor(state);
  const canSubmit = Boolean(state?.can_submit);
  const canMarkSent = state?.workflow_status === 'approved' && state?.external_status === 'draft';

  return <>
    <QuoteCellLineBreakShortcut />
    <QuoteEditorAssistant quoteId={id} />
    <div style={{marginBottom:16}} data-transaction-context="source">
      <Notice actions={<div className="rowsplit">
        <Link className="btn ghost" href={`/dashboard/quotes/${id}/terms`}>نصوص وشروط العرض</Link>
        {canSubmit ? <button className="btn" disabled={busy} onClick={submit}>إرسال للمراجعة المالية</button> : null}
        {canMarkSent ? <button className="btn" disabled={busy} onClick={markSent}>تسجيل الإرسال للعميل</button> : null}
      </div>}>
        <div style={{display:'grid',gap:5}}>
          <small style={{fontWeight:800}}>أنت الآن في: جهة المنشأ — المشاريع</small>
          <strong>{copy.title}</strong>
          {copy.detail ? <span style={{lineHeight:1.7}}>{copy.detail}</span> : null}
        </div>
      </Notice>
      {err ? <div className="msg err" style={{marginTop:8}}>{err}</div> : null}
      {msg ? <div className="msg ok" style={{marginTop:8}}>{msg}</div> : null}
    </div>
    {children}
  </>;
}
