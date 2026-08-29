'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ACTION_CONTEXT_EVENT, ACTION_MODE, normalizeActionContext } from '@/lib/action-context';

export default function PrimaryActionModeSettings() {
  const [primary, setPrimary] = useState(false);
  const [primaryEmployeeId, setPrimaryEmployeeId] = useState('');
  const [context, setContext] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    setError('');

    const { data:{ session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const [primaryQ, contextQ, userQ, employeesQ] = await Promise.all([
      supabase.rpc('fn_is_primary_user'),
      supabase.rpc('fn_my_action_context'),
      supabase
        .from('app_users')
        .select('employee_id')
        .eq('id', session.user.id)
        .maybeSingle(),
      supabase
        .from('employees')
        .select('id,employee_no,full_name_ar,job_title,status')
        .order('full_name_ar'),
    ]);

    const isPrimary = primaryQ.data === true;
    setPrimary(isPrimary);
    if (!isPrimary) return;

    const myEmployeeId = userQ.data?.employee_id || '';
    setPrimaryEmployeeId(myEmployeeId);

    if (!employeesQ.error) {
      setEmployees(employeesQ.data || []);
    } else {
      setEmployees([]);
    }

    if (contextQ.error) {
      setContext(null);
      setError('وضع «تنفيذ نيابة عن» موجود في الكود، لكنه ينتظر تطبيق تحديث قاعدة البيانات على البيئة الحالية. يمكنك التحقق من هوية الحساب واختيار الشخص الآن، لكن التفعيل لن يعمل قبل تحديث قاعدة البيانات.');
      return;
    }

    const normalized = normalizeActionContext(contextQ.data, {
      isPrimaryUser:true,
      systemActorUserId:session.user.id,
      systemActorEmployeeId:myEmployeeId || null,
    });
    setContext(normalized);
    setSelectedEmployeeId(
      normalized.actingMode === ACTION_MODE.ON_BEHALF_OF
        ? (normalized.realActorEmployeeId || '')
        : '',
    );
  }

  useEffect(() => { load(); }, []);

  const primaryEmployee = useMemo(
    () => employees.find((employee) => employee.id === primaryEmployeeId) || null,
    [employees, primaryEmployeeId],
  );

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

    const normalized = normalizeActionContext(data, {
      isPrimaryUser:true,
      systemActorEmployeeId:primaryEmployeeId || null,
    });
    setContext(normalized);
    if (!enabled) setSelectedEmployeeId('');
    setMessage(enabled
      ? `تم تفعيل الوضع الخاص. من هذه اللحظة كل إجراء تقوم به في البرنامج — إنشاءً أو تعديلًا أو اعتمادًا أو إتمام أي مرحلة — يُسجّل بأن الحساب الرئيسي هو المُسجّل النظامي وأن ${normalized.realActorName || selectedEmployee?.full_name_ar || 'الشخص المحدد'} هو صاحب الإجراء الفعلي.`
      : `تم إيقاف الوضع الخاص. عادت كل الإجراءات إلى صاحب الحساب الرئيسي ${primaryEmployee?.full_name_ar || 'الحالي'}.`);

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
          هذا الوضع لا ينتحل حساب أي شخص ولا يغيّر الصلاحيات. الحساب الرئيسي هو الذي ينفذ داخل البرنامج دائمًا، بينما يحدد هذا الوضع من هو صاحب الإجراء الفعلي في الواقع.
        </div>

        <div style={{
          marginBottom:14,
          padding:'12px 14px',
          border:'1px solid var(--hair)',
          borderRadius:10,
          background:'var(--surface, #fff)',
        }} data-primary-account-identity="true">
          <div style={{ fontSize:12.5, color:'var(--ink-soft)', marginBottom:4 }}>مستخدم الحساب الرئيسي</div>
          <strong>{primaryEmployee?.full_name_ar || 'الحساب الرئيسي الحالي'}</strong>
          {primaryEmployee?.employee_no ? <span className="hint"> · {primaryEmployee.employee_no}</span> : null}
          {primaryEmployee?.job_title ? <div className="hint" style={{ marginTop:3 }}>{primaryEmployee.job_title}</div> : null}
          <div className="hint" style={{ marginTop:7 }}>
            طالما أن «تنفيذ نيابة عن» غير مفعّل، فإن كل إجراء في النظام يُنسب إلى هذا الشخص بصفته صاحب الإجراء الفعلي أيضًا.
          </div>
        </div>

        {error && <div className="msg err" style={{ marginBottom:14 }}>{error}</div>}
        {message && <div className="msg ok" style={{ marginBottom:14 }}>{message}</div>}

        <div className="form-grid">
          <div className="field span2">
            <label>تنفيذ نيابة عن</label>
            <select
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              disabled={busy}
            >
              <option value="">لا أحد — تنفيذ بصفتي</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name_ar || employee.employee_no || employee.id}
                  {employee.id === primaryEmployeeId ? ' — مستخدم الحساب الرئيسي' : ''}
                  {employee.job_title ? ` — ${employee.job_title}` : ''}
                  {employee.status && !['active','on_leave'].includes(employee.status) ? ` — ${employee.status}` : ''}
                </option>
              ))}
            </select>
            <span className="hint">
              إبراهيم الجبوري يظهر ضمن القائمة مثل أي شخص آخر. اختيار الاسم وحده لا يفعّل النيابة؛ تبدأ النيابة فقط بعد الضغط على «تفعيل تنفيذ نيابة عن».
            </span>
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
            ? <>كل إجراء جديد أو إتمام لأي مرحلة يُنفذ الآن نيابة عن <strong>{context.realActorName || selectedEmployee?.full_name_ar || 'الشخص المحدد'}</strong>. سيظهر تنبيه ثابت أعلى البرنامج ما دام الوضع مفعّلًا.</>
            : <>كل إجراء يُنفذ بصفة <strong>{primaryEmployee?.full_name_ar || 'مستخدم الحساب الرئيسي'}</strong>، ولا توجد نيابة مفعّلة.</>}
        </div>
      </div>
    </div>
  );
}
