'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  ActionDock,
  ConstitutionPage,
  EmptyState,
  Notice,
  RecordList,
  RecordRow,
  RecordSummary,
  Section,
  StatusChip,
  WorkField,
  WorkFormGrid,
} from '@/components/ui/ConstitutionUI';
import ConstitutionDialog from '@/components/ui/ConstitutionDialog';

const PORTALS=Object.freeze({
  projects:'المشاريع',workforce:'الموارد البشرية',finance:'المالية',documents:'المستندات',admin:'الإدارة',
});
const STATUS=Object.freeze({
  pending:'قيد الإجراء',returned:'معادة للتعديل',approved:'معتمدة',rejected:'مرفوضة',cancelled:'ملغاة',
  new:'جديد',received:'مستلم',in_progress:'قيد التنفيذ',waiting:'بانتظار إجراء',completed:'مكتمل',closed:'مغلق',
});

function flagFor(view){
  return view==='portal'?'is_portal':view==='sent'?'is_sent':view==='archive'?'is_archive':view==='cc'?'is_cc':'is_mine';
}
function displayOwner(row){return row.target_user_name||row.target_label||'الجهة المختصة';}
function statusTone(status){
  if(['approved','completed','closed'].includes(status))return 'success';
  if(['rejected','cancelled'].includes(status))return 'danger';
  if(['returned','waiting'].includes(status))return 'warning';
  if(['pending','new','received','in_progress'].includes(status))return 'info';
  return 'neutral';
}

