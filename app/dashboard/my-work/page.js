'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ConstitutionPage, PageHeader, Section, Notice, EmptyState } from '@/components/ui/ConstitutionUI';
import styles from './my-work.module.css';

const CLOSED = new Set(['completed','closed','cancelled']);
const STATUS_AR = {new:'جديد',received:'مستلم',in_progress:'قيد الإنجاز',waiting:'بانتظار إجراء',completed:'مكتمل',closed:'مغلق',cancelled:'ملغي'};
const TYPE_AR = {personal_task:'مهمة شخصية',task:'مهمة',request:'مراسلة / طلب'};
const PRIORITY_AR = {normal:'عادي',high:'مرتفع',urgent:'عاجل'};
const ROLE_AR = {assignee:'مسؤول التنفيذ',collaborator:'مشارك في التنفيذ',follower:'متابع'};
const SOURCE_AR = {today:'تواصل العمل',procedure:'إجراء نظامي'};
const SOURCE_FILTERS = [['today','تواصل العمل'],['procedure','إجراء نظامي'],['all','الكل']];
const EVENT_AR = {
  created:'إنشاء العمل',received:'استلام',started:'بدء التنفيذ',progress:'تحديث الإنجاز',waiting:'تعليق / انتظار',completed:'إكمال',closed:'إغلاق',reopened:'إعادة فتح',cancelled:'إلغاء',comment:'رسالة',participant_added:'إضافة مشارك',participant_removed:'إزالة مشارك',participant_role_changed:'تغيير دور مشارك',attachment_added:'رفع مرفق',attachment_removed:'حذف مرفق',document_created:'إضافة مستند',document_submitted:'إرسال مستند للاعتماد',document_approved:'اعتماد مستند',document_changes_requested:'طلب تعديل مستند',document_rejected:'رفض مستند'
};
const TABS = [
  ['today','اليوم'],['inbox','الوارد إليّ'],['mine','مهامي'],['created','أنشأتها'],['followup','المتابعة'],['completed','المكتملة'],['all','الكل']
];

