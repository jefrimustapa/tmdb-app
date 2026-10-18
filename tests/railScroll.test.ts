import assert from 'node:assert';
import { getRailLayout, getRailScrollState, scrollContentRail } from '../src/utils/railScroll';

// Helper to create a mocked DOM container and card elements
function createMockRail({
  cardCount,
  cardWidth,
  cardGap,
  paddingLeft = 32,
  paddingRight = 32,
  clientWidth = 1200,
  hasSpacer = true
}: {
  cardCount: number;
  cardWidth: number;
  cardGap: number;
  paddingLeft?: number;
  paddingRight?: number;
  clientWidth?: number;
  hasSpacer?: boolean;
}) {
  const cards: any[] = [];
  const stride = cardWidth + cardGap;

  for (let i = 0; i < cardCount; i++) {
    const offsetLeft = paddingLeft + i * stride;
    cards.push({
      classList: { contains: (cls: string) => cls === 'tv-focus-target' },
      offsetLeft,
      offsetWidth: cardWidth,
    });
  }

  const allChildren = [...cards];
  if (hasSpacer) {
    allChildren.push({
      classList: { contains: () => false },
      offsetLeft: paddingLeft + cardCount * stride,
      offsetWidth: clientWidth, // Trailing spacer div
    });
  }

  let scrollLeftVal = 0;

  const mockRow: any = {
    clientWidth,
    get scrollWidth() {
      const last = allChildren[allChildren.length - 1];
      return (last ? last.offsetLeft + last.offsetWidth : clientWidth) + paddingRight;
    },
    get scrollLeft() {
      return scrollLeftVal;
    },
    set scrollLeft(val: number) {
      scrollLeftVal = val;
    },
    children: allChildren,
    querySelectorAll: (selector: string) => {
      if (selector === '.tv-focus-target') return cards;
      return [];
    },
    scrollTo: ({ left }: { left: number; behavior?: string }) => {
      scrollLeftVal = left;
    }
  };

  // Mock global window and getComputedStyle
  (global as any).window = {
    getComputedStyle: () => ({
      paddingLeft: `${paddingLeft}px`,
      paddingRight: `${paddingRight}px`
    })
  };

  return { mockRow, cards, stride };
}

console.log('\n--- Content Rail Scroll & Layout Test Suite (Issue #213) ---');

// Test 1: Issue #213 Landscape Cards Scenario (Continue Watching)
// 8 cards of 176px width, 14px gap (stride = 190px), clientWidth = 1200px, padding = 32px
{
  const { mockRow, cards } = createMockRail({
    cardCount: 8,
    cardWidth: 176,
    cardGap: 14,
    clientWidth: 1200,
    paddingLeft: 32,
    paddingRight: 32,
  });

  const layout = getRailLayout(mockRow as any);
  assert(layout !== null, 'Layout should not be null');

  // Available width = 1200 - 32 - 32 = 1136px
  // 6 cards take 6 * 176 + 5 * 14 = 1056 + 70 = 1126px <= 1136px (fits!)
  // 7th card starts at 32 + 6 * 190 = 1172px, right edge = 1348px > 1168px (peeking/overflows)
  // Therefore columnsCount MUST be 6, NOT 7!
  assert.strictEqual(
    layout.columnsCount,
    6,
    `Expected columnsCount to be 6 (fully visible cards only), got ${layout.columnsCount}`
  );

  // maxStartIndex = 8 - 6 = 2
  assert.strictEqual(
    layout.maxStartIndex,
    2,
    `Expected maxStartIndex to be 2 so that cards 2..7 are visible on last page, got ${layout.maxStartIndex}`
  );

  // Scroll to the final page
  scrollContentRail(mockRow as any, 'right');
  assert.strictEqual(
    mockRow.scrollLeft,
    cards[layout.maxStartIndex].offsetLeft - 32,
    'Row should be scrolled to maxStartIndex offset'
  );

  // Verify the last card (index 7, "The Paper") is 100% inside the visible area
  const lastCard = cards[7];
  const lastCardVisibleRight = lastCard.offsetLeft + lastCard.offsetWidth - mockRow.scrollLeft;
  const containerVisibleRight = mockRow.clientWidth - 32; // clientWidth - paddingRight

  assert(
    lastCardVisibleRight <= containerVisibleRight,
    `Final card right edge (${lastCardVisibleRight}px) should be <= container visible right (${containerVisibleRight}px). Full card MUST be visible!`
  );

  // Scroll state should now show canScrollRight: false, canScrollLeft: true
  const state = getRailScrollState(mockRow as any);
  assert.strictEqual(state.canScrollRight, false, 'canScrollRight should be false on the last page');
  assert.strictEqual(state.canScrollLeft, true, 'canScrollLeft should be true when scrolled');

  console.log('  ✓ Issue #213: Continue Watching 8 landscape cards shows 100% full card on final page');
}

