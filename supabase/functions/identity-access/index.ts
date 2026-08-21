import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function normalizeArabicDigits(value: string) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  return value.replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(persian.indexOf(d)));
}
function normalizeIdentity(value: unknown) {
  return normalizeArabicDigits(String(value ?? "")).trim().replace(/[\s-]+/g, "");
}
async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim();
}
async function delayedResponse(startedAt: number, body: Record<string, unknown>, status = 200) {
  const remaining = 500 - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startedAt = Date.now();
  if (req.method !== "POST") return delayedResponse(startedAt, { ok: false, message: "طلب غير صالح." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) return delayedResponse(startedAt, { ok: false, message: "تعذر إكمال العملية الآن." }, 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let token = "";
  let identity = "";
  let password = "";
  try {
    const body = await req.json();
    token = String(body?.token ?? "").trim().toLowerCase();
    identity = normalizeIdentity(body?.identity);
    password = String(body?.password ?? "");
  } catch {
    return delayedResponse(startedAt, { ok: false, message: "تعذر التحقق من الرابط أو البيانات." }, 400);
  }

  if (!/^[a-f0-9]{64}$/.test(token) || !/^\d{10}$/.test(identity) || password.length < 8 || password.length > 72) {
    return delayedResponse(startedAt, { ok: false, message: "تعذر التحقق من الرابط أو البيانات." }, 400);
  }

  const fingerprint = await sha256(`access|${identity}|${clientIp(req)}|${serviceKey.slice(-32)}`);
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  try {
    const { count } = await admin.from("identity_auth_attempts")
      .select("id", { count: "exact", head: true })
      .in("action", ["activate", "reset"])
      .eq("fingerprint_hash", fingerprint)
      .eq("success", false)
      .gte("attempted_at", windowStart);

    if ((count ?? 0) >= 6) return delayedResponse(startedAt, { ok: false, message: "تعذر إكمال العملية الآن. حاول بعد قليل." }, 429);

    const tokenHash = await sha256(token);
    const nowIso = new Date().toISOString();
    const { data: tokenRow } = await admin.from("user_access_tokens")
      .select("id,employee_id,purpose,requested_role,expires_at,used_at,revoked_at")
      .eq("token_hash", tokenHash).maybeSingle();

    const action = tokenRow?.purpose === "reset" ? "reset" : "activate";
    const record = async (success: boolean) => {
      await admin.from("identity_auth_attempts").insert({ action, fingerprint_hash: fingerprint, success });
    };

    if (!tokenRow?.id || !["activate", "reset"].includes(tokenRow.purpose) || tokenRow.used_at || tokenRow.revoked_at || new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      await record(false);
      return delayedResponse(startedAt, { ok: false, message: "تعذر التحقق من الرابط أو البيانات." }, 400);
    }

    const { data: employee } = await admin.from("employees").select("id,id_number").eq("id", tokenRow.employee_id).maybeSingle();
    if (!employee?.id || normalizeIdentity(employee.id_number) !== identity) {
      await record(false);
      return delayedResponse(startedAt, { ok: false, message: "تعذر التحقق من الرابط أو البيانات." }, 400);
    }

    const { data: existing } = await admin.from("app_users").select("id,role,is_active").eq("employee_id", employee.id).maybeSingle();
    if ((tokenRow.purpose === "activate" && existing?.id) || (tokenRow.purpose === "reset" && !existing?.id)) {
      await record(false);
      return delayedResponse(startedAt, { ok: false, message: "تعذر التحقق من الرابط أو البيانات." }, 400);
    }

    const claimedAt = new Date().toISOString();
    const { data: claimed } = await admin.from("user_access_tokens")
      .update({ used_at: claimedAt }).eq("id", tokenRow.id).is("used_at", null).is("revoked_at", null)
      .gt("expires_at", nowIso).select("id").maybeSingle();
    if (!claimed?.id) {
      await record(false);
      return delayedResponse(startedAt, { ok: false, message: "تعذر التحقق من الرابط أو البيانات." }, 400);
    }
    const releaseClaim = async () => { await admin.from("user_access_tokens").update({ used_at: null }).eq("id", tokenRow.id); };

    let userId = existing?.id || "";
    if (tokenRow.purpose === "activate") {
      const role = String(tokenRow.requested_role || "");
      if (!["ceo", "hr", "accountant", "supervisor"].includes(role)) {
        await releaseClaim(); await record(false);
        return delayedResponse(startedAt, { ok: false, message: "تعذر التحقق من الرابط أو البيانات." }, 400);
      }
      const internalEmail = `account-${employee.id}@auth.arkan.local`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: internalEmail, password, email_confirm: true,
        user_metadata: { employee_id: employee.id, identity_login: true },
      });
      if (createError || !created.user?.id) {
        await releaseClaim(); await record(false);
        return delayedResponse(startedAt, { ok: false, message: "تعذر إكمال تفعيل الحساب الآن." }, 500);
      }
      userId = created.user.id;
      const { error: appUserError } = await admin.from("app_users").insert({
        id: userId, employee_id: employee.id, role, is_active: true, is_system_admin: false,
        must_change_password: false, temporary_password_set_at: null, password_changed_at: claimedAt,
        access_note: "تم تفعيل الحساب عبر بوابة الهوية",
      });
      if (appUserError) {
        await admin.auth.admin.deleteUser(userId); await releaseClaim(); await record(false);
        return delayedResponse(startedAt, { ok: false, message: "تعذر إكمال تفعيل الحساب الآن." }, 500);
      }
    } else {
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password });
      if (updateError) {
        await releaseClaim(); await record(false);
        return delayedResponse(startedAt, { ok: false, message: "تعذر تحديث كلمة المرور الآن." }, 500);
      }
      const { error: rowError } = await admin.from("app_users").update({
        must_change_password: false, temporary_password_set_at: null, password_changed_at: claimedAt,
      }).eq("id", userId);
      if (rowError) {
        await releaseClaim(); await record(false);
        return delayedResponse(startedAt, { ok: false, message: "تعذر تحديث حالة كلمة المرور الآن." }, 500);
      }
    }

    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email;
    await record(true);
    if (authUserError || !email) return delayedResponse(startedAt, { ok: true, purpose: tokenRow.purpose, signed_in: false });

    const { data: signIn } = await publicClient.auth.signInWithPassword({ email, password });
    if (!signIn.session) return delayedResponse(startedAt, { ok: true, purpose: tokenRow.purpose, signed_in: false });

    return delayedResponse(startedAt, {
      ok: true, purpose: tokenRow.purpose, signed_in: true,
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
        expires_in: signIn.session.expires_in,
        expires_at: signIn.session.expires_at,
        token_type: signIn.session.token_type,
      },
    });
  } catch {
    return delayedResponse(startedAt, { ok: false, message: "تعذر إكمال العملية الآن." }, 500);
  }
});
