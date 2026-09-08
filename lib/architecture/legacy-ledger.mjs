// سجل الرقع/التوافق القديمة المسموح ببقائها مؤقتًا.
// وجود العنصر هنا لا يعني أنه جزء من المعمارية؛ بل يعني أننا عرفنا فائدته ونمنع نموه حتى يُمتص بالكامل.

export const LEGACY_COMPATIBILITY_LEDGER = Object.freeze([
  Object.freeze({
    id:'legacy-semantic-dom-bridge',
    path:'components/ui/LegacySemanticBridgeRuntime.js',
    keeps:'semantic-data-ui-annotations-for-old-markup',
    mayDo:Object.freeze(['annotate-existing-dom','detect-loading-state']),
    mustNotDo:Object.freeze(['draw-brand-identity','own-business-rules','write-data']),
    retirement:'remove-when-all-active-screens-emit-native-data-ui-semantics',
  }),
  Object.freeze({
    id:'dashboard-token-alias-bridge',
    path:'app/dashboard/raw-tokens.css',
    keeps:'old-token-names-mapped-to-semantic-ui-tokens',
    mayDo:Object.freeze(['alias-css-variables']),
    mustNotDo:Object.freeze(['define-independent-colors','define-independent-brand-identity']),
    retirement:'remove-when-no-active-screen-references-raw-token-names',
  }),
  Object.freeze({
    id:'prehydration-structure-containment',
    path:'app/dashboard/prehydration-legacy-containment.css',
    keeps:'structural-safety-before-semantic-runtime-hydrates',
    mayDo:Object.freeze(['prevent-legacy-shell-layout-breakage']),
    mustNotDo:Object.freeze(['color','branding','typography','business-behavior']),
    retirement:'remove-when-legacy-shell-markup-is-no-longer-rendered',
  }),
]);

export const LEGACY_RETIREMENT_POLICY = Object.freeze({
  principle:'absorb-value-delete-patch-never-clone-it',
  newPatchFilesAllowed:false,
  visualPatchGrowthAllowed:false,
  businessRuleDuplicationAllowed:false,
  replacementSequence:Object.freeze([
    'identify-the-real-benefit',
    'move-benefit-into-stable-contract-or-core',
    'prove-current-behavior-is-preserved',
    'delete-the-obsolete-patch',
  ]),
});

export function legacyCompatibilityByPath(path) {
  return LEGACY_COMPATIBILITY_LEDGER.find((item) => item.path === path) || null;
}
