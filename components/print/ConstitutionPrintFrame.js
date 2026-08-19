import PrintFrame from '@/components/print/PrintFrame';
import {
  PRINT_GOVERNANCE_VERSION,
  getPrintDefinition,
  getPrintLayoutPolicy,
  printGovernanceClassName,
} from '@/lib/print-governance';

export default function ConstitutionPrintFrame({
  documentKey,
  className = '',
  children,
  ...frameProps
}) {
  const definition = getPrintDefinition(documentKey);
  const layout = getPrintLayoutPolicy(documentKey);
  const classes = printGovernanceClassName(documentKey, className);

  return (
    <PrintFrame
      {...frameProps}
      contentTopMm={layout.topMm ?? frameProps.contentTopMm}
      contentBottomMm={layout.bottomMm ?? frameProps.contentBottomMm}
      contentSideMm={layout.sideMm ?? frameProps.contentSideMm}
    >
      <div
        className={classes}
        data-print-document={documentKey}
        data-print-family={definition.family}
        data-print-status={definition.status}
        data-print-governance-version={PRINT_GOVERNANCE_VERSION}
      >
        {children}
      </div>
    </PrintFrame>
  );
}
