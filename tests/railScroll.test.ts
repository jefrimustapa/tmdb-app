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
    getBoundingClientRect: () => ({
      left: 0,
      right: clientWidth,
      width: clientWidth,
      top: 0,
      bottom: 300,
      height: 300
    }),
    scrollTo: ({ left }: { left: number; behavior?: string }) => {
      scrollLeftVal = left;
    }
  };

  cards.forEach(card => {
    card.getBoundingClientRect = () => ({
      left: card.offsetLeft - scrollLeftVal,
      right: card.offsetLeft + card.offsetWidth - scrollLeftVal,
      width: card.offsetWidth,
      top: 0,
      bottom: 300,
      height: 300
    });
  });

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

// Test 1: Issue #213 Continue Watching 7 landscape cards scenario
{
  const { mockRow, cards } = createMockRail({
    cardCount: 7,
    cardWidth: 176,
    cardGap: 14,
    clientWidth: 1280,
    paddingLeft: 32,
    paddingRight: 32,
  });

  const layout = getRailLayout(mockRow as any);
  assert(layout !== null, 'Layout should not be null');

  // Available width = 1280 - 32 - 32 = 1216px
  // 7 cards take 7 * 176 + 6 * 14 = 1232 + 84 = 1316px > 1216px (overflows by 100px)
  // columnsCount is 7, but because last card overflows, it should enable scrolling to endBoundScroll = 100
  assert.strictEqual(layout.maxStrideScroll, 100);

  const stateInitial = getRailScrollState(mockRow as any);
  assert.strictEqual(stateInitial.canScrollLeft, false);
  assert.strictEqual(stateInitial.canScrollRight, true);

  // Scroll to final page
  scrollContentRail(mockRow as any, 'right');
  assert.strictEqual(mockRow.scrollLeft, 100);

  // Verify the last card (index 6, "Tenzing") is flush against the right container padding
  const lastCard = cards[6];
  const lastCardVisibleRight = lastCard.offsetLeft + lastCard.offsetWidth - mockRow.scrollLeft;
  const containerVisibleRight = mockRow.clientWidth - 32;

  assert.strictEqual(
    lastCardVisibleRight,
    containerVisibleRight,
    `Final card right edge (${lastCardVisibleRight}px) should equal container visible right (${containerVisibleRight}px)!`
  );

  const stateFinal = getRailScrollState(mockRow as any);
  assert.strictEqual(stateFinal.canScrollRight, false, 'canScrollRight should be false on the last page');
  assert.strictEqual(stateFinal.canScrollLeft, true, 'canScrollLeft should be true when scrolled');

  // Scroll back to page 1
  scrollContentRail(mockRow as any, 'left');
  assert.strictEqual(mockRow.scrollLeft, 0);

  console.log('  ✓ Issue #213: Continue Watching 7 landscape cards bounds last card flush against right boundary');
}

// Test 2: Issue #213 Continue Watching 8 landscape cards scenario
{
  const { mockRow, cards } = createMockRail({
    cardCount: 8,
    cardWidth: 176,
    cardGap: 14,
    clientWidth: 1280,
    paddingLeft: 32,
    paddingRight: 32,
  });

  const layout = getRailLayout(mockRow as any);
  assert(layout !== null);
  assert.strictEqual(layout.maxStrideScroll, 290);

  scrollContentRail(mockRow as any, 'right');
  assert.strictEqual(mockRow.scrollLeft, 290);

  const lastCard = cards[7];
  const lastCardVisibleRight = lastCard.offsetLeft + lastCard.offsetWidth - mockRow.scrollLeft;
  assert.strictEqual(lastCardVisibleRight, 1280 - 32);

  console.log('  ✓ Issue #213: Continue Watching 8 landscape cards bounds last card flush against right boundary');
}

// Test 3: Trending Now (20 portrait cards) preserves discrete column alignment
{
  const { mockRow, cards } = createMockRail({
    cardCount: 20,
    cardWidth: 144,
    cardGap: 14,
    clientWidth: 1280,
    paddingLeft: 32,
    paddingRight: 32,
  });

  const layout = getRailLayout(mockRow as any);
  assert(layout !== null);
  assert.strictEqual(layout.columnsCount, 8);
  assert.strictEqual(layout.scrollStep, 7);
  assert.strictEqual(layout.maxStartIndex, 12);
  // Preserves original discrete stride calculation (1896)
  assert.strictEqual(layout.maxStrideScroll, 1896);

  // Page 1 -> Page 2
  scrollContentRail(mockRow as any, 'right');
  assert.strictEqual(mockRow.scrollLeft, cards[7].offsetLeft - 32);

  // Page 2 -> Page 3 (final page)
  scrollContentRail(mockRow as any, 'right');
  assert.strictEqual(mockRow.scrollLeft, 1896);

  // Card 12 ("VisionQuest") is aligned with left padding (32px)
  assert.strictEqual(cards[12].offsetLeft - mockRow.scrollLeft, 32);

  // Page 3 -> Page 2
  scrollContentRail(mockRow as any, 'left');
  assert.strictEqual(mockRow.scrollLeft, cards[7].offsetLeft - 32);

  // Page 2 -> Page 1
  scrollContentRail(mockRow as any, 'left');
  assert.strictEqual(mockRow.scrollLeft, 0);

  console.log('  ✓ Trending Now preserves discrete column alignment and multi-page stepping');
}

// Test 4: All cards fit on screen (no scrolling needed)
{
  const { mockRow } = createMockRail({
    cardCount: 4,
    cardWidth: 176,
    cardGap: 14,
    clientWidth: 1280,
    paddingLeft: 32,
    paddingRight: 32,
    hasSpacer: true
  });

  const layout = getRailLayout(mockRow as any);
  assert.strictEqual(layout?.maxStrideScroll, 0, 'maxStrideScroll should be 0 when all cards fit');

  const state = getRailScrollState(mockRow as any);
  assert.strictEqual(state.canScrollLeft, false, 'canScrollLeft should be false');
  assert.strictEqual(state.canScrollRight, false, 'canScrollRight should be false despite trailing spacer');

  console.log('  ✓ Trailing spacer element does not trigger phantom scroll buttons when all cards fit');
}

console.log('\nAll railScroll tests passed!\n');
