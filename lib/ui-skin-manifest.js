// Complete UI identity pack manifest.
// Business behavior never imports from this manifest; it describes only the visual outfit.
export const ACTIVE_UI_SKIN = Object.freeze({
  id:'arkan-signature-v1',
  contract:'arkan-semantic-skin-v1',
  coverage:'inside-and-outside-complete-outfit',
  switch:'lib/ui-active-skin.js',
  approvedDesign:Object.freeze({
    name:'ARKAN SIGNATURE — APPROVED MASTER',
    source:'Figma',
    principle:'executive-luxury-operational-clarity-arkan-identity',
  }),
  layers:Object.freeze({
    tokens:'app/ui-skin-tokens.css',
    external:'app/ui-external-skin.css',
    signature:'app/ui-signature-skin.css',
    signatureTailoring:'app/ui-signature-tailoring.css',
    dashboardCompatibility:'app/dashboard/raw-tokens.css',
    foundation:'app/dashboard/ui-skin-foundation.css',
    components:'app/dashboard/ui-component-skin.css',
    semanticAdapter:'app/dashboard/ui-semantic-adapter-skin.css',
    shell:'app/dashboard/ui-shell-skin.css',
    experience:'app/dashboard/ui-experience-skin.css',
    body:'app/dashboard/ui-skin-contract.css',
  }),
  imagery:Object.freeze({
    projects:'public/skin/signature/projects.svg',
    finance:'public/skin/signature/finance.svg',
    workforce:'public/skin/signature/workforce.svg',
    documents:'public/skin/signature/documents.svg',
    admin:'public/skin/signature/admin.svg',
    login:'public/skin/signature/login-architecture.svg',
    rule:'contextual-imagery-supports-the-work-and-never-replaces-data-truth',
  }),
  bridge:Object.freeze({
    legacyMarkup:'components/ui/LegacySemanticBridgeRuntime.js',
    preHydrationContainment:'app/dashboard/prehydration-legacy-containment.css',
    dashboardTokenAliases:'app/dashboard/raw-tokens.css',
    rootGlobalsStatus:'compatibility-source-not-authoritative-skin',
    visualLegacyLayer:false,
    containmentPolicy:'structure-only-no-identity',
  }),
  proof:Object.freeze({
    nativeSkin:'native',
    stressSkin:'stress-test',
    rule:'changing ACTIVE_UI_SKIN_KEY is sufficient to repaint internal and external screen UI',
  }),
  print:Object.freeze({
    policy:'separate-print-constitution-shared-brand-identity',
    captain:'print-constitution',
    rule:'screen-skin-never-overrides-document-pagination-or-print-safety',
  }),
  replacementRule:'replace-visual-layers-and-tokens-without-changing-routes-data-permissions-or-business-logic',
});
