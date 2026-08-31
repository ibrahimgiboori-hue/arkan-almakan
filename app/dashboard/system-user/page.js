'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildAccessTree, emptyAccessDraft, scopeOptionsForPortal } from '@/lib/access-tree';

const ERROR_AR = {
  forbidden: 'هذا الحساب لا يملك صلاحية إدارة الدخول.',
  employee_required: 'اختر الموظف أولًا.',
  employee_not_found: 'تعذر العثور على الموظف.',
  employee_email_required: 'يجب تسجيل بريد إلكتروني للموظف قبل إنشاء حساب الدخول.',
  external_name_required: 'اكتب اسم المستخدم الخارجي.',
  external_email_required: 'اكتب بريدًا إلكترونيًا صحيحًا للمستخدم الخارجي.',
  invalid_account_type: 'نوع المستخدم غير صحيح.',
  account_exists: 'يوجد حساب دخول لهذا الموظف بالفعل.',
  archived_account_exists: 'يوجد لهذا المستخدم حساب مؤرشف محفوظ لأغراض السجل التاريخي.',
  email_account_exists: 'هذا البريد مرتبط بحساب آخر ولا يمكن استخدامه تلقائيًا.',
  access_tree_required: 'شجرة الصلاحيات غير مكتملة.',
  access_tree_save_failed: 'تعذر حفظ شجرة الصلاحيات.',
  password_reset_failed: 'تعذر تعيين كلمة المرور المؤقتة.',
  cannot_disable_self: 'لا يمكنك تعطيل حسابك الحالي من هذه الشاشة.',
  cannot_delete_self: 'لا يمكنك حذف حسابك الحالي من هذه الشاشة.',
  primary_user_protected: 'المستخدم الرئيسي محمي ولا يمكن حذفه أو تقليص صلاحياته.',
  account_archived: 'هذا الحساب مؤرشف ولا يقبل تعديلات تشغيلية.',
  impact_scan_failed: 'تعذر فحص أثر المستخدم على بيانات البرنامج.',
};

