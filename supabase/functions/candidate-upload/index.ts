import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const allowedTypes = new Set(['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
const allowedDocTypes = new Set(['السيرة الذاتية','الهوية / الإقامة','المؤهلات والشهادات','ترخيص مهني','شهادة إضافية']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'method_not_allowed'}), {status:405,headers:{...cors,'Content-Type':'application/json'}});
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession:false } });
    const form = await req.formData();
    const token=String(form.get('vacancy_token')||''), applicationId=String(form.get('application_id')||''), docType=String(form.get('document_type')||''), file=form.get('file');
    if(!token||!applicationId||!(file instanceof File)) return new Response(JSON.stringify({error:'missing_fields'}),{status:400,headers:{...cors,'Content-Type':'application/json'}});
    if(!allowedDocTypes.has(docType)||file.size<=0||file.size>10*1024*1024||!allowedTypes.has(file.type)) return new Response(JSON.stringify({error:'invalid_file'}),{status:400,headers:{...cors,'Content-Type':'application/json'}});
    const {data:app}=await admin.from('candidate_applications').select('id,candidate_id,vacancy_id,status').eq('id',applicationId).maybeSingle();
    if(!app||!['submitted','screening','interview'].includes(app.status)) return new Response(JSON.stringify({error:'application_not_available'}),{status:409,headers:{...cors,'Content-Type':'application/json'}});
    const {data:vacancy}=await admin.from('job_vacancies').select('public_token').eq('id',app.vacancy_id).maybeSingle();
    if(!vacancy||vacancy.public_token!==token) return new Response(JSON.stringify({error:'invalid_token'}),{status:403,headers:{...cors,'Content-Type':'application/json'}});
    const ext=(file.name.split('.').pop()||'bin').replace(/[^a-zA-Z0-9]/g,'').slice(0,10)||'bin';
    const safeType=docType.replace(/[^\p{L}\p{N}]+/gu,'_').slice(0,40);
    const path=`${app.candidate_id}/${app.id}/${safeType}/${crypto.randomUUID()}.${ext}`;
    const {error:upErr}=await admin.storage.from('recruitment-docs').upload(path,new Uint8Array(await file.arrayBuffer()),{contentType:file.type,upsert:false});
    if(upErr) throw upErr;
    const {data:row,error:insErr}=await admin.from('candidate_documents').insert({candidate_id:app.candidate_id,application_id:app.id,document_type:docType,file_path:path,verification_status:'pending'}).select('id').single();
    if(insErr){await admin.storage.from('recruitment-docs').remove([path]);throw insErr;}
    return new Response(JSON.stringify({ok:true,id:row.id}),{headers:{...cors,'Content-Type':'application/json'}});
  } catch(e) {
    console.error(e);
    return new Response(JSON.stringify({error:'upload_failed'}),{status:500,headers:{...cors,'Content-Type':'application/json'}});
  }
});
