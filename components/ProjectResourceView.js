'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ProjDocs from '@/components/ProjDocs';

export default function ProjectResourceView({ mode }) {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [canWrite, setCanWrite] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const [p, u] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).maybeSingle(),
        supabase.from('app_users').select('role,is_system_admin').eq('id', session?.user?.id).maybeSingle(),
      ]);
      if (!active) return;
      if (!p.data) { setErr('لم يُعثر على المشروع.'); return; }
      setProject(p.data);
      setCanWrite(Boolean(u.data?.is_system_admin || ['ceo','hr','accountant'].includes(u.data?.role)));
    })();
    return () => { active = false; };
  }, [id]);

  if (err) return <div className="msg err">{err}</div>;
  if (!project) return <div className="empty">جارٍ التحميل…</div>;
  return <ProjDocs project={project} canWrite={canWrite} mode={mode} />;
}
