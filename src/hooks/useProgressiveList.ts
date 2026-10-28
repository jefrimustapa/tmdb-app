import { useEffect, useRef, useState } from 'react';

export const PROGRESSIVE_PAGE_SIZE = 24;

/** How many items to show after the sentinel scrolls into view. */
export function nextVisibleCount(current: number, total: number, pageSize = PROGRESSIVE_PAGE_SIZE): number {
  return Math.min(total, current + pageSize);
}

/**
 * Renders a long list in pages: the first page up front, then one more page each
 * time the sentinel element (placed after the list) comes within 400px of the viewport.
 * The count resets to the first page when `resetKey` changes.
 */
export function useProgressiveList<T>(items: T[], resetKey: unknown, pageSize = PROGRESSIVE_PAGE_SIZE) {
  const [count, setCount] = useState(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const total = items.length;
  const hasMore = count < total;

  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setCount((c) => nextVisibleCount(c, total, pageSize));
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, count, total, pageSize]);

  return { visible: items.slice(0, count), hasMore, sentinelRef };
}
