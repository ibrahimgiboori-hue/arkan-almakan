'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function OrgStructurePage() {
  const [categories, setCategories] = useState([]);
  const [positions, setPositions] = useState([]);
  const [titles, setTitles] = useState([]);
  const [links, setLinks] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    setErr('');
    const [c, p, t, l] = await Promise.all([
      supabase.from('org_categories').select('*').order('sort_order').order('name_ar'),
      supabase.from('org_positions').select('*').order('rank_order').order('name_ar'),
      supabase.from('org_job_titles').select('*').order('sort_order').order('name_ar'),
      supabase.from('org_position_job_titles').select('*'),
    ]);

    const firstError = c.error || p.error || t.error || l.error;
    if (firstError) {
      setErr('تعذر تحميل الهيكل التنظيمي: ' + firstError.message);
      return;
    }

    setCategories(c.data || []);
    setPositions(p.data || []);
    setTitles(t.data || []);
    setLinks(l.data || []);

    if (!categoryId && c.data?.length) setCategoryId(c.data[0].id);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const available = positions.filter((p) => p.category_id === categoryId && p.is_active);
    if (!available.some((p) => p.id === positionId)) {
      setPositionId(available[0]?.id || '');
    }
  }, [categoryId, positions, positionId]);

  const selectedCategory = categories.find((c) => c.id === categoryId);
  const selectedPosition = positions.find((p) => p.id === positionId);
  const categoryPositions = positions.filter((p) => p.category_id === categoryId);
  const allowedTitleIds = useMemo(
    () => new Set(links.filter((l) => l.position_id === positionId && l.is_active).map((l) => l.job_title_id)),
    [links, positionId]
  );

  function flash(text) {
    setMsg(text);
    setTimeout(() => setMsg(''), 1800);
  }

  function codeFrom(prefix, text) {
    const stamp = Date.now().toString(36);
    return `${prefix}_${stamp}_${text.length}`;
  }

  async function addCategory(e) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    const { data, error } = await supabase.from('org_categories').insert({
      code: codeFrom('cat', name),
      name_ar: name,
      sort_order: 500,
    }).select('*').single();
    if (error) { setErr(error.message); return; }
    setNewCategory('');
    await load();
    setCategoryId(data.id);
    flash('تمت إضافة التصنيف');
  }

  async function addPosition(e) {
    e.preventDefault();
    const name = newPosition.trim();
    if (!name || !categoryId) return;
    const { data, error } = await supabase.from('org_positions').insert({
      category_id: categoryId,
      code: codeFrom('pos', name),
      name_ar: name,
      rank_order: 500,
    }).select('*').single();
    if (error) { setErr(error.message); return; }
    setNewPosition('');
    await load();
    setPositionId(data.id);
    flash('تمت إضافة المنصب');
  }

  async function addTitle(e) {
    e.preventDefault();
    const name = newTitle.trim();
    if (!name) return;
    const { error } = await supabase.from('org_job_titles').insert({
      code: codeFrom('title', name),
      name_ar: name,
      sort_order: 500,
    });
    if (error) { setErr(error.message); return; }
    setNewTitle('');
    await load();
    flash('تمت إضافة المسمى الوظيفي');
  }

  async function toggleLink(titleId, enabled) {
    if (!positionId) return;
    setErr('');
    if (enabled) {
      const { error } = await supabase.from('org_position_job_titles').upsert({
        position_id: positionId,
        job_title_id: titleId,
        is_active: true,
      }, { onConflict: 'position_id,job_title_id' });
      if (error) { setErr(error.message); return; }
    } else {
      const { error } = await supabase.from('org_position_job_titles')
        .update({ is_active: false })
        .eq('position_id', positionId)
        .eq('job_title_id', titleId);
      if (error) { setErr(error.message); return; }
    }
    await load();
  }

  async function toggleActive(table, row) {
    setErr('');
    const { error } = await supabase.from(table).update({ is_active: !row.is_active }).eq('id', row.id);
    if (error) { setErr(error.message); return; }
    await load();
    flash(row.is_active ? 'تم التعطيل' : 'تم التفعيل');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>الهيكل التنظيمي</h1>
          <p>إدارة العلاقة بين التصنيف والمنصب والمسمى الوظيفي دون ربطها بصلاحيات استخدام البرنامج.</p>
        </div>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      <div className="section" style={{marginTop:0}}>
        <header><h2>طريقة العمل</h2></header>
        <div style={{padding:18, lineHeight:1.9, color:'var(--ink-soft)', fontSize:13.5}}>
          يحدد التصنيف المجموعة التنظيمية الرئيسية. بعده يظهر فقط المنصب التابع له. ثم يسمح النظام بالمسميات الوظيفية التي تم ربطها بذلك المنصب. هذه البيانات تصف موقع الشخص داخل المنشأة ولا تحدد صلاحية دخوله إلى البرنامج.
        </div>
      </div>

      <div className="grid k3" style={{alignItems:'start'}}>
        <div className="section" style={{marginTop:0}}>
          <header><h2>التصنيفات</h2></header>
          <div style={{padding:14}}>
            <form onSubmit={addCategory} className="rowsplit" style={{marginBottom:12}}>
              <input value={newCategory} onChange={(e)=>setNewCategory(e.target.value)} placeholder="اسم التصنيف" />
              <button className="btn" type="submit">إضافة</button>
            </form>
            <div style={{display:'grid',gap:6}}>
              {categories.map((c)=>(
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:8}}>
                  <button
                    type="button"
                    className={categoryId === c.id ? 'btn' : 'btn ghost'}
                    style={{flex:1,justifyContent:'flex-start'}}
                    onClick={()=>setCategoryId(c.id)}
                  >
                    {c.name_ar}
                  </button>
                  <button className="btn ghost" type="button" onClick={()=>toggleActive('org_categories', c)}>
                    {c.is_active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="section" style={{marginTop:0}}>
          <header><h2>المناصب{selectedCategory ? `: ${selectedCategory.name_ar}` : ''}</h2></header>
          <div style={{padding:14}}>
            <form onSubmit={addPosition} className="rowsplit" style={{marginBottom:12}}>
              <input value={newPosition} onChange={(e)=>setNewPosition(e.target.value)} placeholder="اسم المنصب" disabled={!categoryId} />
              <button className="btn" type="submit" disabled={!categoryId}>إضافة</button>
            </form>
            <div style={{display:'grid',gap:6}}>
              {categoryPositions.map((p)=>(
                <div key={p.id} style={{display:'flex',alignItems:'center',gap:8}}>
                  <button
                    type="button"
                    className={positionId === p.id ? 'btn' : 'btn ghost'}
                    style={{flex:1,justifyContent:'flex-start'}}
                    onClick={()=>setPositionId(p.id)}
                  >
                    {p.name_ar}
                  </button>
                  <button className="btn ghost" type="button" onClick={()=>toggleActive('org_positions', p)}>
                    {p.is_active ? 'تعطيل' : 'تفعيل'}
                  </button>
                </div>
              ))}
              {categoryPositions.length === 0 && <div className="empty"><p>لا توجد مناصب في هذا التصنيف.</p></div>}
            </div>
          </div>
        </div>

        <div className="section" style={{marginTop:0}}>
          <header><h2>المسميات المسموحة{selectedPosition ? `: ${selectedPosition.name_ar}` : ''}</h2></header>
          <div style={{padding:14}}>
            <form onSubmit={addTitle} className="rowsplit" style={{marginBottom:12}}>
              <input value={newTitle} onChange={(e)=>setNewTitle(e.target.value)} placeholder="مسمى وظيفي جديد" />
              <button className="btn" type="submit">إضافة</button>
            </form>
            <div style={{display:'grid',gap:8,maxHeight:520,overflowY:'auto'}}>
              {titles.filter((t)=>t.is_active).map((t)=>(
                <label key={t.id} style={{display:'flex',alignItems:'center',gap:9,padding:'7px 4px',cursor:positionId?'pointer':'default'}}>
                  <input
                    type="checkbox"
                    checked={allowedTitleIds.has(t.id)}
                    disabled={!positionId}
                    onChange={(e)=>toggleLink(t.id, e.target.checked)}
                  />
                  <span>{t.name_ar}</span>
                </label>
              ))}
              {titles.length === 0 && <div className="empty"><p>لا توجد مسميات وظيفية.</p></div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
