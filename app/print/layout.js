import './print-system.css';
import './procedure-system.css';
import PrintGovernanceBoundary from '@/components/print/PrintGovernanceBoundary';

export default function PrintLayout({ children }) {
  return <PrintGovernanceBoundary>{children}</PrintGovernanceBoundary>;
}
