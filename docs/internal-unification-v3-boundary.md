# Tuxedo replacement boundary

لتغيير الواجهة المرئية مستقبلًا يجب أن يبقى المسار خارج قواعد الأعمال:

- الاختيار: `lib/ui-active-skin.js`
- التعريف: `lib/ui-skin-registry.js`
- CSS الجذري: `app/ui-active-skin.css`
- CSS لوحة التحكم: `app/dashboard/ui-active-dashboard-skin.css`
- runtime الجذري: `components/ui/ActiveUISkinRuntime.js`
- runtime لوحة التحكم: `components/ui/ActiveDashboardSkinRuntime.js`

لا يجوز أن ينتقل تغيير البدلة إلى core أو adapters أو القبطان للطباعة.
