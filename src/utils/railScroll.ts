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

  const rowRect = typeof row.getBoundingClientRect === 'function'
    ? row.getBoundingClientRect()
    : { left: 0, right: row.clientWidth, width: row.clientWidth };
  const currScroll = row.scrollLeft || 0;

  // Compute card positions in static content coordinates (invariant to scrollLeft and offsetParent)
  const cardPositions = children.map((card) => {
    let contentLeft: number;
    let contentRight: number;
    let width: number;

    if (typeof card.getBoundingClientRect === 'function') {
      const cardRect = card.getBoundingClientRect();
      contentLeft = cardRect.left - rowRect.left + currScroll;
      contentRight = cardRect.right - rowRect.left + currScroll;
      width = cardRect.width || card.offsetWidth;
    } else {
      contentLeft = card.offsetLeft;
      width = card.offsetWidth;
      contentRight = contentLeft + width;
    }

    return {
      element: card,
      contentLeft,
      contentRight,
      width
    };
  });

  const firstCard = cardPositions[0];
  const secondCard = cardPositions[1];
  const stride = secondCard ? secondCard.contentLeft - firstCard.contentLeft : firstCard.width;

  // Count how many card columns are fully visible across the rail container width
  let columnsCount = 0;
  for (let i = 0; i < cardPositions.length; i++) {
    const relativeRight = cardPositions[i].contentRight - firstCard.contentLeft + paddingLeft;
    if (relativeRight <= paddingLeft + availableWidth + 2) {
      columnsCount++;
    } else {
      break;
    }
  }
  columnsCount = Math.max(1, columnsCount);

  // Pagination step and end boundary
  const scrollStep = Math.max(1, columnsCount > 1 ? columnsCount - 1 : 1);
  const maxStartIndex = Math.max(0, cardPositions.length - columnsCount);

  const lastCard = cardPositions[cardPositions.length - 1];
  // Maximum scroll position that binds the last card flush against the right container padding
  const maxStrideScroll = Math.max(0, lastCard.contentRight + paddingRight - row.clientWidth);

  return {
    children,
    cardPositions,
    paddingLeft,
    paddingRight,
    stride,
    columnsCount,
    scrollStep,
    maxStartIndex,
    maxStrideScroll
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

  const { cardPositions, paddingLeft, scrollStep, maxStartIndex, maxStrideScroll } = layout;
  const currScroll = row.scrollLeft;

  // Identify current card index whose left edge is at or nearest the left padding boundary
  let currentIndex = 0;
  for (let i = 0; i < cardPositions.length; i++) {
    const cardLeftOffset = cardPositions[i].contentLeft - paddingLeft;
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
    if (targetIndex >= maxStartIndex) {
      // Bound the final card flush against the right margin
      targetScrollLeft = maxStrideScroll;
    } else {
      targetScrollLeft = cardPositions[targetIndex].contentLeft - paddingLeft;
    }
  } else {
    // If we are at or near the right-bound final page, step backward from maxStartIndex
    if (currScroll >= maxStrideScroll - 15 || currentIndex >= maxStartIndex) {
      targetIndex = Math.max(0, Math.floor((maxStartIndex - 1) / scrollStep) * scrollStep);
    } else {
      targetIndex = Math.max(0, currentIndex - scrollStep);
    }
    targetScrollLeft = targetIndex === 0
      ? 0
      : cardPositions[targetIndex].contentLeft - paddingLeft;
  }

  row.scrollTo({
    left: targetScrollLeft,
    behavior: 'smooth'
  });
}
