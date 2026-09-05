// عقد الجلد المرئي — يفصل معنى الواجهة عن شكلها.
// أي واجهة مستقبلية يجب أن تلبّي هذا العقد بدل إعادة بناء منطق الصفحات أو هندستها.
export const UI_SKIN_CONTRACT = Object.freeze({
  id:'arkan-semantic-skin-v1',
  nativeSkin:'native',
  attribute:'data-ui-skin-contract',
  skinAttribute:'data-ui-skin',
  principle:'business-and-interaction-contracts-stay-stable-while-skin-is-replaceable',
  slots:Object.freeze({
    navigation:'navigation',
    navigationRail:'navigation-rail',
    navigationPanel:'navigation-panel',
    navigationHeader:'navigation-header',
    navigationGroup:'navigation-group',
    navigationRow:'navigation-row',
    navigationFooter:'navigation-footer',
    navigationTrigger:'navigation-trigger',
    applicationStage:'application-stage',
    applicationContent:'application-content',
    routeMount:'route-mount',
    systemState:'system-state',
    actionContextBanner:'action-context-banner',
    sheet:'sheet',
    header:'sheet-header',
    section:'section',
    ledger:'ledger',
    dock:'dock',
    selectionDock:'selection-dock',
    page:'page',
    pageHeader:'page-header',
    sectionHeader:'section-header',
    sectionBody:'section-body',
    summary:'summary',
    filters:'filters',
    entry:'entry',
    notice:'notice',
    toolbar:'toolbar',
    contextActions:'context-actions',
    recordList:'record-list',
    recordRow:'record-row',
    recordSummary:'record-summary',
    table:'table',
    form:'form',
    field:'field',
    action:'action',
    dialog:'dialog',
    empty:'empty-state',
  }),
  tokens:Object.freeze([
    '--ui-canvas','--ui-surface','--ui-surface-strong','--ui-text','--ui-text-muted',
    '--ui-border','--ui-border-soft','--ui-accent','--ui-accent-strong','--ui-success',
    '--ui-info','--ui-danger','--ui-warning','--ui-on-accent','--ui-radius','--ui-radius-sm',
    '--ui-radius-lg','--ui-font-size','--ui-font-size-sm','--ui-row-height','--ui-gap','--ui-page-pad',
    '--ui-shell-rail-width','--ui-shell-nav-width',
  ]),
});

export function uiSkinDataAttributes(skin = UI_SKIN_CONTRACT.nativeSkin) {
  return Object.freeze({
    [UI_SKIN_CONTRACT.attribute]:UI_SKIN_CONTRACT.id,
    [UI_SKIN_CONTRACT.skinAttribute]:skin || UI_SKIN_CONTRACT.nativeSkin,
  });
}

export function uiSlot(name) {
  return UI_SKIN_CONTRACT.slots[name] || String(name || 'unknown');
}
