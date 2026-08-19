'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function OrgRoleFields({ value, onChange, fixedCategoryCode = null, disabled = false }) {
  const [categories, setCategories] = useState([]);
  const [positions, setPositions] = useState([]);
  const [titles, setTitles] = useState([]);
  const [links, setLinks] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, p, t, l] = await Promise.all([
        supabase.from('org_categories').select('id, code, name_ar, is_board, is_active, sort_order').eq('is_active', true).order('sort_order'),
        supabase.from('org_positions').select('id, category_id, code, name_ar, is_active, rank_order').eq('is_active', true).order('rank_order'),
        supabase.from('org_job_titles').select('id, code, name_ar, is_active, sort_order').eq('is_active', true).order('sort_order'),
        supabase.from('org_position_job_titles').select('position_id, job_title_id, is_active').eq('is_active', true),
      ]);
      if (!alive) return;
      const firstError = c.error || p.error || t.error || l.error;
      if (firstError) {
        setErr(firstError.message);
        return;
      }
      setCategories(c.data || []);
      setPositions(p.data || []);
      setTitles(t.data || []);
      setLinks(l.data || []);
    })();
    return () => { alive = false; };
  }, []);

  const fixedCategory = categories.find((c) => c.code === fixedCategoryCode) || null;
  const categoryId = fixedCategory?.id || value.org_category_id || '';

  useEffect(() => {
    if (!fixedCategory || value.org_category_id === fixedCategory.id) return;
    onChange({
      org_category_id: fixedCategory.id,
      org_position_id: '',
      org_job_title_id: '',
      department: value.department || '',
      board_role: '',
      job_title: '',
    });
  }, [fixedCategory?.id]);

  const categoryPositions = useMemo(
    () => positions.filter((p) => p.category_id === categoryId),
    [positions, categoryId]
  );

  const titleIds = useMemo(() => {
    if (!value.org_position_id) return new Set();
    return new Set(
      links.filter((l) => l.position_id === value.org_position_id).map((l) => l.job_title_id)
    );
  }, [links, value.org_position_id]);

  const allowedTitles = useMemo(() => {
    const mapped = titles.filter((t) => titleIds.has(t.id));
    const current = titles.find((t) => t.id === value.org_job_title_id);
    if (current && !mapped.some((t) => t.id === current.id)) return [current, ...mapped];
    return mapped;
  }, [titles, titleIds, value.org_job_title_id]);

  function changeCategory(id) {
    const category = categories.find((c) => c.id === id);
    onChange({
      org_category_id: id,
      org_position_id: '',
      org_job_title_id: '',
      department: category?.is_board ? value.department || '' : category?.name_ar || '',
      board_role: '',
      job_title: '',
    });
  }

  function changePosition(id) {
    const position = positions.find((p) => p.id === id);
    const category = categories.find((c) => c.id === categoryId);
    onChange({
      org_position_id: id,
      org_job_title_id: '',
      board_role: category?.is_board ? position?.name_ar || '' : value.board_role || '',
      job_title: '',
    });
  }

  function changeTitle(id) {
    const title = titles.find((t) => t.id === id);
    onChange({
      org_job_title_id: id,
      job_title: title?.name_ar || '',
    });
  }

  if (err) {
    return (
      <div className="field span2">
        <label>الهيكل التنظيمي</label>
        <span className="hint">لم يتم تهيئة جداول الهيكل التنظيمي بعد.</span>
      </div>
    );
  }

  return (
    <>
      <div className="field">
        <label>التصنيف</label>
        {fixedCategory ? (
          <input value={fixedCategory.name_ar} readOnly />
        ) : (
          <select value={categoryId} onChange={(e)=>changeCategory(e.target.value)} disabled={disabled}>
            <option value="">اختر التصنيف</option>
            {categories.map((c)=><option key={c.id} value={c.id}>{c.name_ar}</option>)}
          </select>
        )}
      </div>

      <div className="field">
        <label>المنصب</label>
        <select
          value={value.org_position_id || ''}
          onChange={(e)=>changePosition(e.target.value)}
          disabled={disabled || !categoryId}
        >
          <option value="">اختر المنصب</option>
          {categoryPositions.map((p)=><option key={p.id} value={p.id}>{p.name_ar}</option>)}
        </select>
      </div>

      <div className="field">
        <label>المسمى الوظيفي</label>
        <select
          value={value.org_job_title_id || ''}
          onChange={(e)=>changeTitle(e.target.value)}
          disabled={disabled || !value.org_position_id}
        >
          <option value="">اختر المسمى الوظيفي</option>
          {allowedTitles.map((t)=><option key={t.id} value={t.id}>{t.name_ar}</option>)}
        </select>
        {value.org_position_id && allowedTitles.length === 0 && (
          <span className="hint">
            لا توجد مسميات مرتبطة بهذا المنصب. <Link href="/dashboard/org-structure">إدارة الهيكل التنظيمي</Link>
          </span>
        )}
      </div>
    </>
  );
}
