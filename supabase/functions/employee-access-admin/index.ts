import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const roles = new Set(["ceo", "hr", "accountant", "supervisor"]);

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function normalizeIdentity(value: unknown) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  return String(value ?? "").replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(persian.indexOf(d))).trim().replace(/[\s-]+/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ ok: false, message: "طلب غير صالح." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return response({ ok: false, message: "تعذر إكمال العملية الآن." }, 500);

  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return response({ ok: false, message: "يلزم تسجيل الدخول." }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerData, error: callerError } = await admin.auth.getUser(bearer);
  const caller = callerData?.user;
  if (callerError || !caller?.id) return response({ ok: false, message: "انتهت جلسة الدخول." }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return response({ ok: false, message: "بيانات الطلب غير صالحة." }, 400); }
  const action = String(body.action ?? "");

  try {
    if (action === "change_own_password") {
      const password = String(body.password ?? "");
      if (password.length < 8 || password.length > 72) return response({ ok: false, message: "كلمة المرور يجب أن تكون من 8 إلى 72 خانة." }, 400);
      const { data: own } = await admin.from("app_users").select("id,is_active").eq("id", caller.id).maybeSingle();
      if (!own?.id || !own.is_active) return response({ ok: false, message: "الحساب غير مهيأ للاستخدام." }, 403);
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(caller.id, { password });
      if (updateAuthError) return response({ ok: false, message: "تعذر تحديث كلمة المرور الآن." }, 500);
      const { error: updateRowError } = await admin.from("app_users").update({
        must_change_password: false,
        temporary_password_set_at: null,
        password_changed_at: new Date().toISOString(),
      }).eq("id", caller.id);
      if (updateRowError) return response({ ok: false, message: "تم تحديث كلمة المرور وتعذر إنهاء حالة التغيير الإلزامي. تواصل مع المدير." }, 500);
      return response({ ok: true });
    }

    const { data: settings } = await admin.from("system_access_settings").select("primary_user_id").eq("singleton", true).maybeSingle();
    const primaryUserId = settings?.primary_user_id || "";
    if (!primaryUserId || primaryUserId !== caller.id) return response({ ok: false, message: "هذه العملية متاحة للمستخدم الرئيسي فقط." }, 403);

    const employeeId = String(body.employee_id ?? "");
    if (!employeeId) return response({ ok: false, message: "الموظف مطلوب." }, 400);
    const { data: employee } = await admin.from("employees").select("id,full_name_ar,id_number,status").eq("id", employeeId).maybeSingle();
    if (!employee?.id) return response({ ok: false, message: "لم يُعثر على الموظف." }, 404);
    const identity = normalizeIdentity(employee.id_number);
    const { data: appUser } = await admin.from("app_users")
      .select("id,role,is_active,must_change_password,temporary_password_set_at,password_changed_at,created_at")
      .eq("employee_id", employee.id).maybeSingle();

    if (action === "status") {
      let lastSignInAt: string | null = null;
      if (appUser?.id) {
        const { data: authUser } = await admin.auth.admin.getUserById(appUser.id);
        lastSignInAt = authUser?.user?.last_sign_in_at || null;
      }
      return response({
        ok: true,
        employee: { id: employee.id, display_name: employee.full_name_ar, identity_ready: /^\d{10}$/.test(identity) },
        account: appUser?.id ? {
          exists: true,
          role: appUser.role,
          is_active: appUser.is_active,
          must_change_password: appUser.must_change_password,
          temporary_password_set_at: appUser.temporary_password_set_at,
          password_changed_at: appUser.password_changed_at,
          created_at: appUser.created_at,
          last_sign_in_at: lastSignInAt,
          is_primary: appUser.id === primaryUserId,
        } : { exists: false },
      });
    }

    if (action === "set_temporary_password") {
      if (!/^\d{10}$/.test(identity)) return response({ ok: false, message: "يجب أن يكون رقم هوية أو إقامة الموظف 10 أرقام قبل إنشاء حساب الدخول." }, 400);
      if (appUser?.id === primaryUserId) return response({ ok: false, message: "لا يمكن إصدار كلمة مرور مؤقتة للمستخدم الرئيسي من شاشة الموظفين." }, 400);
      const password = String(body.password ?? "");
      if (password.length < 8 || password.length > 72) return response({ ok: false, message: "كلمة المرور المؤقتة يجب أن تكون من 8 إلى 72 خانة." }, 400);
      const now = new Date().toISOString();

      if (appUser?.id) {
        const { error: authError } = await admin.auth.admin.updateUserById(appUser.id, { password });
        if (authError) return response({ ok: false, message: "تعذر تعيين كلمة المرور المؤقتة." }, 500);
        const { error: rowError } = await admin.from("app_users").update({
          is_active: true,
          must_change_password: true,
          temporary_password_set_at: now,
          password_changed_at: null,
          access_note: "تم إصدار كلمة مرور مؤقتة بواسطة المستخدم الرئيسي",
        }).eq("id", appUser.id);
        if (rowError) return response({ ok: false, message: "تم تحديث المصادقة وتعذر تحديث حالة الحساب. تواصل مع الدعم." }, 500);
      } else {
        const role = String(body.role ?? "supervisor");
        if (!roles.has(role)) return response({ ok: false, message: "الدور المحدد غير صالح." }, 400);
        const internalEmail = `account-${employee.id}@auth.arkan.local`;
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: internalEmail,
          password,
          email_confirm: true,
          user_metadata: { employee_id: employee.id, identity_login: true },
        });
        if (createError || !created.user?.id) return response({ ok: false, message: "تعذر إنشاء حساب الدخول الآن." }, 500);
        const { error: insertError } = await admin.from("app_users").insert({
          id: created.user.id,
          employee_id: employee.id,
          role,
          is_active: true,
          is_system_admin: false,
          must_change_password: true,
          temporary_password_set_at: now,
          password_changed_at: null,
          access_note: "تم إنشاء الحساب بكلمة مرور مؤقتة بواسطة المستخدم الرئيسي",
        });
        if (insertError) {
          await admin.auth.admin.deleteUser(created.user.id);
          return response({ ok: false, message: "تعذر ربط حساب الدخول بالموظف." }, 500);
        }
      }
      return response({ ok: true, must_change_password: true });
    }

    if (action === "set_active") {
      if (!appUser?.id) return response({ ok: false, message: "لا يوجد حساب دخول لهذا الموظف." }, 400);
      if (appUser.id === primaryUserId) return response({ ok: false, message: "لا يمكن تعطيل المستخدم الرئيسي." }, 400);
      const isActive = body.is_active === true;
      const { error } = await admin.from("app_users").update({ is_active: isActive }).eq("id", appUser.id);
      if (error) return response({ ok: false, message: "تعذر تحديث حالة الحساب." }, 500);
      return response({ ok: true, is_active: isActive });
    }

    return response({ ok: false, message: "العملية غير معروفة." }, 400);
  } catch {
    return response({ ok: false, message: "تعذر إكمال العملية الآن." }, 500);
  }
});
