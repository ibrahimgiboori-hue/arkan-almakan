'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import DocumentFormRouter from '@/components/documents/DocumentFormRouter';

export default function NewDocument() {
  const { code } = useParams();
  const [access, setAccess] = useState('loading');

  useEffect(() => {
    let active = true;
    async function checkAccess() {
      const { data, error } = await supabase.rpc('document_templates_for_me', { p_action: 'create' });
      if (!active) return;
      if (error) {
        setAccess('error');
        return;
      }
      setAccess((data || []).some((template) => template.code === code) ? 'allowed' : 'denied');
    }
    checkAccess();
    return () => { active = false; };
  }, [code]);

  if (access === 'loading') return <div className="empty">جارٍ التحقق من صلاحية النموذج…</div>;
  if (access === 'error') return <div className="msg err">تعذر التحقق من صلاحية إنشاء هذا المستند.</div>;
  if (access === 'denied') return <div className="section"><div className="empty"><h3>هذا النموذج غير متاح ضمن باقتك</h3><p>تظهر لك النماذج المرتبطة ببوابات وصلاحيات عملك فقط.</p><Link className="btn" href="/dashboard/documents">العودة إلى مستنداتي</Link></div></div>;

  return <DocumentFormRouter code={code} />;
}
