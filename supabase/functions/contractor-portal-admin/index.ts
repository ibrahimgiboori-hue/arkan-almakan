import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers:{...cors,'Content-Type':'application/json'},
});

function normalizeUsername(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);
}

function password() {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#';
  const bytes=crypto.getRandomValues(new Uint8Array(14));
  return [...bytes].map((value)=>alphabet[value%alphabet.length]).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if (req.method!=='POST') return json({error:'method_not_allowed'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL')!;
    const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
    const {data:{user},error:userError}=await admin.auth.getUser(token);
    if(userError||!user) return json({error:'unauthorized'},401);
    const {data:operator}=await admin.from('app_users').select('role,is_active').eq('id',user.id).maybeSingle();
    if(!operator?.is_active||operator.role!=='ceo') return json({error:'forbidden'},403);

    const body=await req.json();
    const action=String(body.action||'');
    const contractorId=String(body.contractorId||'');
    if(!contractorId) return json({error:'contractor_required'},400);
    const {data:contractor,error:contractorError}=await admin.from('contractors')
      .select('id,name_ar,contractor_no,contact_name').eq('id',contractorId).maybeSingle();
    if(contractorError||!contractor) return json({error:'contractor_not_found'},404);
    const {data:existing}=await admin.from('contractor_portal_accounts').select('*').eq('contractor_id',contractorId).maybeSingle();

    if(action==='provision'){
      if(existing) return json({error:'account_exists',account:{username:existing.username,displayName:existing.display_name,isActive:existing.is_active}},409);
      const fallback=`cnt-${String(contractor.contractor_no||contractor.id.slice(0,8))}`;
      const username=normalizeUsername(String(body.username||fallback));
      if(!/^[a-z0-9][a-z0-9._-]{3,31}$/.test(username)) return json({error:'invalid_username'},400);
      const loginEmail=`${username}@portal.arkan.local`;
      const temporaryPassword=password();
      const displayName=String(body.displayName||contractor.contact_name||contractor.name_ar).trim();
      const {data:created,error:createError}=await admin.auth.admin.createUser({
        email:loginEmail,password:temporaryPassword,email_confirm:true,
        app_metadata:{account_type:'contractor',contractor_id:contractor.id},
      });
      if(createError) return json({error:'auth_create_failed',message:createError.message},400);
      const {error:insertError}=await admin.from('contractor_portal_accounts').insert({
        contractor_id:contractor.id,auth_user_id:created.user.id,username,login_email:loginEmail,
        display_name:displayName,created_by:user.id,
      });
      if(insertError){await admin.auth.admin.deleteUser(created.user.id);return json({error:'account_create_failed',message:insertError.message},400);}
      return json({ok:true,account:{username,displayName,isActive:true},temporaryPassword});
    }

    if(!existing) return json({error:'account_not_found'},404);
    if(action==='reset_password'){
      const temporaryPassword=password();
      const {error}=await admin.auth.admin.updateUserById(existing.auth_user_id,{password:temporaryPassword});
      if(error) return json({error:'password_reset_failed',message:error.message},400);
      await admin.from('contractor_portal_accounts').update({password_reset_at:new Date().toISOString()}).eq('id',existing.id);
      return json({ok:true,account:{username:existing.username,displayName:existing.display_name,isActive:existing.is_active},temporaryPassword});
    }
    if(action==='set_active'){
      const isActive=Boolean(body.isActive);
      const {error}=await admin.from('contractor_portal_accounts').update({is_active:isActive}).eq('id',existing.id);
      if(error) return json({error:'status_update_failed',message:error.message},400);
      return json({ok:true,account:{username:existing.username,displayName:existing.display_name,isActive}});
    }
    return json({error:'unsupported_action'},400);
  } catch(error){console.error(error);return json({error:'internal_error'},500);}
});
