'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { dateAr } from '@/lib/format';

const OPEN_STATUSES = ['new', 'received', 'in_progress', 'waiting'];

function priorityLabel(priority) {
  if (priority === 'urgent') return 'عاجل';
  if (priority === 'high') return 'مهم';
  return '';
}

export default function AttentionArea({
  sourceTable = null,
  title = 'متابعة',
  empty = false,
  refreshToken = null,
  onChanged = null,
}) {
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    let query = supabase
      .from('workspace_tasks')
      .select('id,title,description,status,priority,due_at,source_route,source_label,source_table,source_id,created_at')
      .eq('work_source', 'attention')
      .in('status', OPEN_STATUSES)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });
    if (sourceTable) query = query.eq('source_table', sourceTable);
    const { data, error: loadError } = await query;
    if (loadError) {
      setError(loadError.message || 'تعذر تحميل المتابعة.');
      return;
    }
    setError('');
    setItems(data || []);
  }, [sourceTable]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  async function resolve(item) {
    if (!item?.source_table || !item?.source_id || busyId) return;
    setBusyId(item.id);
    setError('');
    const { error: resolveError } = await supabase.rpc('fn_set_attention', {
      p_source_table: item.source_table,
      p_source_id: item.source_id,
      p_title: item.title,
      p_description: null,
      p_source_route: item.source_route || null,
      p_source_label: item.source_label || null,
      p_priority: item.priority || 'normal',
      p_due_at: item.due_at || null,
      p_project_id: null,
      p_active: false,
    });
    if (resolveError) {
      setError(resolveError.message || 'تعذر إغلاق المتابعة.');
      setBusyId('');
      return;
    }
    await load();
    setBusyId('');
    onChanged?.();
  }

  if (!items.length && !error && !empty) return null;

  return (
    <section
      data-attention-area="true"
      style={{
        border: '1px solid var(--line, #d1d5db)',
        borderRadius: 10,
        padding: 12,
        marginBottom: 14,
        background: 'var(--raw-paper, #fff)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: items.length || error ? 10 : 0 }}>
        <strong>{title}</strong>
        {items.length ? <span className="muted">{items.length}</span> : null}
      </div>

      {error ? <small style={{ display: 'block' }}>{error}</small> : null}
      {!items.length && !error ? <small className="muted">لا توجد عناصر تحتاج متابعة.</small> : null}

      {items.length ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) auto',
                gap: 10,
                alignItems: 'center',
                padding: '9px 10px',
                border: '1px solid var(--line, #e5e7eb)',
                borderRadius: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{item.title}</strong>
                  {priorityLabel(item.priority) ? <small>{priorityLabel(item.priority)}</small> : null}
                </div>
                <div className="muted" style={{ marginTop: 3, fontSize: 12 }}>
                  {[item.source_label, item.due_at ? `حتى ${dateAr(item.due_at)}` : ''].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {item.source_route ? <a className="btn ghost" href={item.source_route}>فتح</a> : null}
                <button className="btn ghost" type="button" disabled={busyId === item.id} onClick={() => resolve(item)}>
                  {busyId === item.id ? 'جارٍ…' : 'تمت المعالجة'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
