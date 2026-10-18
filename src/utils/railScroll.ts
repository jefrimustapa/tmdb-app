/**
 * Utility functions for horizontal content rail discrete pagination and alignment.
 */

export function getRailScrollState(row: HTMLElement | null): { canScrollLeft: boolean; canScrollRight: boolean } {
  if (!row) return { canScrollLeft: false, canScrollRight: false };

  const cardElements = row.querySelectorAll<HTMLElement>('.tv-focus-target');
  const children = cardElements.length > 0
    ? Array.from(cardElements)
    : (Array.from(row.children) as HTMLElement[]);

  if (children.length === 0) return { canScrollLeft: false, canScrollRight: false };

  const style = window.getComputedStyle(row);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const availableWidth = row.clientWidth - paddingLeft - paddingRight;

  const firstChild = children[0];
  const secondChild = children[1];
  const stride = secondChild ? secondChild.offsetLeft - firstChild.offsetLeft : firstChild.offsetWidth;
  const gap = Math.max(0, stride - firstChild.offsetWidth);
  const cardsPerPage = Math.max(1, Math.floor((availableWidth + gap) / stride));
  const maxStartIndex = Math.max(0, children.length - cardsPerPage);

  const maxStrideScroll = maxStartIndex > 0 && children[maxStartIndex]
    ? children[maxStartIndex].offsetLeft - paddingLeft
    : Math.max(0, row.scrollWidth - row.clientWidth);

  return {
    canScrollLeft: row.scrollLeft > 10,
    canScrollRight: maxStrideScroll > 10 && row.scrollLeft < maxStrideScroll - 10
  };
}

export function scrollContentRail(row: HTMLElement | null, direction: 'left' | 'right'): void {
  if (!row) return;

  const cardElements = row.querySelectorAll<HTMLElement>('.tv-focus-target');
  const children = cardElements.length > 0
    ? Array.from(cardElements)
    : (Array.from(row.children) as HTMLElement[]);

  if (children.length === 0) return;

  const style = window.getComputedStyle(row);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const availableWidth = row.clientWidth - paddingLeft - paddingRight;

  const firstChild = children[0];
  const secondChild = children[1];
  const stride = secondChild ? secondChild.offsetLeft - firstChild.offsetLeft : firstChild.offsetWidth;
  const gap = Math.max(0, stride - firstChild.offsetWidth);
  const cardsPerPage = Math.max(1, Math.floor((availableWidth + gap) / stride));
  const maxStartIndex = Math.max(0, children.length - cardsPerPage);

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
  if (direction === 'right') {
    targetIndex = Math.min(maxStartIndex, currentIndex + cardsPerPage);
  } else {
    const prevPage = Math.floor((currentIndex - 1) / cardsPerPage) * cardsPerPage;
    targetIndex = Math.max(0, Math.min(currentIndex - cardsPerPage, prevPage));
  }

  const targetScrollLeft = targetIndex === 0
    ? 0
    : children[targetIndex].offsetLeft - paddingLeft;

  row.scrollTo({
    left: targetScrollLeft,
    behavior: 'smooth'
  });
}
