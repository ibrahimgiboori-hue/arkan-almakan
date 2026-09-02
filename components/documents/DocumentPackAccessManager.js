'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const PORTAL_LABELS = Object.freeze({
  projects: 'المشاريع',
  finance: 'المالية',
  hr: 'الموارد البشرية',
  shared: 'مشترك',
  system: 'الإدارة والنظام',
});
const PORTAL_ORDER = ['projects', 'finance', 'hr', 'shared', 'system'];

export default function DocumentPackAccessManager({ userId, primaryUserId }) {
  const [packs, setPacks] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const isPrimary = Boolean(userId && primaryUserId && userId === primaryUserId);

  async function load() {
    if (!userId || isPrimary) {
      setPacks([]);
      return;
    }
    setError('');
    const { data, error: loadError } = await supabase.rpc('document_access_overview_for_user', { p_user_id: userId });
    if (loadError) {
      setError(loadError.message || 'تعذر تحميل حزم المستندات.');
      return;
    }
    setPacks(data || []);
  }

  useEffect(() => { load(); }, [userId, isPrimary]);

  const groups = useMemo(() => PORTAL_ORDER
    .map((key) => ({ key, rows: packs.filter((pack) => pack.portal_key === key) }))
    .filter((group) => group.rows.length > 0), [packs]);

  async function setExtra(pack, enabled) {
    if (!userId || busy) return;
    setBusy(pack.pack_key);
    setError('');
    setMessage('');
    const { error: saveError } = await supabase.rpc('set_user_document_pack_access', {
      p_user_id: userId,
      p_pack_key: pack.pack_key,
      p_enabled: enabled,
    });
    if (saveError) {
      const raw = saveError.message || '';
      setError(raw.includes('primary_user_protected')
        ? 'المستخدم الرئيسي يملك جميع المستندات تلقائيًا ولا يحتاج باقة إضافية.'
        : raw.includes('forbidden')
          ? 'لا تملك صلاحية إدارة حزم المستندات.'
          : 'تعذر تحديث باقة المستندات: ' + raw);
      setBusy('');
      return;
    }
    setMessage(enabled ? `أضيفت باقة «${pack.pack_name_ar}» للمستخدم.` : `أزيلت الإضافة المباشرة لباقة «${pack.pack_name_ar}».`);
    await load();
    setBusy('');
  }

  if (!userId) return null;
  if (isPrimary) return (
    <div className="section" style={{ margin: '0 0 14px' }}>
      <header><h2>حزم المستندات</h2></header>
      <div style={{ padding: 16 }} className="msg">المستخدم الرئيسي يرى جميع النماذج والمستندات تلقائيًا.</div>
    </div>
  );

  return (
    <div className="section" style={{ margin: '0 0 14px' }}>
      <header>
        <div>
          <h2>حزم المستندات</h2>
          <span>تأتي الحزم الأساسية تلقائيًا من صلاحيات البوابات، ويمكن إضافة حزمة أخرى للمستخدم دون تغيير صلاحياته الأساسية.</span>
        </div>
      </header>
      <div style={{ padding: 16 }}>
        {error && <div className="msg err" style={{ marginBottom: 10 }}>{error}</div>}
        {message && <div className="msg ok" style={{ marginBottom: 10 }}>{message}</div>}
        {!packs.length && !error ? <div className="empty">لا توجد حزم مستندات متاحة.</div> : groups.map((group) => (
          <div key={group.key} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 750, marginBottom: 7 }}>{PORTAL_LABELS[group.key] || group.key}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(270px,1fr))', gap: 8 }}>
              {group.rows.map((pack) => {
                const inheritedNames = Array.isArray(pack.inherited_bundle_names) ? pack.inherited_bundle_names : [];
                const available = pack.inherited || pack.direct_all || Number(pack.direct_scoped_count || 0) > 0;
                return <div key={pack.pack_key} style={{ border: '1px solid var(--hair)', borderRadius: 8, padding: 12, background: available ? 'var(--paper, #fff)' : 'transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <strong>{pack.pack_name_ar}</strong>
                      <div className="muted" style={{ marginTop: 3 }}>{pack.template_count} نموذجًا</div>
                    </div>
                    {pack.inherited
                      ? <span className="pill ok">موروثة</span>
                      : pack.direct_all
                        ? <span className="pill">إضافية</span>
                        : <span className="pill">غير مضافة</span>}
                  </div>
                  {pack.description_ar && <div className="muted" style={{ marginTop: 7, lineHeight: 1.6 }}>{pack.description_ar}</div>}
                  {pack.inherited && <div style={{ marginTop: 7, fontSize: 12 }}>
                    من: {inheritedNames.join('، ') || 'صلاحية البوابة'}
                    {pack.inherited_scope === 'project' ? ' · ضمن المشاريع المسندة' : ''}
                  </div>}
                  {Number(pack.direct_scoped_count || 0) > 0 && <div style={{ marginTop: 5, fontSize: 12 }}>يوجد أيضًا وصول مباشر مرتبط بمشروع ({pack.direct_scoped_count}).</div>}
                  <div className="rowsplit" style={{ marginTop: 10 }}>
                    {pack.direct_all
                      ? <button className="btn ghost" type="button" disabled={busy === pack.pack_key} onClick={() => setExtra(pack, false)}>
                          {busy === pack.pack_key ? 'جارٍ الحفظ…' : pack.inherited ? 'إزالة الإضافة الزائدة' : 'إزالة الباقة الإضافية'}
                        </button>
                      : !pack.inherited && <button className="btn ghost" type="button" disabled={busy === pack.pack_key} onClick={() => setExtra(pack, true)}>
                          {busy === pack.pack_key ? 'جارٍ الحفظ…' : 'إضافة للمستخدم'}
                        </button>}
                    {pack.inherited && !pack.direct_all && <span className="muted" style={{ fontSize: 12 }}>تُدار من صلاحية البوابة</span>}
                  </div>
                </div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
