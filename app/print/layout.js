import './print-constitution.css';
import './print-office-model.css';
import './print-register-report.css';
import './print-workbench.css';
import PrintGovernanceBoundary from '@/components/print/PrintGovernanceBoundary';
import { PRINT_LAYOUT_MODEL_VERSION } from '@/lib/print-layout-model';

export default function PrintLayout({ children }) {
  return (
    <div
      className="print-route-root"
      data-print-route-root="true"
      data-print-layout-model="fixed-grid-visible-borders"
      data-print-layout-model-version={PRINT_LAYOUT_MODEL_VERSION}
    >
      <PrintGovernanceBoundary>{children}</PrintGovernanceBoundary>
    </div>
  );
}
