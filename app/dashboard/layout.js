'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import './raw-phase.css';

/**
 * RAW PROGRAMMING SHELL
 *
 * No application chrome is rendered here on purpose.
 * This layout only protects the authenticated dashboard surface and then
 * renders the functional route itself. Presentation/navigation will be
 * rebuilt later after the program core is complete.
 */
export default function DashboardLayout({ children }) {
  const router = useRouter();
  const [state, setState] = useState({ ready:false, allowed:false, message:'' });

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data:{ session } } = await supabase.auth.getSession();
      if (!alive) return;

      if (!session) {
        router.replace('/login');
        return;
      }

      const { data:userRow, error } = await supabase
        .from('app_users')
        .select('role,is_active,must_change_password')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setState({ ready:true, allowed:false, message:'تعذر التحقق من الحساب.' });
        return;
      }

      if (userRow?.must_change_password) {
        router.replace('/change-password');
        return;
      }

      if (!userRow?.is_active || !userRow?.role) {
        setState({ ready:true, allowed:false, message:'حسابك غير مهيأ لاستخدام النظام حاليًا.' });
        return;
      }

      setState({ ready:true, allowed:true, message:'' });
    })();

    return () => { alive = false; };
  }, [router]);

  if (!state.ready) {
    return <div style={{padding:24,fontFamily:'inherit'}}>جارٍ التحميل…</div>;
  }

  if (!state.allowed) {
    return <div style={{padding:24,fontFamily:'inherit'}}>{state.message}</div>;
  }

  return <>{children}</>;
}
