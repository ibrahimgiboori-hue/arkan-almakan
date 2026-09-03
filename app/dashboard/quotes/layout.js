'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { QSTATUS_AR } from '@/lib/quote-calc';
import { publishGrandchildNavigationContext } from '@/lib/living-navigation';

function clientKey(value) {
  return String(value || '').trim().toLocaleLowerCase('ar-SA') || '__unknown__';
}

function quoteDateValue(row) {
  const value = row?.quote_date || row?.created_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export default function QuotesLayout({ children }) {
  const pathname = usePathname();
  const [rows, setRows] = useState([]);

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

  const context = useMemo(() => {
    const sorted = [...rows].sort((a,b)=>quoteDateValue(b)-quoteDateValue(a));
    const draftItems = sorted
      .filter((row)=>row.status === 'draft')
      .slice(0,6)
      .map((row)=>(
        {
          id:row.id,
          label:row.quote_no || 'عرض بلا رقم',
          meta:`${row.client_name || 'عميل غير محدد'} · ${QSTATUS_AR[row.status] || row.status}`,
          href:`/dashboard/quotes/${row.id}`,
        }
      ));

    const byClient = new Map();
    sorted.forEach((row) => {
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
        meta:`${row.doc_kind === 'boq' ? 'جدول كميات' : 'عرض سعر'} · ${QSTATUS_AR[row.status] || row.status}`,
        href:`/dashboard/quotes/${row.id}`,
      });
    });

    return {
      level:'grandchild',
      portalKey:'projects',
      toolKey:'quotes',
      scopePrefix:'/dashboard/quotes',
      title:'عروض الأسعار',
      primaryAction:{ label:'إنشاء عرض سعر', href:'/dashboard/quotes' },
      secondaryAction:{ label:'إنشاء جدول كميات', href:'/dashboard/quotes?new=boq' },
      priorityLabel:'قيد العمل',
      priorityItems:draftItems,
      historyLabel:'السجل حسب العميل',
      classification:'client',
      groups:[...byClient.values()]
        .sort((a,b)=>b.latest-a.latest)
        .map(({latest,...group})=>group),
      currentItemId:currentId,
    };
  }, [currentId, rows]);

  useEffect(() => {
    publishGrandchildNavigationContext(context);
  }, [context]);

  return children;
}
