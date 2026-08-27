import ProcedureRouteMatrix from '@/components/admin/ProcedureRouteMatrix';
import { ConstitutionPage, PageHeader, Section, Notice } from '@/components/ui/ConstitutionUI';

export default function TransactionConstitutionPage(){
  return (
    <ConstitutionPage>
      <PageHeader
        eyebrow="الإدارة · الحوكمة وسير العمل"
        title="دستور حركة المعاملات"
        description="حدد فقط ما تريد إلزام المعاملة به. كل حقل تعبئه يصبح قيدًا ملزمًا، وكل حقل تتركه فارغًا يستكمله منشئ المعاملة عند ظهور الصنارة."
      />
      <Section
        title="دستور حركة المعاملات"
        description="الصنارة تلتقط الحدث فقط؛ القلب المركزي يطبق القيود والمسار المحدد هنا."
      >
        <ProcedureRouteMatrix />
      </Section>
      <Notice tone="neutral">القرار الأساسي هو: هل تحتاج المعاملة إجراء؟ النوع والبوابة والموظف والملاحظة قيود اختيارية، وإذا حُددت هنا تصبح ملزمة عند إنشاء الإجراء.</Notice>
    </ConstitutionPage>
  );
}
