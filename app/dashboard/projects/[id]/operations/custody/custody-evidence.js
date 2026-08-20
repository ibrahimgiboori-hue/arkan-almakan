'use client';

import { supabase } from '@/lib/supabase';

const BUCKET = 'site-docs';

function safeName(name='evidence'){
  const parts=String(name).split('.');
  const ext=parts.length>1?`.${parts.pop().toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10)}`:'';
  const base=parts.join('.').replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,60)||'evidence';
  return `${base}${ext}`;
}

export async function uploadCustodyEvidence({ projectId, custodyId, file }){
  if(!file)return null;
  const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path=`projects/${projectId}/custody/${custodyId}/${id}-${safeName(file.name)}`;
  const {error}=await supabase.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type||undefined,cacheControl:'3600'});
  if(error)throw error;
  return path;
}

export async function removeCustodyEvidence(path){
  if(!path)return;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function openCustodyEvidence(path){
  if(!path)return;
  const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,300);
  if(error)throw error;
  if(!data?.signedUrl)throw new Error('تعذر إنشاء رابط الإثبات');
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
}
