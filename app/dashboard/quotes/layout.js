'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { QSTATUS_AR } from '@/lib/quote-calc';
import { useDashboardSession } from '@/lib/dashboard-session-context';
import { canUseCapability } from '@/lib/access-ui';
import { publishGrandchildNavigationContext } from '@/lib/living-navigation';

const QUOTE_LIST_TABS = Object.freeze([
  Object.freeze({ key:'draft', label:'مسودات' }),
  Object.freeze({ key:'sent', label:'مرسلة' }),
  Object.freeze({ key:'accepted', label:'مقبولة' }),
  Object.freeze({ key:'rejected', label:'مرفوضة' }),
  Object.freeze({ key:'expired', label:'منتهية' }),
  Object.freeze({ key:'converted', label:'محوّلة' }),
]);

function clientKey(value) {
  return String(value || '').trim().toLocaleLowerCase('ar-SA') || '__unknown__';
}

function quoteDateValue(row) {
  const value = row?.quote_date || row?.created_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function groupsByClient(rows) {
  const byClient = new Map();
  rows.forEach((row) => {
    const key = clientKey(row.client_name);
    if (!byClient.has(key)) {
      byClient.set(key, {
        key,
        label:String(row.client_name || '').trim() || 'عميل غير محدد',
        latest:quoteDateValue(row),
        items:[],
      });
    }
    const group = byClient.get(key);
    group.latest = Math.max(group.latest, quoteDateValue(row));
    group.items.push({
      id:row.id,
      label:row.quote_no || 'عرض بلا رقم',
      meta:row.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر',
      href:`/dashboard/quotes/${row.id}`,
    });
  });

  return [...byClient.values()]
    .sort((a,b)=>b.latest-a.latest)
    .map(({latest,...group})=>({
      ...group,
      items:[...group.items].sort((a,b)=>{
        const ar=rows.find((row)=>row.id===a.id);
        const br=rows.find((row)=>row.id===b.id);
        return quoteDateValue(br)-quoteDateValue(ar);
      }),
    }));
}

export default function QuotesLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useDashboardSession();
  const [rows, setRows] = useState([]);
  const [actionBusy, setActionBusy] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const canCreate = canUseCapability(session,'projects.quotes.create','all');
  const canEdit = canUseCapability(session,'projects.quotes.edit','all');
  const canCreateProject = canUseCapability(session,'projects.projects.create','all');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('quotations')
      .select('id,quote_no,doc_kind,client_name,status,quote_date,created_at')
      .order('created_at', { ascending:false })
      .limit(500);
    setRows(data || []);
  }, []);

  useEffect(() => { load(); }, [load, pathname]);

  const currentId = useMemo(() => {
    const match = String(pathname || '').match(/^\/dashboard\/quotes\/([^/]+)/);
    return match?.[1] || '';
  }, [pathname]);
  const currentQuote = useMemo(() => rows.find((row)=>String(row.id)===String(currentId)) || null, [currentId, rows]);

  const context = useMemo(() => {
    const sorted = [...rows].sort((a,b)=>quoteDateValue(b)-quoteDateValue(a));
    const tabs = QUOTE_LIST_TABS.map((tab) => {
      const tabRows = sorted.filter((row)=>row.status===tab.key);
      return {
        key:tab.key,
        label:tab.label,
        count:tabRows.length,
        groups:groupsByClient(tabRows),
      };
    }).filter((tab)=>tab.count>0);

    return {
      level:'grandchild',
      portalKey:'projects',
      toolKey:'quotes',
      scopePrefix:'/dashboard/quotes',
      title:'عروض الأسعار',
      classification:'status-then-client',
      tabs,
      defaultTabKey:currentQuote?.status || tabs[0]?.key || '',
      currentItemId:currentId,
      currentItemTabKey:currentQuote?.status || '',
    };
  }, [currentId, currentQuote, rows]);

  useEffect(() => {
    publishGrandchildNavigationContext(context);
  }, [context]);

  async function duplicateCurrent() {
    if (!currentQuote || !canCreate || !canEdit) return;
    setActionBusy('duplicate'); setActionError(''); setActionMessage('');
    const { data, error } = await supabase.rpc('duplicate_quotation', { p_id:currentQuote.id });
    setActionBusy('');
    if (error) { setActionError(error.message); return; }
    router.push(`/dashboard/quotes/${data}`);
  }

  async function convertCurrentToProject() {
    if (!currentQuote || !canEdit || !canCreateProject || currentQuote.status !== 'accepted') return;
    if (!window.confirm(`تحويل ${currentQuote.quote_no} إلى مشروع بكل بنوده؟`)) return;
    setActionBusy('project'); setActionError(''); setActionMessage('');
    const { error } = await supabase.rpc('quote_to_project', { p_quote:currentQuote.id });
    setActionBusy('');
    if (error) { setActionError(error.message); return; }
    setActionMessage('حُوّل العرض إلى مشروع.');
    await load();
  }

  async function deleteCurrent() {
    if (!currentQuote || !canEdit) return;
    if (!window.confirm(`حذف ${currentQuote.quote_no} وكل بنوده نهائياً؟`)) return;
    setActionBusy('delete'); setActionError(''); setActionMessage('');
    const { error } = await supabase.from('quotations').delete().eq('id', currentQuote.id);
    setActionBusy('');
    if (error) { setActionError('تعذّر الحذف: ' + error.message); return; }
    router.push('/dashboard/quotes');
  }

  const showSelectedActions = Boolean(currentQuote && currentId);

  return <div data-quote-work-boundary="grandchild-work-first">
    {showSelectedActions ? <div
      data-selected-quote-actions="true"
      style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',margin:'0 0 12px',padding:'7px 0',borderBottom:'1px solid var(--hair, #e8e4dc)'}}
    >
      <div style={{display:'grid',gap:2,minWidth:0}}>
        <strong style={{fontSize:12.5}}>{currentQuote.quote_no}</strong>
        <span style={{fontSize:11,color:'var(--ink-soft)'}}>{currentQuote.client_name || 'عميل غير محدد'} · {QSTATUS_AR[currentQuote.status] || currentQuote.status}</span>
      </div>
      <div className="rowsplit" style={{gap:8,flexWrap:'wrap'}}>
        <Link className="btn ghost" href={`/print/quote/${currentQuote.id}`} target="_blank">طباعة</Link>
        {canCreate && canEdit ? <button className="btn ghost" disabled={Boolean(actionBusy)} onClick={duplicateCurrent}>نسخ</button> : null}
        {canEdit && canCreateProject && currentQuote.status === 'accepted' ? <button className="btn ghost" disabled={Boolean(actionBusy)} data-action-consequence="consequential" onClick={convertCurrentToProject}>تحويل إلى مشروع</button> : null}
        {canEdit ? <button className="btn ghost" disabled={Boolean(actionBusy)} data-action-consequence="destructive" onClick={deleteCurrent}>حذف</button> : null}
      </div>
    </div> : null}
    {actionError ? <div className="msg err" style={{marginBottom:10}}>{actionError}</div> : null}
    {actionMessage ? <div className="msg ok" style={{marginBottom:10}}>{actionMessage}</div> : null}
    {children}
  </div>;
}
