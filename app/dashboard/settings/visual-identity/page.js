'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  ConstitutionPage,
  PageHeader,
  Section,
  Notice,
  EmptyState,
} from '@/components/ui/ConstitutionUI';

export default function VisualIdentitySettingsPage() {
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadSettings() {
    const { data, error:loadError } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (loadError) setError(loadError.message || 'تعذّر تحميل الهوية البصرية.');
    setSettings(data || {});
  }

  useEffect(() => { loadSettings(); }, []);

  function publicUrl(path) {
    return path ? supabase.storage.from('brand').getPublicUrl(path).data.publicUrl : '';
  }

  async function uploadCompanyLogo(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const ext = String(file.name || 'png').split('.').pop().toLowerCase() || 'png';
      const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext) ? ext : 'png';
      const path = `company_logo_path.${safeExt}`;
      const upload = await supabase.storage.from('brand').upload(path, file, {
        upsert:true,
        cacheControl:'0',
      });
      if (upload.error) throw new Error('تعذّر رفع شعار المنشأة: ' + upload.error.message);

      const save = await supabase
        .from('app_settings')
        .update({ company_logo_path:path })
        .eq('id', 1);
      if (save.error) throw new Error('تم رفع الصورة لكن تعذّر حفظ مسارها: ' + save.error.message);

      setMessage('تم حفظ شعار المنشأة كمصدر الحقيقة للهوية البصرية.');
      await loadSettings();
    } catch (uploadError) {
      setError(uploadError?.message || 'تعذّر رفع شعار المنشأة.');
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <ConstitutionPage><EmptyState title="جارٍ تحميل الهوية البصرية…" /></ConstitutionPage>;
  }

  return <ConstitutionPage>
    <PageHeader
      eyebrow="الإعدادات"
      title="الهوية البصرية للمنشأة"
      description="هنا يرفع شعار المنشأة مرة واحدة كمصدر حقيقة. أما موضع الشعار وحجمه داخل كل مستند فيأتيان من ملف Excel وعائلة المستندات."
    />

    {error ? <Notice tone="error">{error}</Notice> : null}
    {message ? <Notice tone="success">{message}</Notice> : null}

    <Section
      title="شعار المنشأة"
      description="الصورة هنا هي المصدر المركزي للشعار. ملفات Excel مثل عائلة السندات تحدد أين يظهر الشعار وكم حجمه عبر _PLACED_ASSETS."
      boundary
    >
      <div style={{ padding:16, display:'grid', gap:14, maxWidth:620 }}>
        <div data-ui-role="asset-card" style={{ maxWidth:360 }}>
          <strong style={{ fontSize:14 }}>الشعار الحالي</strong>
          <div data-ui-role="asset-preview" style={{ minHeight:180 }}>
            {settings.company_logo_path
              ? <img src={publicUrl(settings.company_logo_path)} alt="شعار المنشأة" style={{ objectFit:'contain' }} />
              : <span style={{ fontSize:12, color:'var(--ui-text-muted)' }}>لم يتم رفع شعار المنشأة بعد</span>}
          </div>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => uploadCompanyLogo(event.target.files?.[0])}
            disabled={busy}
            style={{ fontSize:12, maxWidth:'100%' }}
          />
          {busy ? <div style={{ fontSize:12, color:'var(--ui-accent)' }}>جارٍ رفع الشعار…</div> : null}
        </div>

        <div className="hint">
          القاعدة المعتمدة: صورة الشعار من هذه الصفحة، والموضع والحجم من Excel. في عائلة السندات الحالية موضع الشعار محدد داخل _PLACED_ASSETS ولا يتم اختراعه من شاشة الطباعة.
        </div>

        <div>
          <Link className="btn" href="/dashboard/settings">العودة إلى بيانات الشركة</Link>
        </div>
      </div>
    </Section>
  </ConstitutionPage>;
}
