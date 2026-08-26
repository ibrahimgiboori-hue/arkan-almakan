'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PROJECT_ACCESS_BUNDLES } from '@/lib/access-ui';

const ERROR_AR = {
  forbidden: 'هذا الحساب لا يملك صلاحية إدارة الدخول.',
  employee_required: 'اختر الموظف أولًا.',
  employee_not_found: 'تعذر العثور على الموظف.',
  employee_email_required: 'يجب تسجيل بريد إلكتروني للموظف قبل إنشاء حساب الدخول.',
  account_exists: 'يوجد حساب دخول لهذا الموظف بالفعل.',
  project_required: 'اختر مشروعًا واحدًا على الأقل.',
  project_not_found: 'أحد المشاريع المحددة غير موجود أو لم يعد متاحًا.',
  invalid_bundle: 'مستوى صلاحية المشروع غير صحيح.',
  auth_create_failed: 'تعذر إنشاء حساب الدخول.',
  project_access_failed: 'تم الوصول للحساب لكن تعذر حفظ صلاحيات المشروع.',
  password_reset_failed: 'تعذر تعيين كلمة المرور المؤقتة.',
  cannot_disable_self: 'لا يمكنك تعطيل حسابك الحالي من هذه الشاشة.',
};

function projectLabel(project) {
  return `${project.project_no || '—'} — ${project.name_ar}${project.city ? ` · ${project.city}` : ''}`;
}

