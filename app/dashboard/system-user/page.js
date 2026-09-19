'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PROJECT_ACCESS_LEVELS } from '@/lib/access-ui';
import DocumentPackAccessManager from '@/components/documents/DocumentPackAccessManager';

const ERROR_AR = {
  forbidden: 'هذا الحساب لا يملك صلاحية إدارة الدخول.',
  employee_required: 'اختر الموظف أولًا.',
  employee_not_found: 'تعذر العثور على الموظف.',
  employee_email_required: 'يجب تسجيل بريد إلكتروني للموظف قبل إنشاء حساب الدخول.',
  account_exists: 'يوجد حساب دخول لهذا الموظف بالفعل.',
  archived_account_exists: 'يوجد لهذا الموظف حساب مؤرشف محفوظ لأغراض السجل التاريخي.',
  email_account_exists: 'هذا البريد مرتبط بحساب آخر ولا يمكن استخدامه تلقائيًا.',
  project_required: 'اختر مشروعًا واحدًا على الأقل لهذا المستوى.',
  project_not_found: 'أحد المشاريع المحددة غير موجود أو لم يعد متاحًا.',
  invalid_access_level: 'مستوى الصلاحية غير صحيح.',
  invalid_access_profile: 'نوع المستخدم غير صحيح.',
  approval_route_required: 'اختر مسار اعتماد واحدًا على الأقل للمستخدم الإداري.',
  password_reset_failed: 'تعذر تعيين كلمة المرور المؤقتة.',
  cannot_disable_self: 'لا يمكنك تعطيل حسابك الحالي من هذه الشاشة.',
  cannot_delete_self: 'لا يمكنك حذف حسابك الحالي من هذه الشاشة.',
  primary_user_protected: 'المستخدم الرئيسي محمي ولا يمكن حذفه أو تقليص صلاحياته.',
  account_archived: 'هذا الحساب مؤرشف ولا يقبل تعديلات تشغيلية.',
  impact_scan_failed: 'تعذر فحص أثر المستخدم على بيانات البرنامج.',
};

const ACCESS_PROFILES = Object.freeze([
  { key:'operational', label:'تنفيذي / تشغيلي', description:'يعمل داخل البوابات الممنوحة له، ويمكن إضافة مسارات اعتماد فوق صلاحياته التشغيلية.' },
  { key:'approval_only', label:'إداري — اعتمادات فقط', description:'لا يدخل البوابات التنفيذية؛ يرى فقط المستندات والمعاملات الموجهة إليه في مكتب الاعتمادات.' },
]);

const MODULE_LABELS = Object.freeze({projects:'المشاريع',hr:'الموارد البشرية',finance:'المالية',documents:'المستندات',admin:'الإدارة',approvals:'الاعتمادات'});

const MANAGED_BUNDLES = new Set([
  'projects_full_access',
  'project_site_supervisor',
  'project_manager',
  'project_supervisor',
  'project_originator',
]);

function projectLabel(project) {
  return `${project.project_no || '—'} — ${project.name_ar}${project.city ? ` · ${project.city}` : ''}`;
}

function levelForGrants(grants, bundleById) {
  const active = grants.filter((grant) => grant.is_active && bundleById.has(grant.bundle_id));
  const expanded = active.map((grant) => ({ ...grant, bundle: bundleById.get(grant.bundle_id) }));

  if (expanded.some((grant) => grant.bundle.bundle_key === 'projects_full_access' && grant.scope_type === 'all')) {
    return { key: 'projects_portal_full', projectIds: [] };
  }

  const fullProjects = expanded
    .filter((grant) => grant.bundle.bundle_key === 'projects_full_access' && grant.scope_type === 'project')
    .map((grant) => grant.scope_key);
  if (fullProjects.length) return { key: 'project_supervisor', projectIds: [...new Set(fullProjects)] };

  const siteProjects = expanded
    .filter((grant) => grant.bundle.bundle_key === 'project_site_supervisor' && grant.scope_type === 'project')
    .map((grant) => grant.scope_key);
  if (siteProjects.length) return { key: 'site_supervisor', projectIds: [...new Set(siteProjects)] };

  return { key: 'projects_portal_full', projectIds: [] };
}

