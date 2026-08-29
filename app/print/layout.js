import './print-constitution.css';
import './print-office-model.css';
import PrintGovernanceBoundary from '@/components/print/PrintGovernanceBoundary';

export default function PrintLayout({ children }) {
  return <PrintGovernanceBoundary>{children}</PrintGovernanceBoundary>;
}
