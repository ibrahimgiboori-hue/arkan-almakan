'use client';

import { usePathname } from 'next/navigation';
import { SYSTEM_VERSION } from '@/lib/system-constitution';
import {
  PRINT_GOVERNANCE_VERSION,
  printGovernanceClassName,
  resolvePrintDocument,
} from '@/lib/print-governance';
import PrintTextAlignmentEditor from '@/components/print/PrintTextAlignmentEditor';

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
        <div className="print-constitution-error">
          <strong>الطباعة موقوفة لهذه الصفحة.</strong>
          <div>هذا المسار غير مسجل في دستور الطباعة المركزي، لذلك لن يسمح النظام بإخراج مطبوعة مستقلة خارج الدستور.</div>
          <small>{pathname}</small>
        </div>
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
      <PrintTextAlignmentEditor documentKey={definition.key} />
      {children}
    </div>
  );
}