export default function SystemUserPage() {
  const [directory, setDirectory] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [deletePlan, setDeletePlan] = useState(null);
  const [newAccount, setNewAccount] = useState({ employeeId: '', accessProfile:'operational', accessLevel: 'projects_portal_full', projectIds: [], approvalCapabilities:[] });
  const [editAccess, setEditAccess] = useState({ accessProfile:'operational', accessLevel: 'projects_portal_full', projectIds: [], approvalCapabilities:[] });

  async function callAdmin(body) {
    const { data, error } = await supabase.functions.invoke('system-user-admin', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.message || ERROR_AR[data.error] || data.error);
    return data;
  }

  async function load(keepSelection = true) {
    setErr('');
    try {
      const data = await callAdmin({ action: 'directory' });
      setDirectory(data);

      const visible = (data.users || []).filter(
        (user) => !user.archived_at && (user.employee_id || user.id === data.primaryUserId),
      );
      const next = keepSelection && selectedUserId && visible.some((user) => user.id === selectedUserId)
        ? selectedUserId
        : (visible.find((user) => user.id !== data.primaryUserId)?.id || data.primaryUserId || '');
      setSelectedUserId(next);
    } catch (error) {
      setErr(error.message || 'تعذر تحميل إدارة الدخول.');
      setDirectory({ employees: [], users: [], grants: [], bundles: [], projects: [], approvalPolicies:[], overrides:[], primaryUserId: null });
    }
  }

  useEffect(() => { load(false); }, []);

  const employeeById = useMemo(
    () => new Map((directory?.employees || []).map((employee) => [employee.id, employee])),
    [directory],
  );
  const bundleById = useMemo(
    () => new Map((directory?.bundles || []).filter((bundle) => MANAGED_BUNDLES.has(bundle.bundle_key)).map((bundle) => [bundle.id, bundle])),
    [directory],
  );
  const activeUsers = useMemo(
    () => (directory?.users || []).filter((user) => !user.archived_at && (user.employee_id || user.id === directory?.primaryUserId)),
    [directory],
  );
  const accountEmployeeIds = useMemo(
    () => new Set((directory?.users || []).map((user) => user.employee_id).filter(Boolean)),
    [directory],
  );
  const availableEmployees = useMemo(
    () => (directory?.employees || []).filter((employee) => employee.status !== 'terminated' && !accountEmployeeIds.has(employee.id)),
    [directory, accountEmployeeIds],
  );
  const selectedUser = useMemo(
    () => activeUsers.find((user) => user.id === selectedUserId) || null,
    [activeUsers, selectedUserId],
  );
  const selectedEmployee = selectedUser ? employeeById.get(selectedUser.employee_id) : null;
  const selectedGrants = useMemo(
    () => (directory?.grants || []).filter((grant) => grant.user_id === selectedUserId),
    [directory, selectedUserId],
  );
  const detectedAccess = useMemo(
    () => levelForGrants(selectedGrants, bundleById),
    [selectedGrants, bundleById],
  );
  const approvalPolicies = useMemo(() => directory?.approvalPolicies || [], [directory]);
  const selectedApprovalCapabilities = useMemo(() => {
    const allowed=new Set((directory?.overrides||[])
      .filter(row=>row.user_id===selectedUserId&&row.is_active&&row.effect==='allow')
      .map(row=>row.capability_key));
    return approvalPolicies.map(row=>row.capability_key).filter(key=>allowed.has(key));
  }, [directory, selectedUserId, approvalPolicies]);

  useEffect(() => {
    setEditAccess({
      ...detectedAccess,
      accessProfile:selectedUser?.access_profile||'operational',
      approvalCapabilities:selectedApprovalCapabilities,
    });
    setDeletePlan(null);
  }, [selectedUserId, selectedUser?.access_profile, detectedAccess.key, JSON.stringify(detectedAccess.projectIds), JSON.stringify(selectedApprovalCapabilities)]);

  function toggleProject(setter, projectId) {
    setter((current) => ({
      ...current,
      projectIds: current.projectIds.includes(projectId)
        ? current.projectIds.filter((id) => id !== projectId)
        : [...current.projectIds, projectId],
    }));
  }

  async function provision(event) {
    event.preventDefault();
    setBusy('provision');
    setErr('');
    setMsg('');
    setCredentials(null);
    try {
      const data = await callAdmin({ action: 'provision', ...newAccount });
      setCredentials({ email: data.account.email, password: data.temporaryPassword, name: data.account.displayName });
      setMsg('تم إنشاء المستخدم. يبدأ من صفحة اليوم ويغيّر كلمة المرور عند أول دخول.');
      setNewAccount({ employeeId: '', accessProfile:'operational', accessLevel: 'projects_portal_full', projectIds: [], approvalCapabilities:[] });
      await load(false);
      setSelectedUserId(data.account.userId);
    } catch (error) {
      setErr(error.message || 'تعذر إنشاء المستخدم.');
    }
    setBusy('');
  }

  async function saveAccess() {
    if (!selectedUser || selectedUser.id === directory.primaryUserId) return;
    setBusy('access');
    setErr('');
    setMsg('');
    try {
      await callAdmin({ action: 'set_access_profile', userId: selectedUser.id, ...editAccess });
      setMsg(editAccess.accessProfile==='approval_only'?'تم حفظ المستخدم كإداري اعتمادات فقط، مع المسارات المحددة.':'تم حفظ الصلاحيات التشغيلية ومسارات الاعتماد المحددة.');
      await load();
    } catch (error) {
      setErr(error.message || 'تعذر حفظ الصلاحية.');
    }
    setBusy('');
  }

  async function resetPassword() {
    if (!selectedUser || selectedUser.id === directory.primaryUserId) return;
    setBusy('reset');
    setErr('');
    setMsg('');
    setCredentials(null);
    try {
      const data = await callAdmin({ action: 'reset_password', userId: selectedUser.id });
      setCredentials({
        email: selectedUser.auth_email || selectedEmployee?.email || '',
        password: data.temporaryPassword,
        name: selectedEmployee?.full_name_ar || selectedUser.auth_email || 'المستخدم',
      });
      setMsg('تم إصدار كلمة مرور مؤقتة جديدة، وسيُطلب تغييرها عند أول دخول.');
      await load();
    } catch (error) {
      setErr(error.message || 'تعذر إعادة تعيين كلمة المرور.');
    }
    setBusy('');
  }

  async function setActive(isActive) {
    if (!selectedUser || selectedUser.id === directory.primaryUserId) return;
    setBusy('status');
    setErr('');
    setMsg('');
    try {
      await callAdmin({ action: 'set_active', userId: selectedUser.id, isActive });
      setMsg(isActive ? 'تم تفعيل الحساب.' : 'تم تعطيل الحساب ومنع استخدام النظام.');
      await load();
    } catch (error) {
      setErr(error.message || 'تعذر تحديث حالة الحساب.');
    }
    setBusy('');
  }

  async function prepareDelete() {
    if (!selectedUser || selectedUser.id === directory.primaryUserId) return;
    setBusy('delete-preview');
    setErr('');
    setMsg('');
    setDeletePlan(null);
    try {
      const data = await callAdmin({ action: 'delete_preview', userId: selectedUser.id });
      setDeletePlan({ ...data, userId: selectedUser.id, name: selectedEmployee?.full_name_ar || selectedUser.auth_email || 'المستخدم' });
    } catch (error) {
      setErr(error.message || 'تعذر فحص المستخدم قبل الحذف.');
    }
    setBusy('');
  }

  async function confirmDelete() {
    if (!deletePlan?.userId) return;
    setBusy('delete');
    setErr('');
    try {
      const data = await callAdmin({ action: 'delete_user', userId: deletePlan.userId });
      setDeletePlan(null);
      setCredentials(null);
      setMsg(
        data.mode === 'deleted'
          ? 'تم حذف المستخدم نهائيًا بعد التأكد من عدم وجود بيانات مرتبطة به.'
          : `تمت إزالة المستخدم من النظام مع الاحتفاظ بكامل سجله وبياناته (${data.impactCount || 0} ارتباط محفوظ).`,
      );
      await load(false);
    } catch (error) {
      setErr(error.message || 'تعذر حذف المستخدم.');
    }
    setBusy('');
  }

  async function copy(value, label) {
    await navigator.clipboard.writeText(value);
    setMsg(`تم نسخ ${label}.`);
  }

  if (!directory) return <div className="empty">جارٍ تحميل إدارة الدخول…</div>;

  const newLevel = PROJECT_ACCESS_LEVELS.find((level) => level.key === newAccount.accessLevel) || PROJECT_ACCESS_LEVELS[0];
  const editLevel = PROJECT_ACCESS_LEVELS.find((level) => level.key === editAccess.accessLevel) || PROJECT_ACCESS_LEVELS[0];
  const newProfile = ACCESS_PROFILES.find((item)=>item.key===newAccount.accessProfile)||ACCESS_PROFILES[0];
  const editProfile = ACCESS_PROFILES.find((item)=>item.key===editAccess.accessProfile)||ACCESS_PROFILES[0];

  return <>
    <div className="page-head">
      <div>
        <h1>إدارة الدخول</h1>
        <p>أنشئ المستخدمين، امنح البوابات والصلاحيات، وأدر كلمات المرور والحذف الآمن من مكان واحد.</p>
      </div>
    </div>

    {err && <div className="msg err" style={{ marginBottom: 14 }}>{err}</div>}
    {msg && <div className="msg ok" style={{ marginBottom: 14 }}>{msg}</div>}

    <div className="section" style={{ marginTop: 0, marginBottom: 16 }}>
      <header><h2>إنشاء مستخدم جديد</h2></header>
      <form onSubmit={provision} style={{ padding: 18 }}>
        <div className="form-grid">
          <div className="field span2">
            <label>الموظف *</label>
            <select required value={newAccount.employeeId} onChange={(event) => setNewAccount({ ...newAccount, employeeId: event.target.value })}>
              <option value="">اختر الموظف</option>
              {availableEmployees.map((employee) => <option key={employee.id} value={employee.id}>
                {employee.full_name_ar}{employee.job_title ? ` — ${employee.job_title}` : ''}{employee.email ? '' : ' — لا يوجد بريد'}
              </option>)}
            </select>
          </div>
          <div className="field span2">
            <label>نوع المستخدم *</label>
            <select value={newAccount.accessProfile} onChange={(event) => setNewAccount({ ...newAccount, accessProfile:event.target.value, projectIds:[] })}>
              {ACCESS_PROFILES.map((profile)=><option key={profile.key} value={profile.key}>{profile.label}</option>)}
            </select>
            <span className="hint">{newProfile.description}</span>
          </div>
          {newAccount.accessProfile==='operational'?<div className="field span2">
            <label>مستوى الوصول التشغيلي *</label>
            <select value={newAccount.accessLevel} onChange={(event) => setNewAccount({ ...newAccount, accessLevel: event.target.value, projectIds: [] })}>
              {PROJECT_ACCESS_LEVELS.map((level) => <option key={level.key} value={level.key}>{level.label}</option>)}
            </select>
            <span className="hint">{newLevel.description}</span>
          </div>:null}
        </div>
        {newAccount.accessProfile==='operational'&&newLevel.scopeType === 'project' && <ProjectPicker projects={directory.projects || []} selected={newAccount.projectIds} onToggle={(id) => toggleProject(setNewAccount, id)} />}
        <ApprovalPermissionPicker policies={approvalPolicies} selected={newAccount.approvalCapabilities} onToggle={(key)=>setNewAccount(current=>({...current,approvalCapabilities:current.approvalCapabilities.includes(key)?current.approvalCapabilities.filter(x=>x!==key):[...current.approvalCapabilities,key]}))} />
        <div className="rowsplit" style={{ marginTop: 16 }}>
          <button className="btn" disabled={busy === 'provision' || !newAccount.employeeId || (newAccount.accessProfile==='operational'&&newLevel.scopeType === 'project' && !newAccount.projectIds.length) || (newAccount.accessProfile==='approval_only'&&!newAccount.approvalCapabilities.length)}>
            {busy === 'provision' ? 'جارٍ إنشاء المستخدم…' : 'إنشاء المستخدم وكلمة مرور مؤقتة'}
          </button>
          <span className="hint">{newAccount.accessProfile==='approval_only'?'سيبدأ مباشرة من مكتب الاعتمادات.':'يمكنه العمل في بوابته، وتظهر له الاعتمادات المختارة عند توجيهها إليه.'}</span>
        </div>
      </form>
    </div>

    {credentials && <div className="section" style={{ marginTop: 0, marginBottom: 16, border: '1px solid #b7d8c8' }}>
      <header><h2>بيانات الدخول المؤقتة — تظهر الآن فقط</h2></header>
      <div style={{ padding: 18 }}>
        <div className="form-grid">
          <div className="field span2"><label>المستخدم</label><input readOnly value={credentials.name || '—'} /></div>
          <div className="field span2"><label>البريد الإلكتروني</label><div className="rowsplit"><input readOnly dir="ltr" value={credentials.email} /><button type="button" className="btn ghost" onClick={() => copy(credentials.email, 'البريد')}>نسخ</button></div></div>
          <div className="field span2"><label>كلمة المرور المؤقتة</label><div className="rowsplit"><input readOnly dir="ltr" value={credentials.password} /><button type="button" className="btn ghost" onClick={() => copy(credentials.password, 'كلمة المرور')}>نسخ</button></div></div>
        </div>
      </div>
    </div>}

    <div className="section">
      <header><h2>المستخدمون الحاليون</h2><span>{activeUsers.length} مستخدم</span></header>
      <div style={{ padding: 18 }}>
        <div className="field" style={{ maxWidth: 680 }}>
          <label>اختر المستخدم</label>
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
            <option value="">اختر المستخدم</option>
            {activeUsers.map((user) => {
              const employee = employeeById.get(user.employee_id);
              return <option key={user.id} value={user.id}>
                {employee?.full_name_ar || user.auth_email || user.id}{user.id === directory.primaryUserId ? ' — المستخدم الرئيسي' : ''}
              </option>;
            })}
          </select>
        </div>

        {selectedUser && <>
          <div className="grid k4" style={{ marginTop: 14, marginBottom: 16 }}>
            <div className="card"><h3>المستخدم</h3><div className="big" style={{ fontSize: 17 }}>{selectedEmployee?.full_name_ar || '—'}</div><div className="foot">{selectedEmployee?.job_title || '—'}</div></div>
            <div className="card"><h3>البريد</h3><div className="big" style={{ fontSize: 14, direction: 'ltr' }}>{selectedUser.auth_email || selectedEmployee?.email || '—'}</div></div>
            <div className="card"><h3>الحالة</h3><div className="big" style={{ fontSize: 17 }}>{selectedUser.is_active ? 'مفعّل' : 'معطّل'}</div><div className="foot">{selectedUser.must_change_password ? 'ينتظر تغيير كلمة المرور' : 'كلمة المرور مستقرة'}</div></div>
            <div className="card"><h3>الوصول</h3><div className="big" style={{ fontSize: 16 }}>{selectedUser.id === directory.primaryUserId ? 'كل النظام' : selectedUser.access_profile==='approval_only'?'إداري — اعتمادات فقط':(PROJECT_ACCESS_LEVELS.find((level) => level.key === detectedAccess.key)?.label || '—')}</div></div>
          </div>

          {selectedUser.id === directory.primaryUserId
            ? <div className="msg">المستخدم الرئيسي صاحب جميع البوابات والصلاحيات ومحمي من الحذف أو التعطيل.</div>
            : <>
              <div className="section" style={{ margin: '0 0 14px' }}>
                <header><h2>صلاحية المستخدم</h2></header>
                <div style={{ padding: 16 }}>
                  <div className="field" style={{ maxWidth: 620 }}>
                    <label>نوع المستخدم</label>
                    <select value={editAccess.accessProfile} onChange={(event) => setEditAccess(current=>({ ...current, accessProfile:event.target.value, projectIds:event.target.value==='approval_only'?[]:current.projectIds }))}>
                      {ACCESS_PROFILES.map((profile)=><option key={profile.key} value={profile.key}>{profile.label}</option>)}
                    </select>
                    <span className="hint">{editProfile.description}</span>
                  </div>
                  {editAccess.accessProfile==='operational'?<div className="field" style={{ maxWidth: 620, marginTop:12 }}>
                    <label>المستوى التشغيلي</label>
                    <select value={editAccess.accessLevel} onChange={(event) => setEditAccess(current=>({ ...current, accessLevel: event.target.value, projectIds: [] }))}>
                      {PROJECT_ACCESS_LEVELS.map((level) => <option key={level.key} value={level.key}>{level.label}</option>)}
                    </select>
                    <span className="hint">{editLevel.description}</span>
                  </div>:null}
                  {editAccess.accessProfile==='operational'&&editLevel.scopeType === 'project' && <ProjectPicker projects={directory.projects || []} selected={editAccess.projectIds} onToggle={(id) => toggleProject(setEditAccess, id)} />}
                  <ApprovalPermissionPicker policies={approvalPolicies} selected={editAccess.approvalCapabilities} onToggle={(key)=>setEditAccess(current=>({...current,approvalCapabilities:current.approvalCapabilities.includes(key)?current.approvalCapabilities.filter(x=>x!==key):[...current.approvalCapabilities,key]}))} />
                  <button className="btn" style={{ marginTop: 14 }} onClick={saveAccess} disabled={busy === 'access' || (editAccess.accessProfile==='operational'&&editLevel.scopeType === 'project' && !editAccess.projectIds.length) || (editAccess.accessProfile==='approval_only'&&!editAccess.approvalCapabilities.length)}>
                    {busy === 'access' ? 'جارٍ الحفظ…' : 'حفظ نوع المستخدم ومسارات الاعتماد'}
                  </button>
                </div>
              </div>

              <div className="rowsplit" style={{ justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn ghost" onClick={resetPassword} disabled={busy === 'reset'}>{busy === 'reset' ? 'جارٍ إعادة التعيين…' : 'إصدار كلمة مرور مؤقتة'}</button>
                <button className="btn ghost" onClick={() => setActive(!selectedUser.is_active)} disabled={busy === 'status'}>{selectedUser.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}</button>
                <button className="btn ghost" onClick={prepareDelete} disabled={busy === 'delete-preview' || busy === 'delete'}>{busy === 'delete-preview' ? 'جارٍ فحص الأثر…' : 'حذف المستخدم'}</button>
              </div>
            </>}
          {selectedUser.access_profile!=='approval_only'?<DocumentPackAccessManager userId={selectedUser.id} primaryUserId={directory.primaryUserId} />:null}
        </>}
      </div>
    </div>

    {deletePlan && <div className="section" style={{ marginTop: 16, border: '1px solid #d8b7b7' }}>
      <header><h2>تأكيد حذف المستخدم</h2></header>
      <div style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>{deletePlan.name}</h3>
        {deletePlan.mode === 'delete'
          ? <div className="msg ok">فحص النظام لم يجد أي بيانات أو ملفات أو سجلات مرتبطة بهذا المستخدم. يمكن حذف الحساب نهائيًا دون التأثير على البرنامج.</div>
          : <div className="msg">وجد النظام <strong>{deletePlan.impactCount}</strong> ارتباطًا تاريخيًا أو تشغيليًا. لن تُحذف أي بيانات؛ سيتم منع الدخول وإخفاء المستخدم من القائمة مع الاحتفاظ بكل سجله.</div>}
        <div className="rowsplit" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={confirmDelete} disabled={busy === 'delete'}>{busy === 'delete' ? 'جارٍ التنفيذ…' : (deletePlan.mode === 'delete' ? 'تأكيد الحذف النهائي' : 'إزالة المستخدم مع حفظ السجل')}</button>
          <button className="btn ghost" onClick={() => setDeletePlan(null)} disabled={busy === 'delete'}>إلغاء</button>
        </div>
      </div>
    </div>}
  </>;
}

function ApprovalPermissionPicker({ policies, selected, onToggle }) {
  const groups=policies.reduce((acc,row)=>{
    const key=row.source_module||'other';
    if(!acc[key])acc[key]=[];
    acc[key].push(row);
    return acc;
  },{});
  return <div style={{ marginTop:16 }}>
    <div style={{fontWeight:800,marginBottom:4}}>مسارات الاعتماد</div>
    <div className="hint" style={{marginBottom:10}}>اختر أكثر من معاملة. هذه الصلاحيات تمنح حق القرار فقط، ولا تمنح دخول البوابة التنفيذية بذاتها.</div>
    {Object.keys(groups).length===0?<div className="empty">لا توجد مسارات اعتماد معرفة حاليًا.</div>:<div style={{display:'grid',gap:12}}>
      {Object.entries(groups).map(([module,rows])=><div key={module} style={{border:'1px solid var(--hair)',borderRadius:12,padding:12}}>
        <strong style={{display:'block',marginBottom:8}}>{MODULE_LABELS[module]||module}</strong>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:8}}>
          {rows.map((row)=><label key={row.capability_key} style={{display:'flex',gap:8,alignItems:'flex-start',padding:'9px 10px',border:'1px solid rgba(111,37,43,.12)',borderRadius:9,cursor:'pointer'}}>
            <input type="checkbox" checked={selected.includes(row.capability_key)} onChange={()=>onToggle(row.capability_key)} />
            <span><strong style={{display:'block'}}>{row.label_ar}</strong><small>{row.initial_target_group_label||'مسار اعتماد'}{row.allow_additional?' · يسمح بالتوجيه لاعتماد إضافي':''}</small></span>
          </label>)}
        </div>
      </div>)}
    </div>}
  </div>;
}

function ProjectPicker({ projects, selected, onToggle }) {
  return <div style={{ marginTop: 16 }}>
    <label style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>المشاريع المسموح بها *</label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 8 }}>
      {projects.map((project) => <label key={project.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--hair)', borderRadius: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={selected.includes(project.id)} onChange={() => onToggle(project.id)} />
        <span>{projectLabel(project)}</span>
      </label>)}
    </div>
  </div>;
}
