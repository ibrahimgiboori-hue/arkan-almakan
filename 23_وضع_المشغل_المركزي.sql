-- وضع المشغل المركزي الحالي
-- الهيكل التنظيمي بيانات إدارية وليس آلية لمنح صلاحيات الدخول.

create policy org_classifications_write on org_classifications for all to authenticated using (true) with check (true);
create policy org_positions_write on org_positions for all to authenticated using (true) with check (true);
create policy org_job_titles_write on org_job_titles for all to authenticated using (true) with check (true);
create policy org_position_job_titles_write on org_position_job_titles for all to authenticated using (true) with check (true);

-- وظائف المرحلة الجديدة لا تكون متاحة للمستخدم غير المسجل.
revoke execute on function record_manual_approval(text,uuid,uuid,text,date,text,text,text,text,text) from public, anon;
revoke execute on function record_leave_manual_decision(uuid,uuid,text,date,text,text) from public, anon;
revoke execute on function record_advance_manual_decision(uuid,uuid,text,date,text,text) from public, anon;
revoke execute on function record_advance_disbursement(uuid,date,text,text) from public, anon;
revoke execute on function issue_document_manual(uuid,uuid,uuid,text) from public, anon;

grant execute on function record_manual_approval(text,uuid,uuid,text,date,text,text,text,text,text) to authenticated;
grant execute on function record_leave_manual_decision(uuid,uuid,text,date,text,text) to authenticated;
grant execute on function record_advance_manual_decision(uuid,uuid,text,date,text,text) to authenticated;
grant execute on function record_advance_disbursement(uuid,date,text,text) to authenticated;
grant execute on function issue_document_manual(uuid,uuid,uuid,text) to authenticated;
