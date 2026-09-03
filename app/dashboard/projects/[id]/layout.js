'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { publishNavigationMirrorContext } from '@/lib/living-navigation';

export default function ProjectWorkspaceLayout({ children }) {
  const { id } = useParams();

  useEffect(() => {
    let alive = true;
    if (!id) return undefined;

    (async () => {
      const { data } = await supabase
        .from('projects')
        .select('id,name_ar')
        .eq('id', id)
        .maybeSingle();
      if (!alive || !data) return;
      publishNavigationMirrorContext({
        portalKey:'projects',
        subjectKind:'project',
        subjectId:String(data.id),
        subjectLabel:data.name_ar || 'المشروع المحدد',
      });
    })();

    return () => { alive = false; };
  }, [id]);

  // الغلاف لا يرسم ملاحة ثانية ولا يملك صلاحيات؛ يعلن فقط هوية السياق
  // كي تعكسها القائمة، بينما يبقى العضو نفسه محفوظًا كما هو.
  return children;
}