function projectLabel(project) {
  return `${project.project_no || '—'} — ${project.name_ar}${project.city ? ` · ${project.city}` : ''}`;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function userDisplayName(user, employeeById) {
  const employee = user?.employee_id ? employeeById.get(user.employee_id) : null;
  return employee?.full_name_ar || user?.auth_display_name || user?.auth_email || 'مستخدم';
}

function userTypeLabel(user) {
  return user?.employee_id || user?.auth_account_type === 'employee' ? 'موظف' : 'مستخدم خارجي';
}

function capabilityPortals(directory) {
  const map = new Map();
  (directory?.portalCapabilityMap || []).forEach((row) => {
    if (!map.has(row.capability_key)) map.set(row.capability_key, []);
    map.get(row.capability_key).push(row.portal_key);
  });
  return map;
}

function deriveAccessDraft(directory, tree, userId) {
  const draft = emptyAccessDraft(tree);
  const portalByFullBundle = new Map((directory?.portalFullBundles || []).map((row) => [row.bundle_id, row.portal_key]));
  const bundleCaps = new Map();
  const capPortals = capabilityPortals(directory);
  const scopeSeen = new Set();

  (directory?.bundleCapabilities || []).forEach((row) => {
    if (!bundleCaps.has(row.bundle_id)) bundleCaps.set(row.bundle_id, []);
    bundleCaps.get(row.bundle_id).push(row.capability_key);
  });

  function mergeScope(portalKey, scopeType, scopeKey) {
    const node = draft[portalKey];
    if (!node) return;
    const already = scopeSeen.has(portalKey);
    if (scopeType === 'all') {
      node.scopeType = 'all';
      node.scopeKeys = [];
      scopeSeen.add(portalKey);
      return;
    }
    if (scopeType === 'project' && portalKey === 'projects') {
      if (!already || node.scopeType !== 'all') node.scopeType = 'project';
      if (node.scopeType === 'project' && scopeKey) node.scopeKeys = unique([...node.scopeKeys, scopeKey]);
      scopeSeen.add(portalKey);
    }
  }

  const grants = (directory?.grants || []).filter((grant) => grant.user_id === userId && grant.is_active);

  grants.forEach((grant) => {
    const portalKey = portalByFullBundle.get(grant.bundle_id);
    if (!portalKey || !draft[portalKey]) return;
    draft[portalKey].mode = 'full';
    mergeScope(portalKey, grant.scope_type, grant.scope_key);
  });

  grants.forEach((grant) => {
    if (portalByFullBundle.has(grant.bundle_id)) return;
    (bundleCaps.get(grant.bundle_id) || []).forEach((capabilityKey) => {
      (capPortals.get(capabilityKey) || []).forEach((portalKey) => {
        const node = draft[portalKey];
        if (!node || node.mode === 'full') return;
        node.mode = 'partial';
        node.selectedCapabilities = unique([...node.selectedCapabilities, capabilityKey]);
        mergeScope(portalKey, grant.scope_type, grant.scope_key);
      });
    });
  });

  const overrides = (directory?.overrides || []).filter((row) => row.user_id === userId && row.is_active);
  overrides.filter((row) => row.effect === 'allow').forEach((row) => {
    (capPortals.get(row.capability_key) || []).forEach((portalKey) => {
      const node = draft[portalKey];
      if (!node || node.mode === 'full') return;
      node.mode = 'partial';
      node.selectedCapabilities = unique([...node.selectedCapabilities, row.capability_key]);
      mergeScope(portalKey, row.scope_type, row.scope_key);
    });
  });

  overrides.filter((row) => row.effect === 'deny').forEach((row) => {
    (capPortals.get(row.capability_key) || []).forEach((portalKey) => {
      const node = draft[portalKey];
      if (!node) return;
      if (node.mode === 'full') {
        node.excludedCapabilities = unique([...node.excludedCapabilities, row.capability_key]);
      } else {
        node.selectedCapabilities = node.selectedCapabilities.filter((key) => key !== row.capability_key);
      }
    });
  });

  Object.values(draft).forEach((node) => {
    node.selectedCapabilities = unique(node.selectedCapabilities);
    node.excludedCapabilities = unique(node.excludedCapabilities);
    node.scopeKeys = unique(node.scopeKeys);
    if (node.mode === 'partial' && node.selectedCapabilities.length === 0) node.mode = 'none';
  });

  return draft;
}

function riskText(level) {
  if (level >= 3) return 'صلاحية حساسة';
  if (level === 2) return 'صلاحية مرتفعة';
  return '';
}

export default function SystemUserPage() {
  const [directory, setDirectory] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [credentials, setCredentials] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [deletePlan, setDeletePlan] = useState(null);
  const [newAccount, setNewAccount] = useState({
    accountType: 'employee', employeeId: '', displayName: '', email: '',
  });
  const [accessDraft, setAccessDraft] = useState({});

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
      const visible = (data.users || []).filter((user) => !user.archived_at);
      const next = keepSelection && selectedUserId && visible.some((user) => user.id === selectedUserId)
        ? selectedUserId
        : (visible.find((user) => user.id !== data.primaryUserId)?.id || data.primaryUserId || '');
      setSelectedUserId(next);
    } catch (error) {
      setErr(error.message || 'تعذر تحميل إدارة الدخول.');
      setDirectory({
        employees: [], users: [], grants: [], overrides: [], bundles: [], bundleCapabilities: [],
        capabilities: [], portalCapabilityMap: [], portalFullBundles: [], projects: [], primaryUserId: null,
      });
    }
  }

  useEffect(() => { load(false); }, []);

  const tree = useMemo(
    () => buildAccessTree(directory?.capabilities || [], directory?.portalCapabilityMap || []),
    [directory?.capabilities, directory?.portalCapabilityMap],
  );
  const employeeById = useMemo(
    () => new Map((directory?.employees || []).map((employee) => [employee.id, employee])),
    [directory?.employees],
  );
  const managedUsers = useMemo(
    () => (directory?.users || []).filter((user) => !user.archived_at),
    [directory?.users],
  );
  const accountEmployeeIds = useMemo(
    () => new Set((directory?.users || []).map((user) => user.employee_id).filter(Boolean)),
    [directory?.users],
  );
  const availableEmployees = useMemo(
    () => (directory?.employees || []).filter((employee) => employee.status !== 'terminated' && !accountEmployeeIds.has(employee.id)),
    [directory?.employees, accountEmployeeIds],
  );
  const selectedUser = useMemo(
    () => managedUsers.find((user) => user.id === selectedUserId) || null,
    [managedUsers, selectedUserId],
  );
  const selectedEmployee = selectedUser?.employee_id ? employeeById.get(selectedUser.employee_id) : null;
  const isPrimary = Boolean(selectedUser && selectedUser.id === directory?.primaryUserId);

  useEffect(() => {
    if (!directory || !selectedUserId || !tree.length) return;
    setAccessDraft(deriveAccessDraft(directory, tree, selectedUserId));
    setDeletePlan(null);
  }, [directory, selectedUserId, tree]);

  function updatePortal(portalKey, updater) {
    setAccessDraft((current) => {
      const base = current[portalKey] || emptyAccessDraft(tree)[portalKey];
      return { ...current, [portalKey]: updater({ ...base }) };
    });
  }

  function setPortalMode(portal, mode) {
    updatePortal(portal.key, (node) => {
      if (mode === 'full') {
        return { ...node, mode: 'full', selectedCapabilities: [], excludedCapabilities: [] };
      }
      if (mode === 'partial') {
        const selected = node.mode === 'full'
          ? portal.capabilityKeys.filter((key) => !node.excludedCapabilities.includes(key))
          : node.selectedCapabilities;
        return { ...node, mode: 'partial', selectedCapabilities: unique(selected), excludedCapabilities: [] };
      }
      return { ...node, mode: 'none', selectedCapabilities: [], excludedCapabilities: [], scopeType: 'all', scopeKeys: [] };
    });
  }

  function isCapabilityAllowed(portalKey, capabilityKey) {
    const node = accessDraft[portalKey];
    if (!node || node.mode === 'none') return false;
    if (node.mode === 'full') return !node.excludedCapabilities.includes(capabilityKey);
    return node.selectedCapabilities.includes(capabilityKey);
  }

  function toggleCapabilities(portal, keys) {
    updatePortal(portal.key, (node) => {
      const allOn = keys.every((key) => {
        if (node.mode === 'full') return !node.excludedCapabilities.includes(key);
        if (node.mode === 'partial') return node.selectedCapabilities.includes(key);
        return false;
      });
      if (node.mode === 'full') {
        const excluded = new Set(node.excludedCapabilities);
        keys.forEach((key) => allOn ? excluded.add(key) : excluded.delete(key));
        return { ...node, excludedCapabilities: [...excluded] };
      }
      const selected = new Set(node.selectedCapabilities);
      keys.forEach((key) => allOn ? selected.delete(key) : selected.add(key));
      return {
        ...node,
        mode: selected.size ? 'partial' : 'none',
        selectedCapabilities: [...selected],
        excludedCapabilities: [],
      };
    });
  }

  function setPortalScope(portalKey, scopeType) {
    updatePortal(portalKey, (node) => ({ ...node, scopeType, scopeKeys: scopeType === 'all' ? [] : node.scopeKeys }));
  }

  function toggleProjectScope(projectId) {
    updatePortal('projects', (node) => ({
      ...node,
      scopeKeys: node.scopeKeys.includes(projectId)
        ? node.scopeKeys.filter((id) => id !== projectId)
        : [...node.scopeKeys, projectId],
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
      setMsg('تم إنشاء المستخدم بدون صلاحيات تشغيلية. حدّد صلاحياته من الشجرة أدناه ثم احفظ.');
      setNewAccount({ accountType: 'employee', employeeId: '', displayName: '', email: '' });
      await load(false);
      setSelectedUserId(data.account.userId);
    } catch (error) {
      setErr(error.message || 'تعذر إنشاء المستخدم.');
    }
    setBusy('');
  }

  async function saveAccessTree() {
    if (!selectedUser || isPrimary) return;
    const payload = tree.map((portal) => {
      const node = accessDraft[portal.key] || emptyAccessDraft(tree)[portal.key];
      const mode = node.mode === 'partial' && !node.selectedCapabilities.length ? 'none' : node.mode;
      return {
        portalKey: portal.key,
        mode,
        scopeType: mode === 'none' ? 'all' : node.scopeType,
        scopeKeys: mode === 'none' || node.scopeType === 'all' ? [] : unique(node.scopeKeys),
        selectedCapabilities: mode === 'partial' ? unique(node.selectedCapabilities) : [],
        excludedCapabilities: mode === 'full' ? unique(node.excludedCapabilities) : [],
      };
    });

    const missingProjects = payload.some((node) => node.portalKey === 'projects' && node.mode !== 'none' && node.scopeType === 'project' && !node.scopeKeys.length);
    if (missingProjects) {
      setErr('اختر مشروعًا واحدًا على الأقل أو غيّر نطاق بوابة المشاريع إلى كامل النطاق.');
      return;
    }

    setBusy('access');
    setErr('');
    setMsg('');
    try {
      await callAdmin({ action: 'set_access_tree', userId: selectedUser.id, accessTree: payload });
      setMsg('تم حفظ شجرة الصلاحيات كاملة وتطبيقها على المستخدم.');
      await load();
    } catch (error) {
      setErr(error.message || 'تعذر حفظ شجرة الصلاحيات.');
    }
    setBusy('');
  }

  async function resetPassword() {
    if (!selectedUser || isPrimary) return;
    setBusy('reset');
    setErr('');
    setMsg('');
    setCredentials(null);
    try {
      const data = await callAdmin({ action: 'reset_password', userId: selectedUser.id });
      setCredentials({
        email: selectedUser.auth_email || selectedEmployee?.email || '',
        password: data.temporaryPassword,
        name: userDisplayName(selectedUser, employeeById),
      });
      setMsg('تم إصدار كلمة مرور مؤقتة جديدة، وسيُطلب تغييرها عند أول دخول.');
      await load();
    } catch (error) {
      setErr(error.message || 'تعذر إعادة تعيين كلمة المرور.');
    }
    setBusy('');
  }

  async function setActive(isActive) {
    if (!selectedUser || isPrimary) return;
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
    if (!selectedUser || isPrimary) return;
    setBusy('delete-preview');
    setErr('');
    setMsg('');
    setDeletePlan(null);
    try {
      const data = await callAdmin({ action: 'delete_preview', userId: selectedUser.id });
      setDeletePlan({ ...data, userId: selectedUser.id, name: userDisplayName(selectedUser, employeeById) });
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

  const employeeCreationReady = newAccount.accountType === 'employee' && newAccount.employeeId;
  const externalCreationReady = newAccount.accountType === 'external' && newAccount.displayName.trim() && newAccount.email.trim();

  return <>
    <div className="page-head">
      <div>
        <h1>إدارة الدخول</h1>
        <p>مستخدم واحد، وشجرة صلاحيات واحدة: البوابة ثم القسم ثم الوظيفة ثم الإجراء ثم النطاق.</p>
      </div>
    </div>

    {err && <div className="msg err" style={{ marginBottom: 14 }}>{err}</div>}
    {msg && <div className="msg ok" style={{ marginBottom: 14 }}>{msg}</div>}

    {credentials && <div className="section" style={{ marginTop: 0, marginBottom: 16, border: '1px solid #8aa99a' }}>
      <header><h2>بيانات دخول مؤقتة — تظهر الآن فقط</h2></header>
      <div style={{ padding: 18 }}>
        <p style={{ marginTop: 0, lineHeight: 1.8 }}>أرسلها للمستخدم بطريقة آمنة. لا يمكن عرض كلمة المرور الحالية بعد ذلك.</p>
        <div className="form-grid">
          <div className="field span2"><label>المستخدم</label><input readOnly value={credentials.name || '—'} /></div>
          <div className="field span2"><label>البريد الإلكتروني</label><div className="rowsplit"><input readOnly dir="ltr" value={credentials.email || ''} /><button type="button" className="btn ghost" onClick={() => copy(credentials.email, 'البريد')}>نسخ</button></div></div>
          <div className="field span2"><label>كلمة المرور المؤقتة</label><div className="rowsplit"><input readOnly dir="ltr" value={credentials.password || ''} /><button type="button" className="btn ghost" onClick={() => copy(credentials.password, 'كلمة المرور')}>نسخ</button></div></div>
        </div>
      </div>
    </div>}

    <div className="section" style={{ marginTop: 0, marginBottom: 16 }}>
      <header><h2>إنشاء مستخدم جديد</h2></header>
      <form onSubmit={provision} style={{ padding: 18 }}>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>نوع المستخدم</label>
          <div className="rowsplit" style={{ justifyContent: 'flex-start', gap: 8 }}>
            <button type="button" className={`btn ${newAccount.accountType === 'employee' ? '' : 'ghost'}`} onClick={() => setNewAccount({ accountType: 'employee', employeeId: '', displayName: '', email: '' })}>موظف من السجل</button>
            <button type="button" className={`btn ${newAccount.accountType === 'external' ? '' : 'ghost'}`} onClick={() => setNewAccount({ accountType: 'external', employeeId: '', displayName: '', email: '' })}>مستخدم خارجي</button>
          </div>
        </div>

        {newAccount.accountType === 'employee' ? <div className="field">
          <label>الموظف *</label>
          <select required value={newAccount.employeeId} onChange={(event) => setNewAccount({ ...newAccount, employeeId: event.target.value })}>
            <option value="">اختر الموظف</option>
            {availableEmployees.map((employee) => <option key={employee.id} value={employee.id}>
              {employee.full_name_ar}{employee.job_title ? ` — ${employee.job_title}` : ''}{employee.email ? '' : ' — لا يوجد بريد'}
            </option>)}
          </select>
          <span className="hint">يستخدم البريد المسجل في ملف الموظف.</span>
        </div> : <div className="form-grid">
          <div className="field span2">
            <label>الاسم *</label>
            <input required value={newAccount.displayName} onChange={(event) => setNewAccount({ ...newAccount, displayName: event.target.value })} placeholder="اسم الشخص أو الجهة" />
          </div>
          <div className="field span2">
            <label>البريد الإلكتروني *</label>
            <input required type="email" dir="ltr" value={newAccount.email} onChange={(event) => setNewAccount({ ...newAccount, email: event.target.value })} placeholder="name@example.com" />
          </div>
        </div>}

        <div className="rowsplit" style={{ marginTop: 16 }}>
          <button className="btn" disabled={busy === 'provision' || !(employeeCreationReady || externalCreationReady)}>
            {busy === 'provision' ? 'جارٍ إنشاء المستخدم…' : 'إنشاء المستخدم وإصدار كلمة مرور مؤقتة'}
          </button>
          <span className="hint">ينشأ الحساب بلا صلاحيات تشغيلية؛ الصلاحيات تُمنح من الشجرة بعد الإنشاء.</span>
        </div>
      </form>
    </div>

    <div className="section" style={{ marginBottom: 16 }}>
      <header><h2>المستخدم والصلاحيات</h2></header>
      <div style={{ padding: 18 }}>
        <div className="field">
          <label>المستخدم</label>
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
            <option value="">اختر مستخدمًا</option>
            {managedUsers.map((user) => <option key={user.id} value={user.id}>
              {userDisplayName(user, employeeById)} — {userTypeLabel(user)}{user.id === directory.primaryUserId ? ' — المستخدم الرئيسي' : ''}{user.is_active ? '' : ' — معطل'}
            </option>)}
          </select>
        </div>

        {selectedUser && <div style={{ marginTop: 14, padding: 14, border: '1px solid var(--hair)', borderRadius: 12 }}>
          <div className="rowsplit" style={{ alignItems: 'flex-start' }}>
            <div>
              <strong style={{ display: 'block', fontSize: 17 }}>{userDisplayName(selectedUser, employeeById)}</strong>
              <span className="hint">{userTypeLabel(selectedUser)} · {selectedUser.auth_email || selectedEmployee?.email || 'لا يوجد بريد'} · {selectedUser.is_active ? 'الحساب فعال' : 'الحساب معطل'}</span>
            </div>
            <div className="rowsplit" style={{ justifyContent: 'flex-end', gap: 8 }}>
              {!isPrimary && <button type="button" className="btn ghost" disabled={busy === 'reset'} onClick={resetPassword}>كلمة مرور مؤقتة</button>}
              {!isPrimary && <button type="button" className="btn ghost" disabled={busy === 'status'} onClick={() => setActive(!selectedUser.is_active)}>{selectedUser.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}</button>}
              {!isPrimary && <button type="button" className="btn ghost" disabled={busy === 'delete-preview'} onClick={prepareDelete}>إزالة المستخدم</button>}
            </div>
          </div>
          {isPrimary && <div className="msg ok" style={{ marginTop: 12 }}>المستخدم الرئيسي محمي، وتُعرض شجرته للمرجعية دون السماح بتقليص صلاحياته من هذه الشاشة.</div>}
        </div>}
      </div>
    </div>

    {selectedUser && <div className="section">
      <header>
        <div>
          <h2>شجرة الصلاحيات العامة</h2>
          <p className="hint" style={{ margin: '6px 0 0' }}>«كامل البوابة» يرث الوظائف الجديدة مستقبلًا. «مخصص» يمنح فقط ما تحدده الآن.</p>
        </div>
      </header>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          {tree.map((portal) => <PortalAccessEditor
            key={portal.key}
            portal={portal}
            node={accessDraft[portal.key] || emptyAccessDraft(tree)[portal.key]}
            disabled={isPrimary || busy === 'access'}
            projects={directory.projects || []}
            isAllowed={(key) => isCapabilityAllowed(portal.key, key)}
            onMode={(mode) => setPortalMode(portal, mode)}
            onToggleKeys={(keys) => toggleCapabilities(portal, keys)}
            onScope={(scope) => setPortalScope(portal.key, scope)}
            onProject={toggleProjectScope}
          />)}
        </div>

        {!isPrimary && <div className="rowsplit" style={{ marginTop: 18 }}>
          <button type="button" className="btn" disabled={busy === 'access'} onClick={saveAccessTree}>
            {busy === 'access' ? 'جارٍ حفظ الشجرة…' : 'حفظ شجرة الصلاحيات'}
          </button>
          <span className="hint">الحفظ يستبدل صلاحيات المستخدم التشغيلية الحالية دفعة واحدة وبشكل ذري.</span>
        </div>}
      </div>
    </div>}

    {deletePlan && <div className="section" style={{ marginTop: 16, border: '1px solid #b55' }}>
      <header><h2>تأكيد إزالة المستخدم</h2></header>
      <div style={{ padding: 18 }}>
        <p style={{ lineHeight: 1.8 }}>
          {deletePlan.mode === 'delete'
            ? `لا توجد بيانات تشغيلية مرتبطة بـ ${deletePlan.name}. يمكن حذف الحساب نهائيًا.`
            : `لدى ${deletePlan.name} عدد ${deletePlan.impactCount || 0} ارتباطًا محفوظًا. سيُمنع دخوله وتُزال صلاحياته مع إبقاء السجل التاريخي والبيانات.`}
        </p>
        <div className="rowsplit" style={{ justifyContent: 'flex-start', gap: 8 }}>
          <button type="button" className="btn" disabled={busy === 'delete'} onClick={confirmDelete}>{busy === 'delete' ? 'جارٍ التنفيذ…' : 'تأكيد الإزالة'}</button>
          <button type="button" className="btn ghost" onClick={() => setDeletePlan(null)}>إلغاء</button>
        </div>
      </div>
    </div>}
  </>;
}

function PortalAccessEditor({ portal, node, disabled, projects, isAllowed, onMode, onToggleKeys, onScope, onProject }) {
  const allowedCount = portal.capabilityKeys.filter(isAllowed).length;
  const scopeOptions = scopeOptionsForPortal(portal.key);

  return <div style={{ border: '1px solid var(--hair)', borderRadius: 14, overflow: 'hidden' }}>
    <div style={{ padding: 14, background: 'var(--panel, transparent)' }}>
      <div className="rowsplit" style={{ alignItems: 'flex-start' }}>
        <div>
          <strong style={{ fontSize: 17 }}>{portal.label}</strong>
          <div className="hint" style={{ marginTop: 4 }}>{portal.description}</div>
        </div>
        <strong>{allowedCount}/{portal.capabilityKeys.length}</strong>
      </div>

      <div className="rowsplit" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" disabled={disabled} className={`btn ${node.mode === 'none' ? '' : 'ghost'}`} onClick={() => onMode('none')}>لا وصول</button>
        <button type="button" disabled={disabled} className={`btn ${node.mode === 'partial' ? '' : 'ghost'}`} onClick={() => onMode('partial')}>مخصص</button>
        <button type="button" disabled={disabled} className={`btn ${node.mode === 'full' ? '' : 'ghost'}`} onClick={() => onMode('full')}>كامل البوابة</button>
      </div>

      {node.mode === 'full' && <div className="hint" style={{ marginTop: 10 }}>
        صلاحية وراثية: أي وظيفة جديدة تُضاف لهذه البوابة لاحقًا ستدخل تلقائيًا، عدا الاستثناءات التي تلغيها أدناه.
      </div>}
      {node.mode === 'partial' && <div className="hint" style={{ marginTop: 10 }}>
        صلاحيات محددة: الوظائف الجديدة مستقبلًا لا تُمنح تلقائيًا.
      </div>}

      {node.mode !== 'none' && scopeOptions.length > 1 && <div style={{ marginTop: 12 }}>
        <label style={{ fontWeight: 700, display: 'block', marginBottom: 6 }}>النطاق</label>
        <div className="rowsplit" style={{ justifyContent: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          {scopeOptions.map((option) => <label key={option.key} style={{ display: 'flex', gap: 7, alignItems: 'center', cursor: disabled ? 'default' : 'pointer' }}>
            <input type="radio" disabled={disabled} checked={node.scopeType === option.key} onChange={() => onScope(option.key)} />
            <span>{option.label}</span>
          </label>)}
        </div>
      </div>}

      {portal.key === 'projects' && node.mode !== 'none' && node.scopeType === 'project' && <ProjectPicker
        projects={projects}
        selected={node.scopeKeys}
        disabled={disabled}
        onToggle={onProject}
      />}
    </div>

    {node.mode !== 'none' && <div style={{ padding: 14, display: 'grid', gap: 10 }}>
      {portal.groups.length ? portal.groups.map((group) => {
        const groupKeys = group.features.flatMap((feature) => feature.capabilities.map((cap) => cap.key));
        const groupAllowed = groupKeys.filter(isAllowed).length;
        return <details key={group.key} open>
          <summary style={{ cursor: 'pointer', fontWeight: 800, padding: '8px 0' }}>
            {group.label} — {groupAllowed}/{groupKeys.length}
          </summary>
          <div style={{ display: 'grid', gap: 8, padding: '4px 0 8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: disabled ? 'default' : 'pointer' }}>
              <input type="checkbox" disabled={disabled} checked={groupKeys.length > 0 && groupAllowed === groupKeys.length} onChange={() => onToggleKeys(groupKeys)} />
              <span>كل {group.label}</span>
            </label>
            {group.features.map((feature) => <FeatureEditor key={feature.key} feature={feature} disabled={disabled} isAllowed={isAllowed} onToggleKeys={onToggleKeys} />)}
          </div>
        </details>;
      }) : <div className="empty">لا توجد صلاحيات تشغيلية مسجلة لهذه البوابة حتى الآن.</div>}
    </div>}
  </div>;
}

function FeatureEditor({ feature, disabled, isAllowed, onToggleKeys }) {
  const keys = feature.capabilities.map((cap) => cap.key);
  const allowed = keys.filter(isAllowed).length;
  return <div style={{ border: '1px solid var(--hair)', borderRadius: 10, padding: 10 }}>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" disabled={disabled} checked={keys.length > 0 && allowed === keys.length} onChange={() => onToggleKeys(keys)} />
      <span>{feature.label}</span>
      <span className="hint">({allowed}/{keys.length})</span>
    </label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 8, marginTop: 9 }}>
      {feature.capabilities.map((capability) => <label key={capability.key} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', padding: '8px 9px', border: '1px solid var(--hair)', borderRadius: 8, cursor: disabled ? 'default' : 'pointer' }} title={capability.description || capability.key}>
        <input type="checkbox" disabled={disabled} checked={isAllowed(capability.key)} onChange={() => onToggleKeys([capability.key])} />
        <span>
          <span style={{ display: 'block', fontWeight: 600 }}>{capability.actionLabel}</span>
          {riskText(capability.riskLevel) && <small style={{ display: 'block', marginTop: 2, fontWeight: 700 }}>{riskText(capability.riskLevel)}</small>}
        </span>
      </label>)}
    </div>
  </div>;
}

function ProjectPicker({ projects, selected, disabled = false, onToggle }) {
  return <div style={{ marginTop: 12 }}>
    <label style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>المشاريع المسموح بها *</label>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 8 }}>
      {projects.map((project) => <label key={project.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--hair)', borderRadius: 10, cursor: disabled ? 'default' : 'pointer' }}>
        <input type="checkbox" disabled={disabled} checked={selected.includes(project.id)} onChange={() => onToggle(project.id)} />
        <span>{projectLabel(project)}</span>
      </label>)}
    </div>
  </div>;
}
