// Complete UI identity pack manifest.
// Business behavior never imports from this manifest; it describes only the visual outfit.
export const ACTIVE_UI_SKIN = Object.freeze({
  id:'arkan-native-v1',
  contract:'arkan-semantic-skin-v1',
  coverage:'inside-and-outside-complete-outfit',
  switch:'lib/ui-active-skin.js',
  layers:Object.freeze({
    tokens:'app/ui-skin-tokens.css',
    external:'app/ui-external-skin.css',
    dashboardCompatibility:'app/dashboard/raw-tokens.css',
    foundation:'app/dashboard/ui-skin-foundation.css',
    components:'app/dashboard/ui-component-skin.css',
    semanticAdapter:'app/dashboard/ui-semantic-adapter-skin.css',
    shell:'app/dashboard/ui-shell-skin.css',
    experience:'app/dashboard/ui-experience-skin.css',
    body:'app/dashboard/ui-skin-contract.css',
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
