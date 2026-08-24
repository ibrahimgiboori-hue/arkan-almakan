'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';

/* ============================================================
   مشكلة: الشاشة تقرأ الملخصات مرة واحدة، فأي تعديل لاحق
   يتغيّر في القاعدة ويبقى المعروض قديماً.

   الحل: قناة واحدة — كل كتابة تُعلن عن نفسها، وكل شاشة
   مفتوحة تُعيد قراءة ما يعنيها.
   ============================================================ */

const listeners = new Set();

// يُنادى بعد كل كتابة ناجحة
export function notifyChange(scope = 'all') {
  listeners.forEach((fn) => { try { fn(scope); } catch {} });
}

// تشترك به الشاشة لتُعيد القراءة عند أي تغيير
export function useLiveRefresh(reload, scopes = ['all']) {
  const ref = useRef(reload);
  ref.current = reload;

  useEffect(() => {
    const fn = (scope) => {
      if (scope === 'all' || scopes.includes(scope) || scopes.includes('all')) {
        ref.current?.();
      }
    };
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, [scopes.join(',')]);

  /*
    عروض الأسعار لديها الآن محرر نصوص منظم مستقل. حتى لا يبقى
    محرر الشروط القديم ظاهراً داخل تبويب «النصوص»، نوجّه التبويب
    نفسه إلى المحرر الجديد. الاستهداف محصور في صفحة عرض السعر فقط.
  */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const match = window.location.pathname.match(/^\/dashboard\/quotes\/([^/]+)\/?$/);
    if (!match) return;
    const quoteId = match[1];

    const onClick = (event) => {
      const button = event.target?.closest?.('.tabs button');
      if (!button) return;
      const text = (button.textContent || '').trim();
      if (text !== 'النصوص' && text !== 'محرر النصوص') return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(`/dashboard/quotes/${quoteId}/terms`);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
}

/* ------------------------------------------------------------
   غلاف حول supabase يُعلن تلقائياً بعد كل كتابة
   استعمله بدل supabase في عمليات update/insert/delete
   ------------------------------------------------------------ */
export const db = {
  async update(table, fields, matchCol, matchVal, scope = 'all') {
    const res = await supabase.from(table).update(fields).eq(matchCol, matchVal);
    if (!res.error) notifyChange(scope);
    return res;
  },
  async insert(table, rows, scope = 'all') {
    const res = await supabase.from(table).insert(rows).select();
    if (!res.error) notifyChange(scope);
    return res;
  },
  async remove(table, matchCol, matchVal, scope = 'all') {
    const res = await supabase.from(table).delete().eq(matchCol, matchVal);
    if (!res.error) notifyChange(scope);
    return res;
  },
  async rpc(fn, args, scope = 'all') {
    const res = await supabase.rpc(fn, args);
    if (!res.error) notifyChange(scope);
    return res;
  },
};

/* ------------------------------------------------------------
   حقل رقمي يحفظ عند الخروج ويُطلق التحديث
   ------------------------------------------------------------ */
export function useSaveField(table, id, scope = 'all') {
  const [saving, setSaving] = useState(false);
  const save = useCallback(async (col, value) => {
    setSaving(true);
    const res = await db.update(table, { [col]: value }, 'id', id, scope);
    setSaving(false);
    return res;
  }, [table, id, scope]);
  return { save, saving };
}