function riyadhDay(value=new Date()){
  return new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Riyadh'}).format(value instanceof Date?value:new Date(value));
}
function fmtDate(value){
  if(!value)return '—';
  return new Intl.DateTimeFormat('ar-SA',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Riyadh'}).format(new Date(value));
}
function safeFileName(name){return String(name||'file').replace(/[^\w.\-\u0600-\u06FF]+/g,'_').slice(-120);}
function bytes(n){const v=Number(n||0);if(v<1024)return `${v} B`;if(v<1024*1024)return `${(v/1024).toFixed(1)} KB`;return `${(v/1024/1024).toFixed(1)} MB`;}
function sourceLabel(task){
  if(task?.work_source==='procedure')return task.source_label?`إجراء نظامي · ${task.source_label}`:'إجراء نظامي';
  return 'تواصل العمل';
}

export default function MyWorkPage(){
  const [state,setState]=useState(null);
  const [err,setErr]=useState('');
  const [msg,setMsg]=useState('');
  const [tab,setTab]=useState('today');
  const [sourceFilter,setSourceFilter]=useState('today');
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [createOpen,setCreateOpen]=useState(false);
  const [busy,setBusy]=useState('');
  const [comment,setComment]=useState('');
  const [progress,setProgress]=useState(0);
  const [participantUser,setParticipantUser]=useState('');
  const [participantRole,setParticipantRole]=useState('collaborator');
  const [linkDocId,setLinkDocId]=useState('');
  const [approvalTargets,setApprovalTargets]=useState({});
  const [form,setForm]=useState({type:'personal_task',title:'',description:'',assignee:'',priority:'normal',dueAt:'',projectId:'',collaborators:[],followers:[]});

  const load = useCallback(async (keep=true)=>{
    setErr('');
    const session=(await supabase.auth.getSession()).data.session;
    if(!session)return;
    const uid=session.user.id;
    const [userQ,tasksQ,peopleQ,projectsQ,notificationsQ,documentsQ]=await Promise.all([
      supabase.from('app_users').select('employees(full_name_ar,job_title)').eq('id',uid).maybeSingle(),
      supabase.from('workspace_tasks').select('id,task_type,title,description,creator_user_id,assignee_user_id,status,priority,progress,due_at,project_id,received_at,started_at,completed_at,closed_at,created_at,updated_at,last_activity_at,work_source,source_portal_key,target_portal_key,source_route,source_label,projects(id,project_no,name_ar)').order('last_activity_at',{ascending:false}).limit(250),
      supabase.rpc('fn_workspace_people_directory'),
      supabase.from('projects').select('id,project_no,name_ar').order('project_no'),
      supabase.from('notifications').select('id,title,body,link,severity,is_read,created_at').order('created_at',{ascending:false}).limit(50),
      supabase.from('documents').select('id,doc_number,template_code,subject,status,workspace_task_id,internal_approval_status,created_by,created_at').order('created_at',{ascending:false}).limit(200),
    ]);
    const tasks=tasksQ.data||[];
    const ids=tasks.map(t=>t.id);
    let participants=[],events=[],attachments=[],approvals=[];
    if(ids.length){
      const [pQ,eQ,aQ,apQ]=await Promise.all([
        supabase.from('workspace_task_participants').select('task_id,user_id,participant_role,added_by,created_at').in('task_id',ids),
        supabase.from('workspace_task_events').select('id,task_id,actor_user_id,event_type,from_status,to_status,progress,note,created_at,subject_user_id,document_id').in('task_id',ids).order('created_at',{ascending:true}).limit(2000),
        supabase.from('workspace_task_attachments').select('id,task_id,storage_path,file_name,mime_type,file_size,uploaded_by,created_at').in('task_id',ids).order('created_at',{ascending:true}),
        supabase.from('workspace_document_approvals').select('id,task_id,document_id,requester_user_id,requester_name_snapshot,approver_user_id,approver_name_snapshot,status,request_note,decision_note,requested_at,decided_at').in('task_id',ids).order('requested_at',{ascending:false}),
      ]);
      participants=pQ.data||[];events=eQ.data||[];attachments=aQ.data||[];approvals=apQ.data||[];
      const secondaryErrors=[pQ.error,eQ.error,aQ.error,apQ.error].filter(Boolean);
      if(secondaryErrors.length)setErr('تعذر تحميل بعض تفاصيل تواصل العمل، بينما بقيت الأعمال الأساسية متاحة.');
    }
    const errors=[tasksQ.error,peopleQ.error,projectsQ.error].filter(Boolean);
    if(errors.length)setErr('تعذر تحميل بعض عناصر تواصل العمل وفق صلاحيات الحساب الحالية.');
    const next={uid,employee:userQ.data?.employees||null,tasks,people:peopleQ.data||[],projects:projectsQ.data||[],notifications:notificationsQ.data||[],documents:documentsQ.data||[],participants,events,attachments,approvals};
    setState(next);
    setSelectedId(current=>keep&&current&&tasks.some(t=>t.id===current)?current:(tasks[0]?.id||''));
  },[]);

  useEffect(()=>{load(false);},[load]);

  const peopleByUser=useMemo(()=>new Map((state?.people||[]).filter(p=>p.user_id).map(p=>[p.user_id,p])),[state]);
  const displayName=useCallback((id)=>id===state?.uid?(state?.employee?.full_name_ar||'أنا'):(peopleByUser.get(id)?.display_name||'مستخدم'),[state,peopleByUser]);

  const view=useMemo(()=>{
    if(!state)return null;
    const sourceTasks=sourceFilter==='all'?state.tasks:state.tasks.filter(t=>(t.work_source||'today')===sourceFilter);
    const today=riyadhDay();
    const active=sourceTasks.filter(t=>!CLOSED.has(t.status));
    const overdue=active.filter(t=>t.due_at&&riyadhDay(t.due_at)<today);
    const dueToday=active.filter(t=>t.due_at&&riyadhDay(t.due_at)===today);
    const incoming=sourceTasks.filter(t=>t.assignee_user_id===state.uid&&t.creator_user_id!==state.uid&&!CLOSED.has(t.status));
    const mine=sourceTasks.filter(t=>(t.task_type==='personal_task'||t.assignee_user_id===state.uid)&&!CLOSED.has(t.status));
    const created=sourceTasks.filter(t=>t.creator_user_id===state.uid);
    const followup=sourceTasks.filter(t=>!CLOSED.has(t.status)&&((t.creator_user_id===state.uid&&t.assignee_user_id!==state.uid)||t.status==='waiting'));
    const completed=sourceTasks.filter(t=>CLOSED.has(t.status));
    const todayRows=[...new Map([...overdue,...dueToday,...incoming.filter(t=>['new','received'].includes(t.status)),...mine.filter(t=>['in_progress','waiting'].includes(t.status))].map(t=>[t.id,t])).values()];
    return {todayRows,incoming,mine,created,followup,completed,all:sourceTasks,overdue,dueToday,unread:state.notifications.filter(n=>!n.is_read)};
  },[state,sourceFilter]);

  const selected=useMemo(()=>state?.tasks.find(t=>t.id===selectedId)||null,[state,selectedId]);
  const selectedParticipants=useMemo(()=>state?.participants.filter(p=>p.task_id===selectedId)||[],[state,selectedId]);
  const selectedEvents=useMemo(()=>state?.events.filter(e=>e.task_id===selectedId)||[],[state,selectedId]);
  const selectedAttachments=useMemo(()=>state?.attachments.filter(a=>a.task_id===selectedId)||[],[state,selectedId]);
  const selectedDocuments=useMemo(()=>state?.documents.filter(d=>d.workspace_task_id===selectedId)||[],[state,selectedId]);
  const selectedApprovals=useMemo(()=>state?.approvals.filter(a=>a.task_id===selectedId)||[],[state,selectedId]);
  const approvalByDoc=useMemo(()=>new Map(selectedApprovals.map(a=>[a.document_id,a])),[selectedApprovals]);
  const availableDocs=useMemo(()=>state?.documents.filter(d=>!d.workspace_task_id&&(d.created_by===state.uid||!d.created_by))||[],[state]);
  const currentParticipant=useMemo(()=>selectedParticipants.find(p=>p.user_id===state?.uid),[selectedParticipants,state]);
  const canWork=Boolean(selected&&(selected.assignee_user_id===state?.uid||currentParticipant?.participant_role==='collaborator'));
  const isCreator=Boolean(selected&&selected.creator_user_id===state?.uid);
  const canManagePeople=Boolean(selected&&selected.task_type!=='personal_task'&&(isCreator||selected.assignee_user_id===state?.uid));

  useEffect(()=>{setProgress(Number(selected?.progress||0));setComment('');setParticipantUser('');setLinkDocId('');},[selectedId,selected?.progress]);

  const rows=useMemo(()=>{
    if(!view)return[];
    let base=({today:view.todayRows,inbox:view.incoming,mine:view.mine,created:view.created,followup:view.followup,completed:view.completed,all:view.all})[tab]||[];
    const q=query.trim().toLowerCase();
    if(q)base=base.filter(t=>`${t.title||''} ${t.description||''} ${t.projects?.name_ar||''} ${TYPE_AR[t.task_type]||''} ${SOURCE_AR[t.work_source]||''} ${t.source_label||''}`.toLowerCase().includes(q));
    return base;
  },[view,tab,query]);

  useEffect(()=>{
    if(!rows.length){if(selectedId)setSelectedId('');return;}
    if(!rows.some(row=>row.id===selectedId))setSelectedId(rows[0].id);
  },[rows,selectedId]);

  async function createWork(e){
    e.preventDefault();setBusy('create');setErr('');setMsg('');
    try{
      if(form.type!=='personal_task'&&!form.assignee)throw new Error('اختر الشخص المرسل إليه.');
      const due=form.dueAt?new Date(form.dueAt).toISOString():null;
      const {data,error}=await supabase.rpc('fn_create_workspace_task',{
        p_task_type:form.type,p_title:form.title,p_description:form.description||null,
        p_assignee_user_id:form.type==='personal_task'?null:form.assignee,
        p_priority:form.priority,p_due_at:due,p_project_id:form.projectId||null,
        p_collaborator_ids:form.type==='personal_task'?[]:form.collaborators,
        p_follower_ids:form.type==='personal_task'?[]:form.followers,
      });
      if(error)throw error;
      setCreateOpen(false);setForm({type:'personal_task',title:'',description:'',assignee:'',priority:'normal',dueAt:'',projectId:'',collaborators:[],followers:[]});
      setMsg('تم إنشاء تواصل العمل وإضافته إلى صفحتك.');
      await load(false);if(data?.id)setSelectedId(data.id);
    }catch(ex){setErr(ex.message||'تعذر إنشاء العمل.');}
    setBusy('');
  }

  function toggleArray(key,id){setForm(c=>({...c,[key]:c[key].includes(id)?c[key].filter(x=>x!==id):[...c[key],id]}));}

  async function taskAction(action,note=null,forcedProgress=null){
    if(!selected)return;
    let actionNote=note;
    if(action==='wait'&&actionNote===null){actionNote=window.prompt('اكتب سبب الانتظار أو التعليق:');if(actionNote===null)return;}
    if(action==='cancel'&&actionNote===null){actionNote=window.prompt('سبب إلغاء العمل:');if(actionNote===null)return;}
    setBusy(`action-${action}`);setErr('');
    const {error}=await supabase.rpc('fn_workspace_task_action',{p_task_id:selected.id,p_action:action,p_note:actionNote||null,p_progress:forcedProgress});
    if(error)setErr(error.message);else{setMsg('تم تحديث العمل.');await load();}
    setBusy('');
  }

  async function saveProgress(){if(!selected)return;await taskAction('progress',null,Number(progress));}

  async function addComment(e){
    e.preventDefault();if(!selected||!comment.trim())return;setBusy('comment');setErr('');
    const text=comment.trim();
    const {error}=await supabase.rpc('fn_workspace_add_comment',{p_task_id:selected.id,p_note:text});
    if(error)setErr(error.message);else{setComment('');await load();}
    setBusy('');
  }

  async function manageParticipant(remove=false,userId=null,role=null){
    if(!selected)return;const target=userId||participantUser;if(!target)return;
    setBusy('people');setErr('');
    const {error}=await supabase.rpc('fn_workspace_manage_participant',{p_task_id:selected.id,p_user_id:target,p_role:role||participantRole,p_remove:remove});
    if(error)setErr(error.message);else{setParticipantUser('');await load();}
    setBusy('');
  }

  async function uploadFile(e){
    const file=e.target.files?.[0];e.target.value='';if(!file||!selected||!state)return;
    if(file.size>25*1024*1024){setErr('الحد الأقصى للملف 25 ميجابايت.');return;}
    setBusy('upload');setErr('');
    const path=`${selected.id}/${state.uid}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const up=await supabase.storage.from('workspace-files').upload(path,file,{upsert:false,contentType:file.type||undefined});
    if(up.error){setErr(up.error.message);setBusy('');return;}
    const ins=await supabase.from('workspace_task_attachments').insert({task_id:selected.id,storage_path:path,file_name:file.name,mime_type:file.type||null,file_size:file.size,uploaded_by:state.uid});
    if(ins.error){await supabase.storage.from('workspace-files').remove([path]);setErr(ins.error.message);}else{setMsg('تم رفع المرفق وحفظه داخل العمل.');await load();}
    setBusy('');
  }

  async function openAttachment(item){
    const {data,error}=await supabase.storage.from('workspace-files').createSignedUrl(item.storage_path,3600);
    if(error){setErr(error.message);return;}window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }

  async function deleteAttachment(item){
    if(!window.confirm(`حذف المرفق «${item.file_name}»؟`))return;
    setBusy('file-delete');setErr('');
    const del=await supabase.from('workspace_task_attachments').delete().eq('id',item.id);
    if(del.error)setErr(del.error.message);else{await supabase.storage.from('workspace-files').remove([item.storage_path]);await load();}
    setBusy('');
  }

  async function linkDocument(){
    if(!selected||!linkDocId)return;setBusy('link-doc');setErr('');
    const {error}=await supabase.from('documents').update({workspace_task_id:selected.id}).eq('id',linkDocId);
    if(error)setErr(error.message);else{setMsg('تم ربط المستند بهذا العمل.');setLinkDocId('');await load();}
    setBusy('');
  }

  async function requestApproval(doc){
    const approver=approvalTargets[doc.id];if(!approver){setErr('اختر الشخص المطلوب منه اعتماد المستند.');return;}
    const note=window.prompt('ملاحظة طلب الاعتماد (اختياري):')||null;
    setBusy(`approval-${doc.id}`);setErr('');
    const {error}=await supabase.rpc('fn_workspace_submit_document_for_approval',{p_document_id:doc.id,p_approver_user_id:approver,p_note:note});
    if(error)setErr(error.message);else{setMsg('أرسل المستند للاعتماد وأضيف إلى متابعة العمل.');await load();}
    setBusy('');
  }

  async function decideDocument(doc,decision){
    let note=null;if(decision!=='approved'){note=window.prompt(decision==='changes_requested'?'اكتب التعديلات المطلوبة:':'اكتب سبب الرفض:');if(note===null)return;}
    setBusy(`decision-${doc.id}`);setErr('');
    const {error}=await supabase.rpc('fn_workspace_decide_document',{p_document_id:doc.id,p_decision:decision,p_note:note});
    if(error)setErr(error.message);else{setMsg(decision==='approved'?'تم اعتماد المستند.':'تم تسجيل القرار وإعادته ضمن مسار المتابعة.');await load();}
    setBusy('');
  }

  if(!state||!view)return <ConstitutionPage><EmptyState title="جارٍ تجهيز تواصل العمل" description="يتم جمع مهامك وتوجيهاتك ومحادثاتك ومرفقاتك ضمن نطاقك المسموح."/></ConstitutionPage>;

  const activePeople=state.people.filter(p=>p.user_id&&p.account_active&&p.user_id!==state.uid);
  const selectablePeople=activePeople.filter(p=>p.user_id!==selected?.assignee_user_id&&!selectedParticipants.some(x=>x.user_id===p.user_id));

  return <ConstitutionPage>
    <PageHeader eyebrow="WORK COMMUNICATION" title="تواصل العمل" description="المهام والتوجيهات والمراسلات اليومية بين الزملاء والإدارات. الإجراءات النظامية القادمة من البوابات تبقى مميزة بمصدرها ولا تختلط افتراضيًا بعدادات العمل اليومي.">
      <button className="btn" onClick={()=>setCreateOpen(true)}>+ عمل جديد</button>
    </PageHeader>
    {err&&<Notice tone="warning">{err}</Notice>}
    {msg&&<Notice tone="success">{msg}</Notice>}

    <div className={styles.summary}>
      <div className={styles.summaryCard}><span>وارد نشط</span><strong>{view.incoming.length}</strong></div>
      <div className={styles.summaryCard}><span>مهامي النشطة</span><strong>{view.mine.length}</strong></div>
      <div className={styles.summaryCard}><span>متأخر</span><strong>{view.overdue.length}</strong></div>
      <div className={styles.summaryCard}><span>متابعة عند الآخرين</span><strong>{view.followup.filter(t=>t.creator_user_id===state.uid&&t.assignee_user_id!==state.uid).length}</strong></div>
    </div>

    <div className={styles.shell}>
      <Section title="قائمة الأعمال" description="المصدر الافتراضي تواصل العمل؛ ويمكن إظهار الأعمال الإجرائية عند الحاجة دون إدخالها في عدادات اليوم.">
        <div className={styles.toolbar}>
          <input className={styles.search} placeholder="ابحث في تواصل العمل…" value={query} onChange={e=>setQuery(e.target.value)}/>
          <select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)} aria-label="مصدر العمل">
            {SOURCE_FILTERS.map(([key,label])=><option key={key} value={key}>المصدر: {label}</option>)}
          </select>
          <button className="btn" onClick={()=>setCreateOpen(true)}>+ جديد</button>
        </div>
        <div className={styles.filters}>{TABS.map(([key,label])=><button key={key} className={`btn ${tab===key?'':'ghost'}`} onClick={()=>setTab(key)}>{label} ({({today:view.todayRows,inbox:view.incoming,mine:view.mine,created:view.created,followup:view.followup,completed:view.completed,all:view.all})[key]?.length||0})</button>)}</div>
        {rows.length===0?<EmptyState title="لا توجد أعمال هنا" description="غيّر المصدر أو التبويب، أو أنشئ مهمة أو توجيه عمل جديد."/>:<div className={styles.list}>{rows.map(task=><button key={task.id} className={`${styles.task} ${selectedId===task.id?styles.taskActive:''}`} onClick={()=>setSelectedId(task.id)}><div className={styles.taskTop}><div><div className={styles.taskTitle}>{task.title}</div><div className={styles.meta}><span>{TYPE_AR[task.task_type]||task.task_type}</span><span>{sourceLabel(task)}</span><span>{task.creator_user_id===state.uid?'أنشأتها أنا':`من: ${displayName(task.creator_user_id)}`}</span>{task.assignee_user_id&&task.assignee_user_id!==state.uid&&<span>إلى: {displayName(task.assignee_user_id)}</span>}</div></div><span className={styles.badge}>{STATUS_AR[task.status]||task.status}</span></div><div className={styles.progressTrack}><div className={styles.progressFill} style={{width:`${Math.max(0,Math.min(100,Number(task.progress||0)))}%`}}/></div><div className={styles.meta}><span>الإنجاز {task.progress||0}%</span><span>الأولوية {PRIORITY_AR[task.priority]||task.priority}</span>{task.due_at&&<span>الموعد {fmtDate(task.due_at)}</span>}{task.projects?.name_ar&&<span>{task.projects.name_ar}</span>}</div></button>)}</div>}
      </Section>

      <div className={styles.detail}>
        {!selected?<div className={styles.emptyDetail}><div><strong>اختر عملًا من القائمة</strong><div>ستظهر هنا المحادثة والتقدم والمرفقات والخطابات.</div></div></div>:<Section title={TYPE_AR[selected.task_type]||'عمل'} description={`آخر حركة ${fmtDate(selected.last_activity_at)}`}>
          <div className={styles.detailHead}><div><h2 className={styles.detailTitle}>{selected.title}</h2>{selected.description&&<div style={{lineHeight:1.8}}>{selected.description}</div>}<div className={styles.meta}><span className={styles.badge}>{STATUS_AR[selected.status]||selected.status}</span><span>{sourceLabel(selected)}</span><span>أنشأه: {displayName(selected.creator_user_id)}</span>{selected.assignee_user_id&&<span>المسؤول: {displayName(selected.assignee_user_id)}</span>}{selected.projects?.name_ar&&<span>المشروع: {selected.projects.name_ar}</span>}</div></div><div style={{minWidth:120,textAlign:'center'}}><div style={{fontSize:30,fontWeight:850}}>{selected.progress||0}%</div><div className={styles.muted}>نسبة الإنجاز</div></div></div>
          <div className={styles.progressTrack}><div className={styles.progressFill} style={{width:`${selected.progress||0}%`}}/></div>

          <div className={styles.actions}>
            {canWork&&selected.status==='new'&&<button className="btn ghost" onClick={()=>taskAction('receive')}>استلام</button>}
            {canWork&&['new','received','waiting'].includes(selected.status)&&<button className="btn" onClick={()=>taskAction('start')}>بدء التنفيذ</button>}
            {canWork&&['received','in_progress'].includes(selected.status)&&<button className="btn ghost" onClick={()=>taskAction('wait')}>بانتظار إجراء</button>}
            {canWork&&!CLOSED.has(selected.status)&&<button className="btn" onClick={()=>taskAction('complete')}>إكمال</button>}
            {isCreator&&selected.status==='completed'&&<button className="btn" onClick={()=>taskAction('close')}>إغلاق</button>}
            {isCreator&&['completed','closed'].includes(selected.status)&&<button className="btn ghost" onClick={()=>taskAction('reopen')}>إعادة فتح</button>}
            {isCreator&&!['closed','cancelled'].includes(selected.status)&&<button className="btn ghost" onClick={()=>taskAction('cancel')}>إلغاء</button>}
          </div>

          {canWork&&!CLOSED.has(selected.status)&&<div className={`${styles.pane} ${styles.sectionGap}`}><h3>تحديث الإنجاز</h3><div className={styles.two}><input type="range" min="0" max="99" value={progress} onChange={e=>setProgress(Number(e.target.value))}/><div className={styles.toolbar}><strong>{progress}%</strong><button className="btn ghost" onClick={saveProgress} disabled={busy==='action-progress'}>حفظ النسبة</button></div></div></div>}

          <div className={styles.columns}>
            <div>
              <div className={styles.pane}><h3>المحادثة وسجل الحركة</h3>{selectedEvents.length===0?<div className={styles.muted}>لا توجد حركة مسجلة بعد.</div>:<div className={styles.timeline}>{selectedEvents.map(ev=>ev.event_type==='comment'?<div key={ev.id} className={styles.eventComment}><div className={styles.eventHead}><strong>{displayName(ev.actor_user_id)}</strong><span>{fmtDate(ev.created_at)}</span></div><div style={{whiteSpace:'pre-wrap',lineHeight:1.7}}>{ev.note}</div></div>:<div key={ev.id} className={styles.event}><div className={styles.eventHead}><strong>{EVENT_AR[ev.event_type]||ev.event_type} · {displayName(ev.actor_user_id)}</strong><span>{fmtDate(ev.created_at)}</span></div>{ev.note&&<div>{ev.note}</div>}{typeof ev.progress==='number'&&ev.event_type==='progress'&&<div className={styles.muted}>الإنجاز: {ev.progress}%</div>}</div>)}</div>}
                <form onSubmit={addComment} className={styles.sectionGap}><div className="field"><label>اكتب رسالة أو تحديثًا</label><textarea rows="3" value={comment} onChange={e=>setComment(e.target.value)} placeholder="اكتب داخل سياق هذا العمل…" maxLength={4000}/></div><button className="btn" disabled={!comment.trim()||busy==='comment'}>{busy==='comment'?'جارٍ الإرسال…':'إرسال'}</button></form>
              </div>

              <div className={`${styles.pane} ${styles.sectionGap}`}><h3>المرفقات ورفع الخطابات</h3><div className={styles.toolbar}><label className="btn ghost" style={{cursor:'pointer'}}>{busy==='upload'?'جارٍ الرفع…':'رفع ملف أو خطاب'}<input type="file" hidden onChange={uploadFile} disabled={busy==='upload'}/></label><span className={styles.muted}>PDF، Word، صور أو أي ملف عمل حتى 25 MB.</span></div>{selectedAttachments.length===0?<div className={`${styles.muted} ${styles.sectionGap}`}>لا توجد مرفقات.</div>:<div className={`${styles.files} ${styles.sectionGap}`}>{selectedAttachments.map(file=><div key={file.id} className={styles.file}><div><strong>{file.file_name}</strong><div className={styles.muted}>{bytes(file.file_size)} · {fmtDate(file.created_at)} · {displayName(file.uploaded_by)}</div></div><div className={styles.toolbar}><button className="btn ghost" onClick={()=>openAttachment(file)}>فتح</button>{(file.uploaded_by===state.uid||isCreator)&&<button className="btn ghost" onClick={()=>deleteAttachment(file)}>حذف</button>}</div></div>)}</div>}</div>

              <div className={`${styles.pane} ${styles.sectionGap}`}><h3>المستندات والخطابات الرسمية</h3><div className={styles.toolbar}><Link className="btn ghost" href="/dashboard/documents">إنشاء / فتح مركز المستندات</Link>{isCreator&&availableDocs.length>0&&<><select value={linkDocId} onChange={e=>setLinkDocId(e.target.value)}><option value="">ربط مستند موجود</option>{availableDocs.map(d=><option key={d.id} value={d.id}>{d.doc_number||'مسودة'} — {d.subject||d.template_code}</option>)}</select><button className="btn ghost" onClick={linkDocument} disabled={!linkDocId||busy==='link-doc'}>ربط</button></>}</div>
                {selectedDocuments.length===0?<div className={`${styles.muted} ${styles.sectionGap}`}>لا يوجد مستند رسمي مرتبط بعد. يمكنك رفع خطاب كملف أعلاه أو إنشاء مستند من مركز المستندات ثم ربطه هنا.</div>:<div className={styles.sectionGap}>{selectedDocuments.map(doc=>{const ap=approvalByDoc.get(doc.id);return <div key={doc.id} className={styles.doc}><div className={styles.taskTop}><div><strong>{doc.subject||doc.template_code}</strong><div className={styles.muted}>{doc.doc_number||'مسودة'} · حالة المستند: {String(doc.status||'draft')} {doc.internal_approval_status?`· الاعتماد: ${doc.internal_approval_status}`:''}</div></div><div className={styles.toolbar}><Link className="btn ghost" href={`/dashboard/documents/edit/${doc.id}`}>فتح</Link><a className="btn ghost" href={`/print/${doc.id}`} target="_blank" rel="noreferrer">معاينة</a></div></div>
                  {ap&&<div className={`${styles.muted} ${styles.sectionGap}`}>طلب الاعتماد: {ap.status} · المطلوب من {displayName(ap.approver_user_id)}{ap.decision_note?` · ${ap.decision_note}`:''}</div>}
                  {isCreator&&ap?.status!=='pending'&&<div className={`${styles.toolbar} ${styles.sectionGap}`}><select value={approvalTargets[doc.id]||''} onChange={e=>setApprovalTargets(c=>({...c,[doc.id]:e.target.value}))}><option value="">اختر المعتمد</option>{activePeople.map(p=><option key={p.user_id} value={p.user_id}>{p.display_name}{p.job_title?` — ${p.job_title}`:''}</option>)}</select><button className="btn" onClick={()=>requestApproval(doc)}>طلب اعتماد</button></div>}
                  {ap?.status==='pending'&&ap.approver_user_id===state.uid&&<div className={`${styles.actions} ${styles.sectionGap}`}><button className="btn" onClick={()=>decideDocument(doc,'approved')}>اعتماد</button><button className="btn ghost" onClick={()=>decideDocument(doc,'changes_requested')}>طلب تعديل</button><button className="btn ghost" onClick={()=>decideDocument(doc,'rejected')}>رفض</button></div>}
                </div>})}</div>}
              </div>
            </div>

            <div>
              <div className={styles.pane}><h3>الأشخاص</h3><div className={styles.people}>{selected.assignee_user_id&&<div className={styles.person}><div><strong>{displayName(selected.assignee_user_id)}</strong><div className={styles.muted}>مسؤول التنفيذ</div></div></div>}{selectedParticipants.filter(p=>p.user_id!==selected.assignee_user_id).map(p=><div key={`${p.user_id}-${p.participant_role}`} className={styles.person}><div><strong>{displayName(p.user_id)}</strong><div className={styles.muted}>{ROLE_AR[p.participant_role]||p.participant_role}</div></div>{canManagePeople&&['collaborator','follower'].includes(p.participant_role)&&<button className="btn ghost" onClick={()=>manageParticipant(true,p.user_id,p.participant_role)}>إزالة</button>}</div>)}</div>
                {canManagePeople&&selectablePeople.length>0&&<div className={styles.sectionGap}><div className="field"><label>إضافة شخص</label><select value={participantUser} onChange={e=>setParticipantUser(e.target.value)}><option value="">اختر</option>{selectablePeople.map(p=><option key={p.user_id} value={p.user_id}>{p.display_name}{p.job_title?` — ${p.job_title}`:''}</option>)}</select></div><div className={styles.toolbar}><select value={participantRole} onChange={e=>setParticipantRole(e.target.value)}><option value="collaborator">مشارك في التنفيذ</option><option value="follower">متابع</option></select><button className="btn ghost" onClick={()=>manageParticipant(false)} disabled={!participantUser||busy==='people'}>إضافة</button></div></div>}
              </div>

              <div className={`${styles.pane} ${styles.sectionGap}`}><h3>تفاصيل العمل</h3><div className={styles.people}><div className={styles.person}><span>المصدر</span><strong>{sourceLabel(selected)}</strong></div><div className={styles.person}><span>النوع</span><strong>{TYPE_AR[selected.task_type]||selected.task_type}</strong></div><div className={styles.person}><span>الأولوية</span><strong>{PRIORITY_AR[selected.priority]||selected.priority}</strong></div><div className={styles.person}><span>الموعد</span><strong>{fmtDate(selected.due_at)}</strong></div><div className={styles.person}><span>تاريخ الإنشاء</span><strong>{fmtDate(selected.created_at)}</strong></div>{selected.received_at&&<div className={styles.person}><span>الاستلام</span><strong>{fmtDate(selected.received_at)}</strong></div>}{selected.started_at&&<div className={styles.person}><span>بدء التنفيذ</span><strong>{fmtDate(selected.started_at)}</strong></div>}</div></div>
            </div>
          </div>
        </Section>}
      </div>
    </div>

    {createOpen&&<div className={styles.dialogBackdrop} onMouseDown={()=>setCreateOpen(false)}><div className={styles.dialog} onMouseDown={e=>e.stopPropagation()}><div className={styles.dialogHead}><div><h2>عمل جديد</h2><div className={styles.muted}>مهمة لنفسك، مهمة لمستخدم آخر، أو مراسلة/طلب ضمن تواصل العمل اليومي.</div></div><button className={styles.close} onClick={()=>setCreateOpen(false)} aria-label="إغلاق">×</button></div><form onSubmit={createWork} className={styles.newForm}>
      <div className={styles.two}><div className="field"><label>النوع *</label><select value={form.type} onChange={e=>setForm({...form,type:e.target.value,assignee:'',collaborators:[],followers:[]})}><option value="personal_task">مهمة شخصية لنفسي</option><option value="task">مهمة لمستخدم</option><option value="request">مراسلة / طلب</option></select></div><div className="field"><label>الأولوية</label><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="normal">عادي</option><option value="high">مرتفع</option><option value="urgent">عاجل</option></select></div></div>
      <div className="field"><label>العنوان *</label><input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} maxLength={180}/></div>
      <div className="field"><label>التفاصيل</label><textarea rows="4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
      {form.type!=='personal_task'&&<div className="field"><label>إلى / مسؤول التنفيذ *</label><select required value={form.assignee} onChange={e=>setForm({...form,assignee:e.target.value,collaborators:form.collaborators.filter(id=>id!==e.target.value),followers:form.followers.filter(id=>id!==e.target.value)})}><option value="">اختر المستخدم</option>{activePeople.map(p=><option key={p.user_id} value={p.user_id}>{p.display_name}{p.job_title?` — ${p.job_title}`:''}</option>)}</select></div>}
      <div className={styles.two}><div className="field"><label>الموعد</label><input type="datetime-local" value={form.dueAt} onChange={e=>setForm({...form,dueAt:e.target.value})}/></div><div className="field"><label>المشروع (اختياري)</label><select value={form.projectId} onChange={e=>setForm({...form,projectId:e.target.value})}><option value="">بدون مشروع</option>{state.projects.map(p=><option key={p.id} value={p.id}>{p.project_no||'—'} — {p.name_ar}</option>)}</select></div></div>
      {form.type!=='personal_task'&&<><div><strong>مشاركون في التنفيذ</strong><div className={styles.muted}>يستطيعون تحديث الحالة والإنجاز والمشاركة في المحادثة.</div><div className={`${styles.checks} ${styles.sectionGap}`}>{activePeople.filter(p=>p.user_id!==form.assignee).map(p=><label key={p.user_id} className={styles.check}><input type="checkbox" checked={form.collaborators.includes(p.user_id)} onChange={()=>toggleArray('collaborators',p.user_id)}/><span>{p.display_name}<small style={{display:'block',opacity:.65}}>{p.job_title||p.department||''}</small></span></label>)}</div></div><div><strong>متابعون</strong><div className={styles.muted}>يطلعون على العمل والمحادثة دون مسؤولية تنفيذ مباشرة.</div><div className={`${styles.checks} ${styles.sectionGap}`}>{activePeople.filter(p=>p.user_id!==form.assignee&&!form.collaborators.includes(p.user_id)).map(p=><label key={p.user_id} className={styles.check}><input type="checkbox" checked={form.followers.includes(p.user_id)} onChange={()=>toggleArray('followers',p.user_id)}/><span>{p.display_name}<small style={{display:'block',opacity:.65}}>{p.job_title||p.department||''}</small></span></label>)}</div></div></>}
      <div className={styles.toolbar}><button className="btn" disabled={busy==='create'}>{busy==='create'?'جارٍ الإنشاء…':'إنشاء العمل'}</button><button type="button" className="btn ghost" onClick={()=>setCreateOpen(false)}>إلغاء</button></div>
    </form></div></div>}
  </ConstitutionPage>;
}