export default function PortalWorkCenterPage(){
  const {portal}=useParams();
  const search=useSearchParams();
  const portalKey=String(portal||'');
  const projectId=search.get('project')||null;
  const requestedView=search.get('view')||'mine';
  const [rows,setRows]=useState(null);
  const [primary,setPrimary]=useState(false);
  const [view,setView]=useState(requestedView);
  const [error,setError]=useState('');
  const [composer,setComposer]=useState(null);
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    if(!PORTALS[portalKey])return;
    setError('');
    const [centerQ,primaryQ]=await Promise.all([
      supabase.rpc('fn_portal_work_center',{p_portal_key:portalKey,p_project_id:projectId}),
      supabase.rpc('fn_is_primary_user'),
    ]);
    setPrimary(primaryQ.data===true);
    if(centerQ.error){setRows([]);setError(centerQ.error.message||'تعذر تحميل مركز الإجراءات والاعتمادات.');return;}
    setRows(centerQ.data||[]);
  },[portalKey,projectId]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{setView(requestedView);},[requestedView]);
  useEffect(()=>{if(view==='cc'&&!primary)setView('mine');},[view,primary]);

  const countable=useMemo(()=>((rows||[]).filter(row=>row.item_kind==='approval'||!row.workflow_id)),[rows]);
  const counts=useMemo(()=>({
    mine:countable.filter(row=>row.is_mine).length,
    portal:countable.filter(row=>row.is_portal).length,
    sent:countable.filter(row=>row.is_sent).length,
    archive:(rows||[]).filter(row=>row.is_archive).length,
    cc:(rows||[]).length,
  }),[rows,countable]);
  const visible=useMemo(()=>{
    const flag=flagFor(view);
    return (rows||[]).filter(row=>Boolean(row[flag]));
  },[rows,view]);

  async function decide(row,decision){
    if(!row?.workflow_id)return;
    if((decision==='return'||decision==='reject')&&!note.trim()){
      setError('اكتب سبب الإرجاع أو الرفض قبل تنفيذ القرار.');return;
    }
    setBusy(true);setError('');setMessage('');
    const {error:rpcError}=await supabase.rpc('fn_approval_decide',{
      p_workflow_id:row.workflow_id,p_decision:decision,p_comment:note.trim()||null,
      p_next_user_id:null,p_next_capability:null,p_next_reason:null,
    });
    if(rpcError)setError(rpcError.message||'تعذر تنفيذ القرار.');
    else{setMessage('تم تسجيل الإجراء.');setComposer(null);setNote('');await load();}
    setBusy(false);
  }

  async function taskAction(row,action,actionNote=null){
    if(!row?.task_id)return;
    const preparedNote=typeof actionNote==='string'?actionNote.trim():null;
    if(action==='wait'&&!preparedNote){
      setError('اكتب سبب الانتظار أو التعليق قبل تنفيذ الإجراء.');
      return;
    }
    setBusy(true);setError('');setMessage('');
    const {error:rpcError}=await supabase.rpc('fn_workspace_task_action',{
      p_task_id:row.task_id,p_action:action,p_note:preparedNote||null,p_progress:null,
    });
    if(rpcError)setError(rpcError.message||'تعذر تنفيذ التكليف.');
    else{
      setMessage(action==='receive'?'تم استلام التكليف وأصبح مسندًا لك.':'تم تحديث التكليف.');
      setComposer(null);setNote('');await load();
    }
    setBusy(false);
  }

  async function sendInquiry(row){
    if(!row?.workflow_id)return;
    setBusy(true);setError('');setMessage('');
    const {error:rpcError}=await supabase.rpc('fn_create_approval_communication',{
      p_workflow_id:row.workflow_id,p_kind:'inquiry',p_note:note.trim()||null,
    });
    if(rpcError)setError(rpcError.message||'تعذر إرسال الاستفسار.');
    else{setMessage('تم فتح الاستفسار وإضافته إلى سجل الإجراء.');setComposer(null);setNote('');await load();}
    setBusy(false);
  }

  if(!PORTALS[portalKey])return <ConstitutionPage><EmptyState title="بوابة غير معروفة" description="لا يوجد مركز إجراءات لهذا المسار."/></ConstitutionPage>;
  if(rows===null)return <ConstitutionPage><EmptyState title="جارٍ تجهيز مركز الإجراءات والاعتمادات" description="نقرأ الاعتمادات والتكليفات الإجرائية المرتبطة بهذه البوابة."/></ConstitutionPage>;

  const tabs=[
    ['mine','ينتظر إجراءك',counts.mine],['portal','بانتظار البوابة',counts.portal],['sent','صادر منك',counts.sent],['archive','أرشيف إجراءاتي',counts.archive],
    ...(primary?[['cc','CC الإدارة',counts.cc]]:[]),
  ];

  const dialogTitle=!composer?'':composer.kind==='approve'?'اعتماد المعاملة':composer.kind==='return'?'إرجاع للتعديل':composer.kind==='reject'?'رفض المعاملة':composer.kind==='wait'?'تعليق التكليف مؤقتًا':'استفسار عن المعاملة';
  const noteRequired=Boolean(composer&&['return','reject','wait'].includes(composer.kind));

  return <ConstitutionPage>
    {error?<Notice tone="warning">{error}</Notice>:null}
    {message?<Notice tone="success">{message}</Notice>:null}
    <Section title={`مركز الإجراءات والاعتمادات — ${PORTALS[portalKey]}`} description={primary?'المستخدم الرئيسي يرى الحركة الحية والأرشيف كاملًا كنسخة CC؛ التنفيذ يبقى محكومًا بالمسند إليه والصلاحية.':'الوارد لك، الوارد للبوابة، الصادر منك، وأرشيف الإجراءات التي اتخذتها.'}>
      <div className="tabs" role="tablist" aria-label="نطاق المعاملات">
        {tabs.map(([key,label,count])=><button key={key} type="button" role="tab" aria-selected={view===key} onClick={()=>setView(key)}>{label} · {count}</button>)}
      </div>
      {visible.length===0?<EmptyState title="لا توجد معاملات مطابقة لهذا العرض" description="غيّر نطاق العرض أو عد لاحقًا عند وصول معاملة جديدة."/>:<RecordList label="المعاملات والإجراءات">
        {visible.map(row=><RecordRow
          key={`${row.item_kind}-${row.item_id}`}
          actions={<>
            {row.item_kind==='approval'&&row.can_act&&row.status==='pending'?<>
              <button className="btn" type="button" onClick={()=>{setComposer({kind:'approve',row});setNote('');}}>اعتماد</button>
              <button className="btn ghost" type="button" onClick={()=>{setComposer({kind:'return',row});setNote('');}}>إرجاع</button>
              <button className="btn ghost" type="button" onClick={()=>{setComposer({kind:'reject',row});setNote('');}}>رفض</button>
            </>:null}
            {row.item_kind==='approval'?<button className="btn ghost" type="button" onClick={()=>{setComposer({kind:'inquiry',row});setNote('');}}>استفسار</button>:null}
            {row.item_kind==='task'&&row.can_act&&row.status==='new'?<button className="btn" type="button" onClick={()=>taskAction(row,'receive')} disabled={busy}>استلام</button>:null}
            {row.item_kind==='task'&&row.can_act&&['new','received','waiting'].includes(row.status)&&!row.is_portal?<button className="btn ghost" type="button" onClick={()=>taskAction(row,'start')} disabled={busy}>بدء</button>:null}
            {row.item_kind==='task'&&row.can_act&&['received','in_progress'].includes(row.status)?<button className="btn ghost" type="button" onClick={()=>{setComposer({kind:'wait',row});setNote('');}} disabled={busy}>انتظار</button>:null}
            {row.item_kind==='task'&&row.can_act&&['received','in_progress','waiting'].includes(row.status)?<button className="btn" type="button" onClick={()=>taskAction(row,'complete')} disabled={busy}>إكمال</button>:null}
          </>}
        >
          <RecordSummary
            title={row.title||'معاملة'}
            kicker={row.reference_no||(row.item_kind==='task'?'تكليف إجرائي':'—')}
            meta={[row.action_label||'إجراء',displayOwner(row)]}
            note={row.note||'لا توجد ملاحظة مسجلة'}
          />
          <div data-record-statuses="true">
            <StatusChip tone={statusTone(row.status)}>{STATUS[row.status]||row.status||'—'}</StatusChip>
            {row.is_cc&&!row.can_act&&primary?<StatusChip>CC للمتابعة</StatusChip>:null}
          </div>
        </RecordRow>)}
      </RecordList>}
    </Section>

    <ConstitutionDialog
      open={Boolean(composer)}
      title={dialogTitle}
      description={composer?.row?.title||''}
      onClose={()=>{if(!busy){setComposer(null);setNote('');setError('');}}}
      size="compact"
      showBack={false}
    >
      <WorkFormGrid columns={12} label="ملاحظة الإجراء">
        <WorkField label={noteRequired?'السبب':'الملاحظة'} span={12} hint={noteRequired?'هذا البيان مطلوب لإكمال الإجراء.':'يمكن ترك الملاحظة فارغة.'}>
          <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={noteRequired?'اكتب السبب…':'ملاحظة اختيارية…'} autoFocus/>
        </WorkField>
      </WorkFormGrid>
      {error?<Notice tone="error">{error}</Notice>:null}
      <ActionDock>
        <button type="button" className="btn ghost" onClick={()=>{setComposer(null);setNote('');setError('');}} disabled={busy}>إلغاء</button>
        <button type="button" className="btn" disabled={busy||noteRequired&&!note.trim()} onClick={()=>composer.kind==='inquiry'?sendInquiry(composer.row):composer.kind==='wait'?taskAction(composer.row,'wait',note):decide(composer.row,composer.kind)}>{busy?'جارٍ التنفيذ…':'تنفيذ'}</button>
      </ActionDock>
    </ConstitutionDialog>
  </ConstitutionPage>;
}
