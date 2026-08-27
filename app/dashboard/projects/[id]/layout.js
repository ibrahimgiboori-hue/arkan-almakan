export default function ProjectWorkspaceLayout({ children }) {
  // الغلاف المرئي الوحيد هو Dashboard/منصة الأعمال.
  // صلاحيات المشروع تُحسم في كتالوج المنصة وRLS داخل قاعدة البيانات؛
  // لا ننشئ هنا رأسًا أو مستوى ملاحة ثانيًا فوق الأداة.
  return children;
}
