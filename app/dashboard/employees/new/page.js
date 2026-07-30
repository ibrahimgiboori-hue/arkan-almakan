'use client';
import EmployeeForm from '@/components/EmployeeForm';

export default function NewEmployee() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>إضافة موظف</h1>
          <p>الحقول المعلّمة بنجمة إلزامية</p>
        </div>
      </div>
      <EmployeeForm />
    </>
  );
}
