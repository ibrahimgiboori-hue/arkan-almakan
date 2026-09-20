'use client';
import { createClient } from '@supabase/supabase-js';
import { tenantAwareFetch } from './tenant-context';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    global:{
      fetch:tenantAwareFetch,
    },
  }
);