export default function SystemUserPage() {
  const [directory, setDirectory] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newAccount, setNewAccount] = useState({ employeeId:'', bundleKey:'project_supervisor', projectIds:[] });
  const [newGrant, setNewGrant] = useState({ projectId:'', bundleKey:'project_supervisor' });

  async function callAdmin(body) {
    const { data, error } = await supabase.functions.invoke('system-user-admin', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.message || ERROR_AR[data.error] || data.error);
    return data;
  }

  async function load(keepSelection = true) {
    setErr('');
    try {
      const data = await callAdmin({ action:'directory' });
      setDirectory(data);
      if (!keepSelection || !selectedUserId || !(data.users || []).some((user) => user.id === selectedUserId)) {
        const first = (data.users || []).find((user) => user.id !== data.primaryUserId) || (data.users || [])[0];
        setSelectedUserId(first?.id || '');
      }
    } catch (error) {
      setErr(error.message || 'تعذر تحميل إدارة الدخول.');
      setDirectory({ employees:[], users:[], grants:[], bundles:[], projects:[], primaryUserId:null });
    }
  }

  useEffect(() => { load(false); }, []);

  const employeeById = useMemo(() => new Map((directory?.employees || []).map((employee) => [employee.id, employee])), [directory]);
  const bundleById = useMemo(() => new Map((directory?.bundles || []).map((bundle) => [bundle.id, bundle])), [directory]);
  const projectById = useMemo(() => new Map((directory?.projects || []).map((project) => [project.id, project])), [directory]);
  const accountEmployeeIds = useMemo(() => new Set((directory?.users || []).map((user) => user.employee_id).filter(Boolean)), [directory]);
  const availableEmployees = useMemo(() => (directory?.employees || []).filter((employee) => employee.status !== 'terminated' && !accountEmployeeIds.has(employee.id)), [directory, accountEmployeeIds]);
  const selectedUser = useMemo(() => (directory?.users || []).find((user) => user.id === selectedUserId) || null, [directory, selectedUserId]);
  const selectedEmployee = selectedUser ? employeeById.get(selectedUser.employee_id) : null;
  const selectedGrants = useMemo(() => (directory?.grants || [])
    .filter((grant) => grant.user_id === selectedUserId && grant.is_active && grant.scope_type === 'project' && bundleById.has(grant.bundle_id))
    .sort((a, b) => projectLabel(projectById.get(a.scope_key) || {}).localeCompare(projectLabel(projectById.get(b.scope_key) || {}), 'ar')),
  [directory, selectedUserId, bundleById, projectById]);
  const grantedProjectIds = useMemo(() => new Set(selectedGrants.map((grant) => grant.scope_key)), [selectedGrants]);
  const addableProjects = useMemo(() => (directory?.projects || []).filter((project) => !grantedProjectIds.has(project.id)), [directory, grantedProjectIds]);

  function toggleNewProject(projectId) {
    setNewAccount((current) => ({
      ...current,
      projectIds: current.projectIds.includes(projectId)
        ? current.projectIds.filter((id) => id !== projectId)
        : [...current.projectIds, projectId],
    }));
  }

  async function provision(event) {
    event.preventDefault();
    setBusy('provision'); setErr(''); setMsg(''); setCredentials(null);
    try {
      const data = await callAdmin({ action:'provision', ...newAccount });
      setCredentials({ email:data.account.email, password:data.temporaryPassword, name:data.account.displayName });
      setMsg('تم إنشاء الحساب وربطه بالمشاريع المحددة. يجب على المستخدم تغيير كلمة المرور عند أول دخول.');
      setNewAccount({ employeeId:'', bundleKey:'project_supervisor', projectIds:[] });
      await load(false);
      setSelectedUserId(data.account.userId);
    } catch (error) {
      setErr(error.message || 'تعذر إنشاء الحساب.');
    }
    setBusy('');
  }

  async function resetPassword() {
    if (!selectedUser) return;
    setBusy('reset'); setErr(''); setMsg(''); setCredentials(null);
    try {
      const data = await callAdmin({ action:'reset_password', userId:selectedUser.id });
      setCredentials({ email:selectedEmployee?.email || '', password:data.temporaryPassword, name:selectedEmployee?.full_name_ar || 'المستخدم' });
      setMsg('تم تعيين كلمة مرور مؤقتة جديدة. سيُطلب من المستخدم تغييرها عند أول دخول تالٍ.');
      await load();
    } catch (error) { setErr(error.message || 'تعذر إعادة تعيين كلمة المرور.'); }
    setBusy('');
  }

  async function setActive(isActive) {
    if (!selectedUser) return;
    setBusy('status'); setErr(''); setMsg('');
    try {
      await callAdmin({ action:'set_active', userId:selectedUser.id, isActive });
      setMsg(isActive ? 'تم تفعيل الحساب.' : 'تم تعطيل الحساب ومنع استخدام النظام.');
      await load();
    } catch (error) { setErr(error.message || 'تعذر تحديث حالة الحساب.'); }
    setBusy('');
  }

  async function setProjectAccess(projectId, bundleKey) {
    if (!selectedUserId || !projectId) return;
    setBusy(`grant-${projectId}`); setErr(''); setMsg('');
    try {
      await callAdmin({ action:'set_project_access', userId:selectedUserId, projectId, bundleKey });
      setMsg('تم تحديث صلاحية المشروع.');
      setNewGrant({ projectId:'', bundleKey:'project_supervisor' });
      await load();
    } catch (error) { setErr(error.message || 'تعذر تحديث صلاحية المشروع.'); }
    setBusy('');
  }

  async function revokeProject(projectId) {
    if (!selectedUserId || !projectId) return;
    setBusy(`revoke-${projectId}`); setErr(''); setMsg('');
    try {
      await callAdmin({ action:'revoke_project_access', userId:selectedUserId, projectId });
      setMsg('تم إلغاء وصول المستخدم إلى المشروع.');
      await load();
    } catch (error) { setErr(error.message || 'تعذر إلغاء صلاحية المشروع.'); }
    setBusy('');
  }

  async function copy(value, label) {
    await navigator.clipboard.writeText(value);
    setMsg(`تم نسخ ${label}.`);
  }

  if (!directory) return <div className="empty">جارٍ تحميل إدارة الدخول…</div>;

  return (
    <>
      <div className="page-head">
        <div><h1>إدارة الدخول</h1><p>حسابات الموظفين وكلمات المرور المؤقتة وصلاحيات المشاريع من مكان واحد</p></div>
      </div>

      {err && <div className="msg err" style={{marginBottom:14}}>{err}</div>}
      {msg && <div className="msg ok" style={{marginBottom:14}}>{msg}</div>}

      {credentials && <div className="section" style={{marginTop:0,marginBottom:16,border:'1px solid #b7d8c8'}}>
        <header><h2>بيانات دخول مؤقتة — تظهر الآن فقط</h2></header>
        <div style={{padding:18}}>
          <p style={{marginTop:0,lineHeight:1.8}}>أرسلها للمستخدم بطريقة آمنة. لا يحتفظ النظام بإمكانية عرض كلمة المرور الحالية بعد ذلك.</p>
          <div className="form-grid">
            <div className="field span2"><label>المستخدم</label><input readOnly value={credentials.name || '—'} /></div>
            <div className="field span2"><label>البريد الإلكتروني</label><div className="rowsplit"><input readOnly dir="ltr" value={credentials.email}/><button type="button" className="btn ghost" onClick={()=>copy(credentials.email,'البريد')}>نسخ</button></div></div>
            <div className="field span2"><label>كلمة المرور المؤقتة</label><div className="rowsplit"><input readOnly dir="ltr" value={credentials.password}/><button type="button" className="btn ghost" onClick={()=>copy(credentials.password,'كلمة المرور')}>نسخ</button></div></div>
          </div>
        </div>
      </div>}

      <div className="section" style={{marginTop:0,marginBottom:16}}>
        <header><h2>إنشاء حساب موظف</h2></header>
        <form onSubmit={provision} style={{padding:18}}>
          <div className="form-grid">
            <div className="field span2">
              <label>الموظف *</label>
              <select required value={newAccount.employeeId} onChange={(event)=>setNewAccount({...newAccount,employeeId:event.target.value})}>
                <option value="">اختر الموظف</option>
                {availableEmployees.map((employee)=><option key={employee.id} value={employee.id}>{employee.full_name_ar}{employee.job_title?` — ${employee.job_title}`:''}{employee.email?'':' — لا يوجد بريد'}</option>)}
              </select>
              <span className="hint">الحساب يُنشأ على البريد المسجل في ملف الموظف.</span>
            </div>
            <div className="field span2">
              <label>مستوى العمل داخل المشاريع *</label>
              <select value={newAccount.bundleKey} onChange={(event)=>setNewAccount({...newAccount,bundleKey:event.target.value})}>
                {PROJECT_ACCESS_BUNDLES.map((bundle)=><option key={bundle.key} value={bundle.key}>{bundle.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{marginTop:16}}>
            <label style={{display:'block',fontWeight:700,marginBottom:8}}>المشاريع المسموح بها *</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:8}}>
              {(directory.projects || []).map((project)=><label key={project.id} style={{display:'flex',gap:8,alignItems:'center',padding:'10px 12px',border:'1px solid var(--hair)',borderRadius:10,cursor:'pointer'}}>
                <input type="checkbox" checked={newAccount.projectIds.includes(project.id)} onChange={()=>toggleNewProject(project.id)}/>
                <span>{projectLabel(project)}</span>
              </label>)}
            </div>
          </div>

          <div className="rowsplit" style={{marginTop:16}}>
            <button className="btn" disabled={busy==='provision' || !newAccount.employeeId || !newAccount.projectIds.length}>{busy==='provision'?'جارٍ إنشاء الحساب…':'إنشاء الحساب وإصدار كلمة مرور مؤقتة'}</button>
            <span className="hint">لن يستطيع المستخدم رؤية أي مشروع غير المحدد هنا حتى لو عرف رابطه.</span>
          </div>
        </form>
      </div>

      <div className="section">
        <header><h2>الحسابات الحالية</h2><span>{(directory.users || []).length} حساب</span></header>
        <div style={{padding:18}}>
          <div className="field" style={{maxWidth:620}}>
            <label>اختر الحساب لإدارته</label>
            <select value={selectedUserId} onChange={(event)=>setSelectedUserId(event.target.value)}>
              <option value="">اختر المستخدم</option>
              {(directory.users || []).map((user)=>{
                const employee=employeeById.get(user.employee_id);
                return <option key={user.id} value={user.id}>{employee?.full_name_ar || user.id}{employee?.job_title?` — ${employee.job_title}`:''}{user.id===directory.primaryUserId?' — المستخدم الأساسي':''}</option>;
              })}
            </select>
          </div>

          {selectedUser && <>
            <div className="grid k4" style={{marginTop:14,marginBottom:16}}>
              <div className="card"><h3>المستخدم</h3><div className="big" style={{fontSize:17}}>{selectedEmployee?.full_name_ar || '—'}</div><div className="foot">{selectedEmployee?.job_title || selectedEmployee?.employee_no || '—'}</div></div>
              <div className="card"><h3>البريد</h3><div className="big" style={{fontSize:15,direction:'ltr'}}>{selectedEmployee?.email || 'غير مسجل'}</div></div>
              <div className="card"><h3>الحالة</h3><div className="big" style={{fontSize:17}}>{selectedUser.is_active?'مفعّل':'معطّل'}</div><div className="foot">{selectedUser.must_change_password?'بانتظار تغيير كلمة المرور':'كلمة المرور مستقرة'}</div></div>
              <div className="card"><h3>المشاريع</h3><div className="big">{selectedGrants.length}</div><div className="foot">مشروع مسند</div></div>
            </div>

            {selectedUser.id !== directory.primaryUserId && <div className="rowsplit" style={{marginBottom:18}}>
              <button type="button" className="btn ghost" disabled={busy==='reset'} onClick={resetPassword}>{busy==='reset'?'جارٍ التعيين…':'تعيين كلمة مرور مؤقتة'}</button>
              <button type="button" className="btn ghost" disabled={busy==='status'} onClick={()=>setActive(!selectedUser.is_active)}>{selectedUser.is_active?'تعطيل الحساب':'تفعيل الحساب'}</button>
            </div>}

            <div style={{borderTop:'1px solid var(--hair)',paddingTop:16}}>
              <h3 style={{margin:'0 0 12px'}}>صلاحيات المشاريع</h3>
              {selectedUser.id === directory.primaryUserId ? <div className="msg">المستخدم الأساسي يملك صلاحية النظام الكاملة ولا يحتاج إسناد مشاريع منفصل.</div> : <>
                {selectedGrants.length ? <div style={{display:'grid',gap:8}}>{selectedGrants.map((grant)=>{
                  const project=projectById.get(grant.scope_key);
                  const bundle=bundleById.get(grant.bundle_id);
                  return <div key={grant.id} style={{display:'grid',gridTemplateColumns:'minmax(260px,1fr) minmax(180px,260px) auto',gap:10,alignItems:'center',padding:'10px 12px',border:'1px solid var(--hair)',borderRadius:10}}>
                    <strong>{project ? projectLabel(project) : grant.scope_key}</strong>
                    <select value={bundle?.bundle_key || 'project_supervisor'} disabled={busy===`grant-${grant.scope_key}`} onChange={(event)=>setProjectAccess(grant.scope_key,event.target.value)}>
                      {PROJECT_ACCESS_BUNDLES.map((item)=><option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                    <button type="button" className="btn ghost" disabled={busy===`revoke-${grant.scope_key}`} onClick={()=>revokeProject(grant.scope_key)}>إلغاء الوصول</button>
                  </div>;
                })}</div> : <div className="empty">لا توجد مشاريع مسندة لهذا المستخدم.</div>}

                <div className="form-grid" style={{marginTop:14,alignItems:'end'}}>
                  <div className="field span2"><label>إضافة مشروع</label><select value={newGrant.projectId} onChange={(event)=>setNewGrant({...newGrant,projectId:event.target.value})}><option value="">اختر المشروع</option>{addableProjects.map((project)=><option key={project.id} value={project.id}>{projectLabel(project)}</option>)}</select></div>
                  <div className="field"><label>مستوى الصلاحية</label><select value={newGrant.bundleKey} onChange={(event)=>setNewGrant({...newGrant,bundleKey:event.target.value})}>{PROJECT_ACCESS_BUNDLES.map((bundle)=><option key={bundle.key} value={bundle.key}>{bundle.label}</option>)}</select></div>
                  <div className="field"><label>&nbsp;</label><button type="button" className="btn" disabled={!newGrant.projectId || busy===`grant-${newGrant.projectId}`} onClick={()=>setProjectAccess(newGrant.projectId,newGrant.bundleKey)}>إسناد المشروع</button></div>
                </div>
              </>}
            </div>
          </>}
        </div>
      </div>
    </>
  );
}
