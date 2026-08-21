/**
 * Divide measured quotation blocks into fixed-height pages.
 *
 * Every block is atomic: the paginator only moves a whole block to the next
 * page and never slices it. Consecutive item rows share one repeated header.
 */
export function paginateQuoteBlocks({
  blocks,
  heights,
  availableHeight,
  tableHeaderHeight = 0,
}) {
  if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
    throw new RangeError('availableHeight must be a positive finite number');
  }

  const list = Array.isArray(blocks) ? blocks : [];
  const measured = heights || {};
  const headerHeight = Math.max(0, Number(tableHeaderHeight) || 0);
  const pages = [];
  const oversizeBlockIds = [];
  const unkeepableTitleIds = [];

  let page = [];
  let used = 0;
  let inTable = false;

  const heightOf = (block) => Math.max(0, Number(measured[block.id]) || 0);
  const isRow = (block) => block?.kind === 'row';
  const isTitleRow = (block) => isRow(block) && block?.line?.kind === 'title';

  const commitPage = () => {
    if (!page.length) return;
    pages.push(page);
    page = [];
    used = 0;
    inTable = false;
  };

  list.forEach((block, index) => {
    const blockHeight = heightOf(block);
    const needsHeader = isRow(block) && !inTable;
    const headerCost = needsHeader ? headerHeight : 0;
    const next = list[index + 1];

    // A section/title row should travel with its first child whenever the pair
    // can fit on a fresh page. This prevents an orphan heading at page bottom.
    const keepWithNextHeight = isTitleRow(block) && isRow(next)
      ? heightOf(next)
      : 0;
    const pairFitsFreshPage = headerHeight + blockHeight + keepWithNextHeight
      <= availableHeight;
    const reservation = pairFitsFreshPage ? keepWithNextHeight : 0;

    if (page.length && used + headerCost + blockHeight + reservation > availableHeight) {
      commitPage();
    }

    const freshHeaderCost = isRow(block) && !inTable ? headerHeight : 0;
    if (!page.length && freshHeaderCost + blockHeight > availableHeight) {
      oversizeBlockIds.push(block.id);
    }
    if (isTitleRow(block) && keepWithNextHeight && !pairFitsFreshPage) {
      unkeepableTitleIds.push(block.id);
    }

    // Charge a repeated table header exactly once on every page/table run.
    if (isRow(block) && !inTable) {
      used += headerHeight;
      inTable = true;
    } else if (!isRow(block)) {
      inTable = false;
    }

    page.push(block);
    used += blockHeight;
  });

  commitPage();

  return {
    pages: pages.length ? pages : [[]],
    oversizeBlockIds,
    unkeepableTitleIds,
  };
}
