'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function OrgRoleFields({ value, onChange, fixedClassificationCode = null, disabled = false }) {
  const [classifications, setClassifications] = useState([]);
  const [positions, setPositions] = useState([]);
  const [titles, setTitles] = useState([]);
  const [links, setLinks] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, p, t, l] = await Promise.all([
        supabase.from('org_classifications').select('id, code, name_ar, is_active, sort_order').eq('is_active', true).order('sort_order').order('name_ar'),
        supabase.from('org_positions').select('id, classification_id, code, name_ar, is_active, sort_order').eq('is_active', true).order('sort_order').order('name_ar'),
        supabase.from('org_job_titles').select('id, code, name_ar, is_active, sort_order').eq('is_active', true).order('sort_order').order('name_ar'),
        supabase.from('org_position_job_titles').select('position_id, job_title_id, is_active').eq('is_active', true),
      ]);
      if (!alive) return;
      const firstError = c.error || p.error || t.error || l.error;
      if (firstError) { setErr(firstError.message); return; }
      setClassifications(c.data || []);
      setPositions(p.data || []);
      setTitles(t.data || []);
      setLinks(l.data || []);
    })();
    return () => { alive = false; };
  }, []);

  const fixedClassification = classifications.find((c) => c.code === fixedClassificationCode) || null;
  const classificationId = fixedClassification?.id || value.org_classification_id || '';

  useEffect(() => {
    if (!fixedClassification || value.org_classification_id === fixedClassification.id) return;
    onChange({
      org_classification_id: fixedClassification.id,
      org_position_id: '',
      org_job_title_id: '',
      department: fixedClassification.code === 'board' ? value.department || '' : fixedClassification.name_ar,
      board_role: '',
      job_title: '',
    });
  }, [fixedClassification?.id]);

  const classificationPositions = useMemo(
    () => positions.filter((p) => p.classification_id === classificationId),
    [positions, classificationId]
  );

  const allowedTitleIds = useMemo(() => {
    if (!value.org_position_id) return new Set();
    return new Set(links.filter((l) => l.position_id === value.org_position_id).map((l) => l.job_title_id));
  }, [links, value.org_position_id]);

  const allowedTitles = useMemo(() => {
    const mapped = titles.filter((t) => allowedTitleIds.has(t.id));
    const current = titles.find((t) => t.id === value.org_job_title_id);
    if (current && !mapped.some((t) => t.id === current.id)) return [current, ...mapped];
    return mapped;
  }, [titles, allowedTitleIds, value.org_job_title_id]);

  function changeClassification(id) {
    const classification = classifications.find((c) => c.id === id);
    onChange({
      org_classification_id: id,
      org_position_id: '',
      org_job_title_id: '',
      department: classification?.code === 'board' ? value.department || '' : classification?.name_ar || '',
      board_role: '',
      job_title: '',
    });
  }

  function changePosition(id) {
    const position = positions.find((p) => p.id === id);
    const classification = classifications.find((c) => c.id === classificationId);
    onChange({
      org_position_id: id,
      org_job_title_id: '',
      board_role: classification?.code === 'board' ? position?.name_ar || '' : '',
      job_title: '',
    });
  }

  function changeTitle(id) {
    const title = titles.find((t) => t.id === id);
    onChange({ org_job_title_id: id, job_title: title?.name_ar || '' });
  }

  if (err) {
    return <div className="field span2"><label>الهيكل التنظيمي</label><span className="hint">تعذر تحميل إعدادات الهيكل التنظيمي.</span></div>;
  }

  return (
    <>
      <div className="field">
        <label>التصنيف</label>
        {fixedClassification ? <input value={fixedClassification.name_ar} readOnly /> : (
          <select value={classificationId} onChange={(e)=>changeClassification(e.target.value)} disabled={disabled}>
            <option value="">اختر التصنيف</option>
            {classifications.map((c)=><option key={c.id} value={c.id}>{c.name_ar}</option>)}
          </select>
        )}
      </div>

      <div className="field">
        <label>المنصب</label>
        <select value={value.org_position_id || ''} onChange={(e)=>changePosition(e.target.value)} disabled={disabled || !classificationId}>
          <option value="">اختر المنصب</option>
          {classificationPositions.map((p)=><option key={p.id} value={p.id}>{p.name_ar}</option>)}
        </select>
      </div>

      <div className="field">
        <label>المسمى الوظيفي</label>
        <select value={value.org_job_title_id || ''} onChange={(e)=>changeTitle(e.target.value)} disabled={disabled || !value.org_position_id}>
          <option value="">اختر المسمى الوظيفي</option>
          {allowedTitles.map((t)=><option key={t.id} value={t.id}>{t.name_ar}</option>)}
        </select>
        {value.org_position_id && allowedTitles.length === 0 && (
          <span className="hint">لا توجد مسميات مرتبطة بهذا المنصب. <Link href="/dashboard/org-structure">إدارة الهيكل التنظيمي</Link></span>
        )}
      </div>
    </>
  );
}
