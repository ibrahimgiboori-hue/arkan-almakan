'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ACTION_CONTEXT_EVENT, ACTION_MODE, normalizeActionContext } from '@/lib/action-context';

export default function PrimaryActionModeSettings() {
  const [primary, setPrimary] = useState(false);
  const [context, setContext] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setError('');
    const [primaryQ, contextQ] = await Promise.all([
      supabase.rpc('fn_is_primary_user'),
      supabase.rpc('fn_my_action_context'),
    ]);

    const isPrimary = primaryQ.data === true;
    setPrimary(isPrimary);
    if (!isPrimary) return;

    if (contextQ.error) {
      setContext(null);
      setError('وضع «تنفيذ نيابة عن» موجود في الكود، لكنه ينتظر تطبيق تحديث قاعدة البيانات على البيئة الحالية.');
      return;
    }

    const normalized = normalizeActionContext(contextQ.data, { isPrimaryUser:true });
    setContext(normalized);
    if (normalized.actingMode === ACTION_MODE.ON_BEHALF_OF) {
      setSelectedEmployeeId(normalized.realActorEmployeeId || '');
    }

    const { data, error:employeesError } = await supabase
      .from('employees')
      .select('id,employee_no,full_name_ar,job_title,status')
      .order('full_name_ar');

    if (employeesError) {
      setError('تعذر تحميل قائمة الأشخاص المتاحين للتنفيذ نيابة عنهم.');
      return;
    }
    setEmployees(data || []);
  }

  useEffect(() => { load(); }, []);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId],
  );

  async function setMode(enabled) {
    if (enabled && !selectedEmployeeId) {
      setError('اختر الشخص الذي ستنفذ الإجراءات نيابة عنه أولًا.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    const { data, error:rpcError } = await supabase.rpc('fn_set_my_action_context', {
      p_enabled: Boolean(enabled),
      p_real_actor_employee_id: enabled ? selectedEmployeeId : null,
    });
    setBusy(false);

    if (rpcError) {
      setError(rpcError.message || 'تعذر تغيير وضع التنفيذ.');
      return;
    }

    const normalized = normalizeActionContext(data, { isPrimaryUser:true });
    setContext(normalized);
    if (!enabled) setSelectedEmployeeId('');
    setMessage(enabled
      ? `تم تفعيل الوضع الخاص. أي إجراء جديد سيُسجّل بأنك المُسجّل النظامي وأن ${normalized.realActorName || selectedEmployee?.full_name_ar || 'الشخص المحدد'} هو صاحب الإجراء الفعلي.`
      : 'تم إيقاف الوضع الخاص. عادت الإجراءات الجديدة إلى «تنفيذ بصفتي».');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ACTION_CONTEXT_EVENT, { detail:data || null }));
    }
  }

  if (!primary) return null;

  const active = context?.actingMode === ACTION_MODE.ON_BEHALF_OF;

  return (
    <div className="section" data-primary-action-mode-settings="true" style={{ marginTop:0, marginBottom:22, border:'1px solid var(--hair)' }}>
      <header>
        <h2>إعدادات الحساب الرئيسي — وضع التنفيذ</h2>
        <span>{active ? 'الوضع الخاص مفعّل' : 'الوضع العادي'}</span>
      </header>
      <div style={{ padding:18 }}>
        <div className="msg" style={{ marginBottom:14 }}>
          هذا الوضع لا ينتحل حساب أي شخص ولا يغيّر صلاحياته. الصلاحية تبقى للحساب الرئيسي، بينما يحفظ النظام هويتين مستقلتين: من نفّذ داخل البرنامج، ومن صدر عنه الإجراء فعليًا.
        </div>

        {error && <div className="msg err" style={{ marginBottom:14 }}>{error}</div>}
        {message && <div className="msg ok" style={{ marginBottom:14 }}>{message}</div>}

        <div className="form-grid">
          <div className="field span2">
            <label>صاحب الإجراء الفعلي</label>
            <select
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              disabled={busy || !context}
            >
              <option value="">اختر الشخص</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name_ar || employee.employee_no || employee.id}
                  {employee.job_title ? ` — ${employee.job_title}` : ''}
                  {employee.status && !['active','on_leave'].includes(employee.status) ? ` — ${employee.status}` : ''}
                </option>
              ))}
            </select>
            <span className="hint">يمكن تغيير الشخص ثم الضغط على «تفعيل / تحديث الوضع»؛ يبدأ سياق تدقيقي جديد من لحظة التغيير.</span>
          </div>
        </div>

        <div className="rowsplit" style={{ justifyContent:'flex-start', gap:8, flexWrap:'wrap', marginTop:14 }}>
          <button
            type="button"
            className="btn"
            disabled={busy || !context || !selectedEmployeeId}
            onClick={() => setMode(true)}
          >
            {busy ? 'جارٍ الحفظ…' : active ? 'تحديث الشخص المنفذ نيابة عنه' : 'تفعيل تنفيذ نيابة عن'}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy || !context || !active}
            onClick={() => setMode(false)}
          >
            إيقاف الوضع الخاص
          </button>
        </div>

        <div style={{ marginTop:14, fontSize:13.5 }} data-action-mode-state={active ? 'on_behalf_of' : 'self'}>
          <strong>الحالة الحالية:</strong>{' '}
          {active
            ? <>تنفذ الآن نيابة عن <strong>{context.realActorName || selectedEmployee?.full_name_ar || 'الشخص المحدد'}</strong>. سيظهر تنبيه ثابت أعلى البرنامج ما دام الوضع مفعّلًا.</>
            : 'تنفيذ بصفتي — لا يوجد شخص محدد للنيابة.'}
        </div>
      </div>
    </div>
  );
}
