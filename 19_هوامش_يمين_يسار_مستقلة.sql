-- ============================================================
--  الملف 19 : هوامش يمين/يسار مستقلة وثابتة للمطبوعات
-- ============================================================
-- القاعدة: القيمة الرقمية بالملليمتر هي مصدر الحقيقة، وليس موضع أي slider.
-- margin_side_mm يبقى للتوافق مع المستندات القديمة فقط.

alter table quotations add column if not exists margin_right_mm numeric(5,1);
alter table quotations add column if not exists margin_left_mm  numeric(5,1);

alter table documents add column if not exists margin_right_mm numeric(5,1);
alter table documents add column if not exists margin_left_mm  numeric(5,1);

-- لا ننسخ margin_side_mm إلى العمودين: NULL يعني استخدام الإعداد المركزي/القديم
-- ويحافظ ذلك على سلوك المستندات الحالية دون تغيير مفاجئ.

notify pgrst, 'reload schema';
