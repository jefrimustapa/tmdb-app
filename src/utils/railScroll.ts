/**
 * Utility functions for horizontal content rail discrete pagination and alignment.
 */

export function getRailLayout(row: HTMLElement) {
  const cardElements = row.querySelectorAll<HTMLElement>('.tv-focus-target');
  const children = cardElements.length > 0
    ? Array.from(cardElements)
    : (Array.from(row.children) as HTMLElement[]);

  if (children.length === 0) return null;

  const style = window.getComputedStyle(row);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const availableWidth = row.clientWidth - paddingLeft - paddingRight;

  const firstChild = children[0];
  const secondChild = children[1];
  const stride = secondChild ? secondChild.offsetLeft - firstChild.offsetLeft : firstChild.offsetWidth;

  // Count how many card columns are visible across the rail container width
  let columnsCount = 0;
  for (let i = 0; i < children.length; i++) {
    if (children[i].offsetLeft < paddingLeft + availableWidth) {
      columnsCount++;
    } else {
      break;
    }
  }
  columnsCount = Math.max(1, columnsCount);

  // Pagination step and end boundary
  const scrollStep = Math.max(1, columnsCount > 1 ? columnsCount - 1 : 1);
  const maxStartIndex = Math.max(0, children.length - columnsCount);

  // Last card position
  const lastChild = children[children.length - 1];
  const lastCardRight = lastChild ? lastChild.offsetLeft + lastChild.offsetWidth : 0;
  const containerRight = row.clientWidth - paddingRight;
  const hasOverflow = lastCardRight > containerRight + 2;

  // Maximum scroll position to bind the last card flush against the right margin
  const endBoundScroll = Math.max(0, lastCardRight + paddingRight - row.clientWidth);

  // Stride-based scroll position for maxStartIndex
  const strideMaxScroll = maxStartIndex > 0 && children[maxStartIndex]
    ? children[maxStartIndex].offsetLeft - paddingLeft
    : 0;

  // If at strideMaxScroll the last card is noticeably cut off (> clientWidth) or leaves an empty gap (< containerRight - 10px),
  // or if maxStartIndex is 0 but the row overflows (e.g. 7 landscape cards in Continue Watching),
  // bound the last card to the right using endBoundScroll.
  // Otherwise, use strideMaxScroll (preserving exact discrete column alignment for rails like Trending Now).
  const lastCardRightAtStride = lastCardRight - strideMaxScroll;
  const isLastCardMisaligned = (lastCardRightAtStride > row.clientWidth + 5)
    || (lastCardRightAtStride < containerRight - 10)
    || (maxStartIndex === 0 && hasOverflow);

  const maxStrideScroll = isLastCardMisaligned
    ? endBoundScroll
    : strideMaxScroll;

  return {
    children,
    paddingLeft,
    paddingRight,
    stride,
    columnsCount,
    scrollStep,
    maxStartIndex,
    maxStrideScroll,
    endBoundScroll,
    hasOverflow
  };
}

export function getRailScrollState(row: HTMLElement | null): { canScrollLeft: boolean; canScrollRight: boolean } {
  if (!row) return { canScrollLeft: false, canScrollRight: false };

  const layout = getRailLayout(row);
  if (!layout) return { canScrollLeft: false, canScrollRight: false };

  return {
    canScrollLeft: row.scrollLeft > 10,
    canScrollRight: layout.maxStrideScroll > 10 && row.scrollLeft < layout.maxStrideScroll - 10
  };
}

export function scrollContentRail(row: HTMLElement | null, direction: 'left' | 'right'): void {
  if (!row) return;

  const layout = getRailLayout(row);
  if (!layout) return;

  const { children, paddingLeft, scrollStep, maxStartIndex, maxStrideScroll } = layout;
  const currScroll = row.scrollLeft;

  // Identify current card index whose left edge is at or nearest the left padding boundary
  let currentIndex = 0;
  for (let i = 0; i < children.length; i++) {
    const cardLeftOffset = children[i].offsetLeft - paddingLeft;
    if (cardLeftOffset <= currScroll + 10) {
      currentIndex = i;
    } else {
      break;
    }
  }

  let targetIndex: number;
  let targetScrollLeft: number;

  if (direction === 'right') {
    targetIndex = Math.min(maxStartIndex, currentIndex + scrollStep);
    if (targetIndex >= maxStartIndex || maxStartIndex === 0) {
      targetScrollLeft = maxStrideScroll;
    } else {
      targetScrollLeft = children[targetIndex].offsetLeft - paddingLeft;
    }
  } else {
    // Scrolling left
    if (currScroll >= maxStrideScroll - 15) {
      targetIndex = maxStartIndex > 0
        ? Math.max(0, Math.floor((maxStartIndex - 1) / scrollStep) * scrollStep)
        : 0;
      targetScrollLeft = targetIndex === 0 ? 0 : children[targetIndex].offsetLeft - paddingLeft;
    } else {
      targetIndex = Math.max(0, currentIndex - scrollStep);
      targetScrollLeft = targetIndex === 0 ? 0 : children[targetIndex].offsetLeft - paddingLeft;
    }
  }

  row.scrollTo({
    left: targetScrollLeft,
    behavior: 'smooth'
  });
}
