-- توحيد أسماء المستندات الصادرة من دورة المستخلص مع النماذج المعتمدة
update claim_stage_docs
set name_ar = 'محضر قياس وحصر الأعمال',
    hint_ar = 'يطبع لإثبات الكميات المقاسة واعتمادها بالتوقيع.'
where stage = 'draft' and code = 'claim_sheet';

update claim_stage_docs
set name_ar = 'المطالبة المالية',
    hint_ar = 'تطبع وترسل للجهة للمطالبة بصرف المستحقات.'
where stage = 'submitted' and code = 'cover_letter';

update claim_stage_docs
set name_ar = 'مذكرة داخلية لطلب إصدار فاتورة ضريبية',
    hint_ar = 'مذكرة داخلية تستخدم وفق توقيت دورة السداد والفوترة المعتمدة.'
where stage = 'owner_approved' and code = 'inv_request';

insert into claim_stage_docs(stage, code, seq, name_ar, direction, source, required, hint_ar)
values ('collected', 'payment_receipt_notice', 2, 'إشعار استلام دفعة', 'out', 'system', false,
        'إشعار صادر للجهة بعد تسجيل استلام الدفعة.')
on conflict (stage, code) do update
set name_ar = excluded.name_ar,
    direction = excluded.direction,
    source = excluded.source,
    required = excluded.required,
    hint_ar = excluded.hint_ar,
    seq = excluded.seq;
