import './print-constitution.css';
import './print-office-model.css';
import './print-generic-governance.css';
import './print-blank-form.css';
import './print-report-paper-form.css';
import './print-register-report.css';
import PrintGovernanceBoundary from '@/components/print/PrintGovernanceBoundary';

export default function PrintLayout({ children }) {
  return (
    <div className="print-route-root" data-print-route-root="true">
      <PrintGovernanceBoundary>{children}</PrintGovernanceBoundary>
    </div>
  );
}