// Test 2: Peeking card is NOT counted in columnsCount
{
  // Available width = 1000px, 5 cards of 180px + 20px gap = 980px fits!
  // 6th card starts at 1000px, so 0px inside visible area
  const { mockRow } = createMockRail({
    cardCount: 7,
    cardWidth: 180,
    cardGap: 20,
    clientWidth: 1064,
    paddingLeft: 32,
    paddingRight: 32
  });

  const layout = getRailLayout(mockRow as any);
  assert.strictEqual(layout?.columnsCount, 5, 'Should count exactly 5 full columns');
  assert.strictEqual(layout?.maxStartIndex, 2, 'maxStartIndex for 7 cards with 5 columns should be 2');

  console.log('  ✓ Partially visible/peeking cards are not counted towards columnsCount');
}

// Test 3: All cards fit on screen (no scrolling needed)
{
  const { mockRow } = createMockRail({
    cardCount: 4,
    cardWidth: 176,
    cardGap: 14,
    clientWidth: 1200,
    paddingLeft: 32,
    paddingRight: 32,
    hasSpacer: true // Even with spacer div, it should NOT trigger phantom scroll buttons
  });

  const layout = getRailLayout(mockRow as any);
  assert.strictEqual(layout?.maxStartIndex, 0, 'maxStartIndex should be 0 when all cards fit');
  assert.strictEqual(layout?.maxStrideScroll, 0, 'maxStrideScroll should be 0 when all cards fit');

  const state = getRailScrollState(mockRow as any);
  assert.strictEqual(state.canScrollLeft, false, 'canScrollLeft should be false');
  assert.strictEqual(state.canScrollRight, false, 'canScrollRight should be false despite trailing spacer');

  console.log('  ✓ Trailing spacer element does not trigger phantom scroll buttons when all cards fit');
}

// Test 4: Multi-page forward and backward navigation
{
  const { mockRow, cards } = createMockRail({
    cardCount: 15,
    cardWidth: 140,
    cardGap: 14,
    clientWidth: 1000,
    paddingLeft: 32,
    paddingRight: 32
  });

  const layout = getRailLayout(mockRow as any);
  assert(layout !== null);

  // Available width = 1000 - 64 = 936px.
  // Stride = 154px. 6 cards = 6 * 140 + 5 * 14 = 910px <= 936px (6 cards fit).
  // columnsCount = 6, scrollStep = 5, maxStartIndex = 15 - 6 = 9.
  assert.strictEqual(layout.columnsCount, 6);
  assert.strictEqual(layout.scrollStep, 5);
  assert.strictEqual(layout.maxStartIndex, 9);

  // Page 1 -> Page 2
  scrollContentRail(mockRow as any, 'right');
  assert.strictEqual(mockRow.scrollLeft, cards[5].offsetLeft - 32);

  // Page 2 -> Page 3 (clamped to maxStartIndex = 9)
  scrollContentRail(mockRow as any, 'right');
  assert.strictEqual(mockRow.scrollLeft, cards[9].offsetLeft - 32);

  // Last card (index 14) is completely visible on Page 3
  const lastCard = cards[14];
  const lastCardRight = lastCard.offsetLeft + lastCard.offsetWidth - mockRow.scrollLeft;
  assert(lastCardRight <= mockRow.clientWidth - 32);

  // Page 3 -> Page 2 (backward navigation)
  scrollContentRail(mockRow as any, 'left');
  assert.strictEqual(mockRow.scrollLeft, cards[5].offsetLeft - 32);

  // Page 2 -> Page 1
  scrollContentRail(mockRow as any, 'left');
  assert.strictEqual(mockRow.scrollLeft, 0);

  console.log('  ✓ Multi-page forward and backward navigation step and clamp correctly');
}

console.log('\nAll railScroll tests passed!\n');
