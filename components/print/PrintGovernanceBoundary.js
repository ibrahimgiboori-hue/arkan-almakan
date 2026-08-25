'use client';

import { usePathname } from 'next/navigation';
import { SYSTEM_VERSION } from '@/lib/system-constitution';
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
        data-system-constitution="v2"
        data-system-version={SYSTEM_VERSION}
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
      data-system-constitution="v2"
      data-system-version={SYSTEM_VERSION}
      data-print-document={definition.key}
      data-print-family={definition.family}
      data-print-status={definition.status}
      data-print-governance-version={PRINT_GOVERNANCE_VERSION}
    >
      {children}
    </div>
  );
}
