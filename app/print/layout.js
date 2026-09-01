import './print-constitution.css';
import './print-office-model.css';
import './print-generic-governance.css';
import './print-blank-form.css';
import './print-report-paper-form.css';
import PrintGovernanceBoundary from '@/components/print/PrintGovernanceBoundary';

export default function PrintLayout({ children }) {
  return <PrintGovernanceBoundary>{children}</PrintGovernanceBoundary>;
}
