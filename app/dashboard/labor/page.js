'use client';
import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { money, daysUntil } from '@/lib/format';
import { laborDailyRate } from '@/lib/domain-rules';
import { CLASS_AR, TRADES, BASIS_AR } from '@/lib/timesheet';
import { notifyChange, useLiveRefresh } from '@/lib/live';
import { PageHeader, SectionCard, StatusPill } from '@/components/v2-ui';

const EMPTY = {
  full_name:'', iqama_no:'', iqama_expiry:'', nationality:'', labor_class:'worker',
  trade:'', contractor_id:'', group_code:'', pay_basis:'daily', daily_rate:'',
  monthly_salary:'', salary_days:30, piece_rate:'', piece_unit:'م2',
  deduct_absence:true, phone:'',
};

function expiryTone(days) {
  if (days === null) return 'neutral';
  if (days < 0) return 'danger';
  if (days <= 60) return 'warning';
  return 'success';
}

export default function Labor() {
  const searchParams = useSearchParams();
  const contractorParam = searchParams.get('contractor') || '';
  const addParam = searchParams.get('add') === '1';
  const [rows, setRows] = useState(null);
  const [cons, setCons] = useState([]);
  const [role, setRole] = useState(null);
  const [f, setF] = useState({ ...EMPTY });
  const [editId, setEditId] = useState(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [filterC, setFilterC] = useState(contractorParam);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function load() {
    const sess = (await supabase.auth.getSession()).data.session;
    const [l, c, u] = await Promise.all([
      supabase.from('laborers').select('*').order('full_name'),
      supabase.from('contractors').select('id, name_ar, worker_daily, tech_daily')
        .eq('is_active', true).order('name_ar'),
      supabase.from('app_users').select('role').eq('id', sess?.user?.id).maybeSingle(),
    ]);
    setRows(l.data || []);
    setCons(c.data || []);
    setRole(u.data?.role || null);
  }

  useEffect(() => { load(); }, []);
  useLiveRefresh(load, ['labor','all']);

  useEffect(() => {
    if (!contractorParam) return;
    setFilterC(contractorParam);
    if (addParam) {
      setEditId(null);
      setF({ ...EMPTY, contractor_id: contractorParam });
      setOpen(true);
    }
  }, [contractorParam, addParam]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function resync(r) {
    if (!window.confirm(`تحديث اليوميات المسجَّلة لـ"${r.full_name}" بالأجر الجديد؟`)) return;
    const { data, error } = await supabase.rpc('resync_laborer_rates', { p_laborer: r.id });
    if (error) setErr(error.message);
    else {
      setMsg(`حُدّث ${data} يوماً مسجَّلاً`);
      load();
      notifyChange('timesheet');
    }
  }

  function startEdit(r) {
    setEditId(r.id);
    setF({ ...EMPTY, ...r, salary_days:30 });
    setOpen(true);
    setErr('');
    setMsg('');
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function startNew() {
    setEditId(null);
    setF({ ...EMPTY, contractor_id: filterC || contractorParam || '' });
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const p = { ...f };
    ['daily_rate','monthly_salary','piece_rate'].forEach((k) => {
      p[k] = p[k] === '' || p[k] === null ? null : Number(p[k]);
    });
    p.salary_days = 30;
    p.iqama_expiry = p.iqama_expiry || null;
    p.contractor_id = p.contractor_id || null;
    delete p.id;
    delete p.created_at;

    const res = editId
      ? await supabase.from('laborers').update(p).eq('id', editId)
      : await supabase.from('laborers').insert(p);
    if (res.error) {
      setErr('تعذّر الحفظ: ' + res.error.message);
      return;
    }
    setMsg(editId ? 'حُفظت التعديلات' : 'أُضيف الفرد');
    notifyChange('labor');
    setF({ ...EMPTY, contractor_id: filterC || contractorParam || '' });
    setEditId(null);
    setOpen(false);
    load();
  }

  async function toggle(r) {
    await supabase.from('laborers').update({ is_active: !r.is_active }).eq('id', r.id);
    load();
  }

  async function remove(r) {
    if (!window.confirm(`حذف "${r.full_name}"؟`)) return;
    const { error } = await supabase.from('laborers').delete().eq('id', r.id);
    if (error) setErr('مرتبط بسجلات حضور — عطّله بدل حذفه.');
    else {
      setMsg('حُذف');
      load();
    }
  }

  const list = useMemo(() => {
    if (!rows) return [];
    const t = q.trim();
    return rows
      .filter((r) => !filterC || r.contractor_id === filterC)
      .filter((r) => !t || [r.full_name, r.iqama_no, r.trade, r.group_code]
        .filter(Boolean).some((v) => String(v).includes(t)));
  }, [rows, q, filterC]);

  if (!rows) return <div className="empty">جارٍ التحميل…</div>;

  const canWrite = ['ceo','hr','accountant','supervisor'].includes(role);
  const activeCount = rows.filter((r) => r.is_active).length;
  const expSoon = rows.filter((r) => {
    const d = daysUntil(r.iqama_expiry);
    return d !== null && d <= 60;
  }).length;
  const scopedContractor = cons.find((c) => c.id === filterC);

  return (
    <>
      <PageHeader
        title={scopedContractor ? `عمالة ${scopedContractor.name_ar}` : 'الأيدي العاملة'}
        description={scopedContractor ? `${list.length} فرد مرتبط بالمقاول` : `${activeCount} على رأس العمل من ${rows.length} مسجَّلاً`}
      >
        {canWrite && (
          <button className="btn" onClick={open ? () => { setOpen(false); setEditId(null); } : startNew}>
            {open ? 'إغلاق' : (scopedContractor ? 'إضافة عامل للمقاول' : 'إضافة فرد')}
          </button>
        )}
      </PageHeader>

      {err && <div className="msg err" style={{ marginBottom:14 }}>{err}</div>}
      {msg && <div className="msg ok" style={{ marginBottom:14 }}>{msg}</div>}
      {expSoon > 0 && <div className="msg err" style={{ marginBottom:14 }}>{expSoon} إقامة تنتهي خلال ٦٠ يوماً أو منتهية</div>}

      {open && (
        <SectionCard title={editId ? 'تعديل فرد' : (scopedContractor ? `إضافة عامل إلى ${scopedContractor.name_ar}` : 'إضافة فرد')}>
          <form onSubmit={save} className="v2-form-body">
            <div className="form-grid">
              <div className="field span2"><label>الاسم *</label><input required value={f.full_name} onChange={set('full_name')} /></div>
              <div className="field">
                <label>المقاول</label>
                <select value={f.contractor_id || ''} onChange={(e) => {
                  const c = cons.find((x) => x.id === e.target.value);
                  setF({ ...f, contractor_id:e.target.value, daily_rate:f.daily_rate || (f.labor_class === 'technician' ? c?.tech_daily : c?.worker_daily) || '' });
                }}>
                  <option value="">—</option>
                  {cons.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
                </select>
              </div>
              <div className="field"><label>التصنيف *</label><select value={f.labor_class} onChange={set('labor_class')}>{Object.entries(CLASS_AR).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="field"><label>التخصص</label><select value={f.trade || ''} onChange={set('trade')}><option value="">—</option>{TRADES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
              <div className="field"><label>الجنسية</label><input value={f.nationality || ''} onChange={set('nationality')} /></div>
              <div className="field"><label>رقم الإقامة</label><input dir="ltr" value={f.iqama_no || ''} onChange={set('iqama_no')} /></div>
              <div className="field"><label>انتهاء الإقامة</label><input type="date" dir="ltr" value={f.iqama_expiry || ''} onChange={set('iqama_expiry')} /></div>
              <div className="field"><label>مجموعة الموقع</label><input value={f.group_code || ''} onChange={set('group_code')} placeholder="GRP-RYD-07" /></div>
              <div className="field"><label>أساس الأجر *</label><select value={f.pay_basis} onChange={set('pay_basis')}>{Object.entries(BASIS_AR).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>

              {f.pay_basis === 'daily' && <div className="field"><label>اليومية</label><input type="number" step="0.01" dir="ltr" value={f.daily_rate ?? ''} onChange={set('daily_rate')} /></div>}
              {f.pay_basis === 'salary' && (
                <>
                  <div className="field"><label>الراتب الشهري</label><input type="number" step="0.01" dir="ltr" value={f.monthly_salary ?? ''} onChange={set('monthly_salary')} /></div>
                  <div className="field"><label>أساس احتساب اليومية</label><input value="30 يوم" readOnly className="v2-readonly-value" /><span className="hint">اليومية المحسوبة: {money(laborDailyRate(f))} ريال — الراتب ÷ 30</span></div>
                </>
              )}
              {f.pay_basis === 'piecework' && (
                <>
                  <div className="field"><label>سعر الوحدة الممنوح له</label><input type="number" step="0.01" dir="ltr" value={f.piece_rate ?? ''} onChange={set('piece_rate')} /><span className="hint">يومه = السعر × ما أنجزه ذلك اليوم</span></div>
                  <div className="field"><label>الوحدة</label><input value={f.piece_unit || ''} onChange={set('piece_unit')} placeholder="م2" /></div>
                </>
              )}
              {f.pay_basis !== 'piecework' && <div className="field"><label>الغياب</label><select value={f.deduct_absence ? '1' : '0'} onChange={(e) => setF({ ...f, deduct_absence:e.target.value === '1' })}><option value="1">يُخصم بقيمة اليومية</option><option value="0">لا يُخصم</option></select></div>}
              <div className="field"><label>الجوال</label><input dir="ltr" value={f.phone || ''} onChange={set('phone')} /></div>
            </div>
            <div className="rowsplit">
              <button className="btn" type="submit">{editId ? 'حفظ' : 'إضافة'}</button>
              <button className="btn ghost" type="button" onClick={() => { setOpen(false); setEditId(null); setF({ ...EMPTY, contractor_id: filterC || contractorParam || '' }); }}>إلغاء</button>
            </div>
          </form>
        </SectionCard>
      )}

      <SectionCard title={scopedContractor ? `عمالة ${scopedContractor.name_ar}` : 'سجل الأيدي العاملة'}>
        <div className="v2-section-toolbar">
          <select value={filterC} onChange={(e) => setFilterC(e.target.value)} className="v2-compact-select">
            <option value="">كل المقاولين</option>
            {cons.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
          </select>
          <input className="search" placeholder="ابحث بالاسم أو الإقامة أو التخصص" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length === 0 ? (
          <div className="empty"><h3>لا توجد عمالة مرتبطة</h3><p>{scopedContractor ? 'أضف أول عامل لهذا المقاول من الزر أعلى الصفحة.' : 'أضف أفراد العمالة من الزر أعلى الصفحة.'}</p></div>
        ) : (
          <div className="v2-table-wrap">
            <table>
              <thead><tr><th>الاسم</th><th>التصنيف</th><th>التخصص</th><th>المقاول</th><th>أساس الأجر</th><th className="num">اليومية المحسوبة</th><th>الانتهاء</th><th style={{ width:230 }}>الإجراءات</th></tr></thead>
              <tbody>
                {list.map((r) => {
                  const left = daysUntil(r.iqama_expiry);
                  return (
                    <tr key={r.id} className={!r.is_active ? 'v2-row-muted' : ''}>
                      <td>{r.full_name}{r.group_code && <div className="mono v2-cell-note">{r.group_code}</div>}</td>
                      <td><StatusPill>{CLASS_AR[r.labor_class]}</StatusPill></td>
                      <td className="v2-cell-small">{r.trade || '—'}</td>
                      <td className="v2-cell-small">{cons.find((c) => c.id === r.contractor_id)?.name_ar || '—'}</td>
                      <td className="v2-cell-small"><StatusPill>{BASIS_AR[r.pay_basis]}</StatusPill>{r.pay_basis === 'salary' && <div className="v2-cell-note">{money(r.monthly_salary)} ÷ 30</div>}</td>
                      <td className="num">{money(laborDailyRate(r))}</td>
                      <td><StatusPill tone={expiryTone(left)}>{left === null ? '—' : left < 0 ? `منتهية ${Math.abs(left)} يوم` : `${left} يوم`}</StatusPill></td>
                      <td><div className="rowsplit">{canWrite && <><button className="btn ghost" onClick={() => startEdit(r)}>تعديل</button><button className="btn ghost" onClick={() => toggle(r)}>{r.is_active ? 'تعطيل' : 'تفعيل'}</button><button className="btn ghost" onClick={() => resync(r)}>تحديث الأجور</button><button className="btn ghost" onClick={() => remove(r)}>حذف</button></>}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
