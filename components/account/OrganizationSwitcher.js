'use client';

import { setActiveOrganizationId } from '@/lib/tenant-context';
import styles from './OrganizationSwitcher.module.css';

export default function OrganizationSwitcher({ tenant }) {
  if (!tenant || tenant.mode !== 'multi_tenant' || !tenant.activeOrganization) return null;

  const memberships = tenant.memberships || [];
  const activeId = String(tenant.activeOrganization.id);
  const activeName =
    tenant.activeOrganization.nameAr ||
    tenant.activeOrganization.nameEn ||
    tenant.activeOrganization.slug ||
    'المنشأة';

  function changeOrganization(event) {
    const nextId = String(event.target.value || '');
    if (!nextId || nextId === activeId) return;

    const allowed = memberships.some(
      (membership) => String(membership.organizationId) === nextId
    );
    if (!allowed) return;

    setActiveOrganizationId(nextId,{ announce:false });
    window.location.assign('/dashboard');
  }

  return (
    <div
      className={styles.bar}
      data-organization-context="active"
      data-organization-id={activeId}
      aria-label="المنشأة الحالية"
    >
      <span className={styles.label}>المنشأة</span>
      {memberships.length > 1 ? (
        <select
          className={styles.select}
          value={activeId}
          onChange={changeOrganization}
          aria-label="تغيير المنشأة"
        >
          {memberships.map((membership) => (
            <option key={membership.organizationId} value={membership.organizationId}>
              {membership.organization?.nameAr || membership.organization?.nameEn || membership.organization?.slug || membership.organizationId}
            </option>
          ))}
        </select>
      ) : (
        <strong className={styles.name}>{activeName}</strong>
      )}
      <span className={styles.role} data-role={tenant.activeRole || 'member'}>
        {tenant.activeRole === 'owner' ? 'مالك' :
         tenant.activeRole === 'admin' ? 'مدير' :
         tenant.activeRole === 'manager' ? 'مشرف' :
         tenant.activeRole === 'auditor' ? 'مراجع' : 'مستخدم'}
      </span>
    </div>
  );
}
