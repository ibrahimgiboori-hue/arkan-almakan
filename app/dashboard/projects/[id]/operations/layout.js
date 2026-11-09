// أوراق المشروع تُفتح من قائمة المشروع وحدها — لا صف تبويبات ثانٍ يكرر نفس الوجهات.
export default function OperationsLayout({ children }) {
  return <section data-operation-shell="true">{children}</section>;
}
