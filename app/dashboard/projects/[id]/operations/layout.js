import ProjectSheetTabs from './sheet-tabs';

export default function OperationsLayout({ children }) {
  return <section data-operation-shell="true">{children}<ProjectSheetTabs /></section>;
}
