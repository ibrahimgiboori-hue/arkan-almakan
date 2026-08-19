'use client';

import { usePathname } from 'next/navigation';
import {
  PRINT_GOVERNANCE_VERSION,
  printGovernanceClassName,
  resolvePrintDocument,
} from '@/lib/print-governance';

export default function PrintGovernanceBoundary({ children }) {
  const pathname = usePathname();
  const definition = resolvePrintDocument(pathname);

  if (!definition) {
    return (
      <div
        className="print-constitution print-unregistered"
        data-print-status="unregistered"
        data-print-governance-version={PRINT_GOVERNANCE_VERSION}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={printGovernanceClassName(definition.key)}
      data-print-document={definition.key}
      data-print-family={definition.family}
      data-print-status={definition.status}
      data-print-governance-version={PRINT_GOVERNANCE_VERSION}
    >
      {children}
    </div>
  );
}
