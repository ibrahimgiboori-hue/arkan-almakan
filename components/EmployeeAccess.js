'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const ROLE_AR = {
  ceo: 'مدير تنفيذي',
  hr: 'الموارد البشرية',
  accountant: 'المحاسبة',
  supervisor: 'مشرف',
};

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ar-SA-u-ca-gregory', {
      timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short',
    });
  } catch { return '—'; }
}

async function invokeAdmin(body) {
  const { data, error } = await supabase.functions.invoke('employee-access-admin', { body });
  if (!error && data?.ok) return data;

  let message = data?.message || error?.message || 'تعذر إكمال العملية.';
  if (error?.context?.json) {
    try {
      const detail = await error.context.json();
      message = detail?.message || message;
    } catch { /* keep generic message */ }
  }
  throw new Error(message);
}

function generateTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const random = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  return `Ar!9${random}`;
}

export default function EmployeeAccess({ employeeId }) {
  const [info, setInfo] = useState(null);
  const [role, setRole] = useState('supervisor');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState('load');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setBusy('load'); setErr('');
    try {
      const data = await invokeAdmin({ action:'status', employee_id:employeeId });
      setInfo(data);
      if (data.account?.role) setRole(data.account.role);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  async function setTemporaryPassword(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setLink('');
    if (password.length < 8) { setErr('كلمة المرور المؤقتة يجب ألا تقل عن 8 خانات.'); return; }
    setBusy('password');
    try {
      await invokeAdmin({
        action:'set_temporary_password', employee_id:employeeId,
        password, role:info?.account?.exists ? undefined : role,
      });
      setMsg('تم تعيين كلمة المرور المؤقتة وتفعيل الحساب. سيُطلب من الموظف تغييرها عند أول دخول.');
      setShowPassword(true);
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  async function makeAccessLink() {
    setErr(''); setMsg(''); setLink(''); setBusy('link');
    try {
      const purpose = info?.account?.exists ? 'reset' : 'activate';
      const { data, error } = await supabase.rpc('fn_issue_user_access_token', {
        p_employee_id: employeeId,
        p_purpose: purpose,
        p_role: purpose === 'activate' ? role : null,
        p_valid_minutes: 1440,
      });
      if (error) throw error;
      const url = `${window.location.origin}/account-access?token=${encodeURIComponent(data.token)}`;
      setLink(url);
      setMsg(purpose === 'activate'
        ? 'تم إنشاء رابط تفعيل صالح لمدة 24 ساعة.'
        : 'تم إنشاء رابط إعادة تعيين صالح لمدة 24 ساعة.');
    } catch (e) { setErr(e.message || 'تعذر إنشاء الرابط.'); }
    finally { setBusy(''); }
  }

  async function toggleActive() {
    if (!info?.account?.exists) return;
    const next = !info.account.is_active;
    const label = next ? 'تفعيل' : 'تعطيل';
    if (!window.confirm(`${label} حساب دخول هذا الموظف؟`)) return;
    setErr(''); setMsg(''); setBusy('active');
    try {
      await invokeAdmin({ action:'set_active', employee_id:employeeId, is_active:next });
      setMsg(next ? 'تم تفعيل الحساب.' : 'تم تعطيل الحساب ومنع الدخول.');
      await load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  async function copy(value, success) {
    try { await navigator.clipboard.writeText(value); setMsg(success); }
    catch { setErr('تعذر النسخ تلقائياً. حدّد النص وانسخه يدوياً.'); }
  }

  if (busy === 'load' && !info && !err) return <div className="empty">جارٍ تحميل بيانات الدخول…</div>;

  const account = info?.account;
  const identityReady = info?.employee?.identity_ready;

  return (
    <div className="section" style={{marginTop:0}}>
      <header>
        <div>
          <h2>إدارة الدخول</h2>
          <div className="hint">المستخدم الرئيسي فقط يستطيع إنشاء أو إعادة تعيين بيانات الدخول.</div>
        </div>
      </header>
      <div style={{padding:18}}>
        {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
        {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

        {info && <>
          <div className="grid k4" style={{marginBottom:18}}>
            <div className="card"><h3>حساب الدخول</h3><div className="big" style={{fontSize:18}}>{account?.exists ? 'موجود' : 'غير منشأ'}</div><div className="foot">{identityReady ? 'رقم الهوية جاهز للدخول' : 'رقم الهوية يحتاج تصحيحاً'}</div></div>
            <div className="card"><h3>حالة الحساب</h3><div className="big" style={{fontSize:18}}>{account?.exists ? (account.is_active ? 'مفعّل' : 'معطّل') : '—'}</div><div className="foot">{account?.exists ? (ROLE_AR[account.role] || account.role) : 'يُحدد الدور عند الإنشاء'}</div></div>
            <div className="card"><h3>كلمة المرور</h3><div className="big" style={{fontSize:18}}>{account?.must_change_password ? 'مؤقتة' : account?.exists ? 'خاصة بالموظف' : '—'}</div><div className="foot">{account?.must_change_password ? 'يلزم تغييرها عند الدخول' : 'لا يمكن للإدارة الاطلاع عليها'}</div></div>
            <div className="card"><h3>آخر دخول</h3><div className="big" style={{fontSize:15}}>{formatDate(account?.last_sign_in_at)}</div><div className="foot">آخر نشاط مصادقة ناجح</div></div>
          </div>

          {!identityReady && <div className="msg err" style={{marginBottom:16}}>قبل إنشاء حساب للموظف، صحح رقم الهوية أو الإقامة ليكون 10 أرقام في تبويب البيانات.</div>}

          {!account?.exists && <div className="field" style={{maxWidth:360}}>
            <label>دور المستخدم عند إنشاء الحساب</label>
            <select value={role} onChange={(e)=>setRole(e.target.value)}>
              {Object.entries(ROLE_AR).map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </div>}

          {!account?.is_primary && <form onSubmit={setTemporaryPassword} style={{marginTop:18}}>
            <div className="field" style={{maxWidth:560}}>
              <label>{account?.exists ? 'كلمة مرور مؤقتة جديدة' : 'إنشاء الحساب بكلمة مرور مؤقتة'}</label>
              <div className="rowsplit" style={{alignItems:'stretch'}}>
                <input
                  dir="ltr" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                  value={password} onChange={(e)=>setPassword(e.target.value)}
                  placeholder="8 خانات على الأقل" style={{flex:1,minWidth:220}}
                />
                <button type="button" className="btn ghost" onClick={()=>{setPassword(generateTemporaryPassword());setShowPassword(true);}}>توليد</button>
                <button type="button" className="btn ghost" disabled={!password} onClick={()=>copy(password,'تم نسخ كلمة المرور المؤقتة.')}>نسخ</button>
              </div>
              <span className="hint">لا تُحفظ كلمة المرور كنص داخل البرنامج. احتفظ بها أو أرسلها للموظف الآن؛ لن يمكن استرجاعها لاحقاً.</span>
            </div>
            <div className="rowsplit" style={{marginTop:12,justifyContent:'flex-start'}}>
              <button className="btn" type="submit" disabled={busy==='password' || !identityReady || password.length<8}>{busy==='password' ? 'جارٍ الحفظ…' : account?.exists ? 'تعيين كلمة المرور المؤقتة' : 'إنشاء الحساب ومنح كلمة المرور'}</button>
              {account?.exists && <button className="btn ghost" type="button" onClick={toggleActive} disabled={busy==='active'}>{account.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}</button>}
            </div>
          </form>}

          <div style={{borderTop:'1px solid var(--hair)',marginTop:24,paddingTop:18}}>
            <h3 style={{margin:'0 0 6px'}}>الرابط كخيار احتياطي</h3>
            <div className="hint" style={{marginBottom:12}}>{account?.exists ? 'ينشئ رابطاً يختار منه الموظف كلمة مرور جديدة بنفسه.' : 'ينشئ رابط تفعيل يختار منه الموظف كلمة المرور بنفسه.'}</div>
            <div className="rowsplit" style={{justifyContent:'flex-start'}}>
              <button type="button" className="btn ghost" onClick={makeAccessLink} disabled={busy==='link' || !identityReady || account?.is_primary}>{busy==='link' ? 'جارٍ الإنشاء…' : account?.exists ? 'إنشاء رابط إعادة تعيين' : 'إنشاء رابط تفعيل'}</button>
              {link && <button type="button" className="btn ghost" onClick={()=>copy(link,'تم نسخ الرابط.')}>نسخ الرابط</button>}
            </div>
            {link && <div className="field" style={{marginTop:12}}><input dir="ltr" value={link} readOnly onFocus={(e)=>e.target.select()} /></div>}
          </div>

          {account?.exists && <div className="hint" style={{marginTop:18}}>آخر إصدار لكلمة مرور مؤقتة: {formatDate(account.temporary_password_set_at)} · آخر تغيير بواسطة المستخدم: {formatDate(account.password_changed_at)}</div>}
        </>}
      </div>
    </div>
  );
}
