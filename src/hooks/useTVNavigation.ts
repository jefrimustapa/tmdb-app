import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Spatial D-Pad navigation for Android TV remotes and keyboard arrow navigation
 */
const getScrollBehavior = (): ScrollBehavior => {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-perf-mode') === 'true') {
    return 'auto';
  }
  return 'smooth';
};

let lastFocusedContentEl: HTMLElement | null = null;

export function useTVNavigation(isEnabled = true) {
  const location = useLocation();

  // Set initial focus to main content viewport whenever route changes
  useEffect(() => {
    if (!isEnabled) return;

    const setInitialFocus = () => {
      lastFocusedContentEl = null;
      const pathname = location.pathname;
      const mainContent = document.querySelector('main');
      let target: HTMLElement | null = null;

      if (mainContent) {
        if (pathname.startsWith('/watch')) {
          // On Watch page: the ONLY way to move focus to header is by pressing Back on remote
          const iframe = document.querySelector<HTMLIFrameElement>('iframe');
          if (iframe) {
            try { iframe.focus(); } catch {}
          }
          return;
        } else if (pathname === '/') {
          // On Home page: focus the Billboard "Watch Now" button
          target = mainContent.querySelector<HTMLElement>('[data-hero-watch-now="true"]') ||
                   Array.from(mainContent.querySelectorAll<HTMLElement>('.tv-focus-target, a, button')).find(
                     el => el.textContent?.trim().toLowerCase().includes('watch now')
                   ) || mainContent.querySelector<HTMLElement>('.tv-focus-target');
        } else if (pathname === '/movies' || pathname === '/tv') {
          // On Movies or Series catalog page: focus "All Platforms" filter button
          target = Array.from(mainContent.querySelectorAll<HTMLElement>('button.tv-focus-target')).find(
            b => b.textContent?.trim().toLowerCase().includes('all platform')
          ) || mainContent.querySelector<HTMLElement>('.tv-focus-target');
        } else if (pathname === '/library') {
          // On My Space (Library): focus Watch History tab button
          target = Array.from(mainContent.querySelectorAll<HTMLElement>('button.tv-focus-target')).find(
            b => b.textContent?.trim().toLowerCase().includes('watch history')
          ) || mainContent.querySelector<HTMLElement>('.tv-focus-target');
        } else if (pathname === '/settings') {
          // On Settings page: focus the very first interactive button in the page
          target = mainContent.querySelector<HTMLElement>('.tv-focus-target, button');
        } else if (pathname.startsWith('/details')) {
          // On Details page: focus Watch Now primary button or the Back button
          target = mainContent.querySelector<HTMLElement>('[data-details-primary="true"]') ||
                   mainContent.querySelector<HTMLElement>('.tv-focus-target, a, button');
        } else {
          // General default: first tv-focus-target inside main content
          target = mainContent.querySelector<HTMLElement>('.tv-focus-target, button, a[href]');
        }
      }

      if (!target) {
        target = document.querySelector<HTMLElement>('main .tv-focus-target') || document.querySelector<HTMLElement>('.tv-focus-target');
      }

      if (target) {
        target.focus();
        target.scrollIntoView({ behavior: getScrollBehavior(), block: 'nearest', inline: 'center' });
      }
    };

    const timer1 = setTimeout(setInitialFocus, 100);
    const timer2 = setTimeout(setInitialFocus, 400);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isEnabled, location.pathname]);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // On Watch page (/watch), handle header navigation
      if (window.location.pathname.startsWith('/watch')) {
        const header = document.querySelector('[data-watch-header="true"]');

        // Handle Back/Escape keys on Watch page (regardless of whether focus is in header or iframe)
        if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 4 || e.key === 'BrowserBack' || e.key === 'GoBack') {
          e.preventDefault();
          const openDropdown = header?.querySelector('[data-provider-dropdown-open="true"]');
          if (openDropdown) {
            window.dispatchEvent(new CustomEvent('tmdb_close_dropdowns'));
            const trigger = header?.querySelector<HTMLElement>('[data-provider-trigger="true"]');
            if (trigger) { trigger.focus(); }
            return;
          }
          const isHeaderFocused = !!(window as any).__tmdbHeaderFocused || (header && header.contains(document.activeElement));
          const backBtn = header?.querySelector<HTMLElement>('button[aria-label="Back"], [data-watch-header-item="true"]');
          if (!isHeaderFocused) {
            (window as any).__tmdbHeaderFocused = true;
            window.dispatchEvent(new CustomEvent('tmdb_user_action'));
            window.focus();
            if (backBtn) { backBtn.focus(); }
            setTimeout(() => { if (backBtn) { backBtn.focus(); } }, 50);
            return;
          }
          (window as any).__tmdbHeaderFocused = false;
          if (typeof (window as any).tmdbExitWatch === 'function') {
            (window as any).tmdbExitWatch();
          } else {
            window.dispatchEvent(new CustomEvent('tmdb_exit_watch'));
            if (backBtn && typeof backBtn.click === 'function') {
              backBtn.click();
            }
          }
          return;
        }

        const isHeaderFocused = !!(window as any).__tmdbHeaderFocused || (header && header.contains(document.activeElement));

        // If not in header, allow default behavior (iframe / player control)
        if (!isHeaderFocused) {
          return;
        }

        // Check if provider dropdown is currently open
        const openDropdown = header?.querySelector('[data-provider-dropdown-open="true"]');
        if (openDropdown) {
          const dropdownOptions = Array.from(openDropdown.querySelectorAll<HTMLElement>('.tv-focus-target, button'))
            .filter(el => {
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && !el.hasAttribute('disabled') && (rect.width > 0 || rect.height > 0);
            });

          if (dropdownOptions.length > 0) {
            const currentIdx = dropdownOptions.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown' || e.keyCode === 20) {
              e.preventDefault();
              const nextIdx = (currentIdx + 1) % dropdownOptions.length;
              dropdownOptions[nextIdx].focus();
              dropdownOptions[nextIdx].scrollIntoView({ block: 'nearest' });
              return;
            } else if (e.key === 'ArrowUp' || e.keyCode === 19) {
              e.preventDefault();
              const prevIdx = (currentIdx - 1 + dropdownOptions.length) % dropdownOptions.length;
              dropdownOptions[prevIdx].focus();
              dropdownOptions[prevIdx].scrollIntoView({ block: 'nearest' });
              return;
            }
          }
        }

        // If dropdown is NOT open and user presses ArrowDown, return focus down to player iframe
        if (!openDropdown && (e.key === 'ArrowDown' || e.keyCode === 20)) {
          e.preventDefault();
          (window as any).__tmdbHeaderFocused = false;
          if (document.activeElement && typeof (document.activeElement as HTMLElement).blur === 'function') {
            (document.activeElement as HTMLElement).blur();
          }
          const iframe = document.querySelector<HTMLIFrameElement>('iframe');
          if (iframe) {
            try {
              iframe.focus();
            } catch {}
          }
          return;
        }

        // When dropdown is closed, navigate horizontally between header elements (Back Button <-> Provider Picker Trigger)
        const headerFocusables = header ? Array.from(header.querySelectorAll<HTMLElement>('[data-watch-header-item="true"], .tv-focus-target, button'))
          .filter(el => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && !el.hasAttribute('disabled') && (rect.width > 0 || rect.height > 0);
          }) : [];

        if (headerFocusables.length > 1) {
          const currentIdx = headerFocusables.indexOf(document.activeElement as HTMLElement);
          if (e.key === 'ArrowRight' || e.keyCode === 22) {
            e.preventDefault();
            const nextIdx = (currentIdx + 1) % headerFocusables.length;
            headerFocusables[nextIdx].focus();
            return;
          } else if (e.key === 'ArrowLeft' || e.keyCode === 21) {
            e.preventDefault();
            const prevIdx = (currentIdx - 1 + headerFocusables.length) % headerFocusables.length;
            headerFocusables[prevIdx].focus();
            return;
          }
        }
      }

      // Fast-path D-Pad key-repeat throttling during rapid hold
      const now = performance.now();
      if (e.repeat && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (now - (window as any).__tmdbLastNavTime < 65) {
          e.preventDefault();
          return;
        }
      }
      (window as any).__tmdbLastNavTime = now;

      // In TV mode, all intended spatial focus items are explicitly tagged with .tv-focus-target
      const focusableSelectors = '.tv-focus-target';

      // Fast-path visibility filter: eliminates expensive getComputedStyle reflows
      const focusableElements = Array.from(
        document.querySelectorAll<HTMLElement>(focusableSelectors)
      ).filter(el => {
        return el.offsetParent !== null && 
               !el.hasAttribute('disabled') &&
               el.getAttribute('aria-hidden') !== 'true';
      });

      if (focusableElements.length === 0) return;

      const currentFocused = (document.activeElement && document.activeElement !== document.body)
        ? (document.activeElement as HTMLElement)
        : null;
      let currentIndex = currentFocused ? focusableElements.indexOf(currentFocused) : -1;

      // If nothing is focused yet, focus the first item on any arrow key
      if (!currentFocused || currentIndex === -1) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const mainContent = document.querySelector('main');
          const firstTarget = mainContent?.querySelector<HTMLElement>('.tv-focus-target') || focusableElements[0];
          firstTarget?.focus();
          return;
        }
        return;
      }

      const currentRect = currentFocused.getBoundingClientRect();

      let nextElement: HTMLElement | null = null;
      let minDistance = Infinity;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Trap navigation inside active modal dialog if present
        const activeModal = document.querySelector<HTMLElement>('[data-modal-container="true"], [role="dialog"]');
        if (activeModal && (activeModal.contains(currentFocused) || currentFocused === document.body)) {
          const modalCloseBtn = activeModal.querySelector<HTMLElement>('[data-modal-close="true"]');
          const modalScrollBox = activeModal.querySelector<HTMLElement>('[data-modal-scroll="true"]');
          const modalInstallBtn = activeModal.querySelector<HTMLElement>('[data-modal-install="true"]');
          const modalLaterBtn = activeModal.querySelector<HTMLElement>('[data-modal-later="true"]');

          const isClose = currentFocused === modalCloseBtn;
          const isScroll = currentFocused === modalScrollBox;
          const isInstall = currentFocused === modalInstallBtn;
          const isLater = currentFocused === modalLaterBtn;

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (isClose) {
              if (modalScrollBox) modalScrollBox.focus();
              else if (modalInstallBtn && !modalInstallBtn.hasAttribute('disabled')) modalInstallBtn.focus();
              else if (modalLaterBtn) modalLaterBtn.focus();
            } else if (isScroll) {
              if (modalInstallBtn && !modalInstallBtn.hasAttribute('disabled')) {
                modalInstallBtn.focus();
              } else if (modalLaterBtn) {
                modalLaterBtn.focus();
              }
            }
            return;
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (isInstall || isLater) {
              if (modalScrollBox) modalScrollBox.focus();
              else if (modalCloseBtn) modalCloseBtn.focus();
            } else if (isScroll) {
              if (modalCloseBtn) modalCloseBtn.focus();
            }
            return;
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (isInstall && modalLaterBtn) {
              modalLaterBtn.focus();
            }
            return;
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (isLater && modalInstallBtn && !modalInstallBtn.hasAttribute('disabled')) {
              modalInstallBtn.focus();
            }
            return;
          }
        }

        const isCurrentInNav = currentFocused.closest('aside') !== null || currentFocused.getAttribute('data-tv-nav') === 'true';

        // Separate elements into main page content vs sidebar/nav elements
        const pageElements: HTMLElement[] = [];
        const navElements: HTMLElement[] = [];

        for (const el of focusableElements) {
          if (el.closest('aside') !== null || el.getAttribute('data-tv-nav') === 'true') {
            navElements.push(el);
          } else {
            pageElements.push(el);
          }
        }

        // Candidate filtering rules:
        let candidateElements = focusableElements.filter(el => el !== currentFocused);

        // Dedicated Hero Billboard Navigation (Full-Width Sliding Rail)
        const heroBtn = currentFocused.closest('[data-hero-btn]');
        if (heroBtn) {
          const btnType = heroBtn.getAttribute('data-hero-btn'); // 'play' | 'details'
          const currentSlideIdx = parseInt(heroBtn.getAttribute('data-hero-index') || '0', 10);
          const heroBanner = document.querySelector('[data-hero-banner="true"]');
          const totalSlides = parseInt(heroBanner?.getAttribute('data-total-slides') || '1', 10);

          if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (currentSlideIdx + 1 < totalSlides) {
              window.dispatchEvent(new CustomEvent('tmdb_hero_slide_change', {
                detail: { index: currentSlideIdx + 1, btnType }
              }));
            }
            return;
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (currentSlideIdx > 0) {
              window.dispatchEvent(new CustomEvent('tmdb_hero_slide_change', {
                detail: { index: currentSlideIdx - 1, btnType }
              }));
            } else {
              // At leftmost slide (Card 0): move focus to navbar / sidebar
              const navActive = document.querySelector<HTMLElement>('aside .tv-focus-target, [data-tv-nav="true"]');
              navActive?.focus({ preventScroll: true });
            }
            return;
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (btnType === 'play') {
              const detailsBtn = heroBanner?.querySelector<HTMLElement>(
                `[data-hero-btn="details"][data-hero-index="${currentSlideIdx}"]`
              );
              detailsBtn?.focus({ preventScroll: true });
            } else {
              // From details: move down to first card of next section (Continue watching / Trending now)
              const firstRail = document.querySelector('[data-content-rail="true"]');
              const firstCard = firstRail?.querySelector<HTMLElement>('.tv-focus-target');
              if (firstCard) {
                firstCard.focus({ preventScroll: true });
                firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
            return;
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (btnType === 'details') {
              const playBtn = heroBanner?.querySelector<HTMLElement>(
                `[data-hero-btn="play"][data-hero-index="${currentSlideIdx}"]`
              );
              playBtn?.focus({ preventScroll: true });
            }
            return;
          }
        }

        if (isCurrentInNav && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          // Linear navigation inside Sidebar
          const allNav = Array.from(document.querySelectorAll<HTMLElement>('aside .tv-focus-target, [data-tv-nav="true"]'))
            .filter(el => el.offsetParent !== null && !el.hasAttribute('disabled'));
          const currNavIdx = allNav.indexOf(currentFocused);
          if (currNavIdx !== -1) {
            e.preventDefault();
            if (e.key === 'ArrowDown') {
              const nextNav = allNav[Math.min(allNav.length - 1, currNavIdx + 1)];
              nextNav?.focus();
            } else {
              const prevNav = allNav[Math.max(0, currNavIdx - 1)];
              prevNav?.focus();
            }
            return;
          }
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // In main content canvas, UP/DOWN stays strictly inside main content canvas
          candidateElements = pageElements;
        } else if (e.key === 'ArrowRight') {
          if (isCurrentInNav) {
            // HBO Max Memory Anchor (Item 4): restore focus to exact last-focused card
            if (lastFocusedContentEl && document.body.contains(lastFocusedContentEl) && lastFocusedContentEl.offsetParent !== null) {
              e.preventDefault();
              lastFocusedContentEl.focus();
              lastFocusedContentEl.scrollIntoView({ behavior: e.repeat ? 'auto' : getScrollBehavior(), block: 'nearest', inline: 'nearest' });
              return;
            }

            // Fallback: Directly focus the most appropriate page element (closest Y or first in main)
            const mainContent = document.querySelector('main');
            const mainPageElements = pageElements.filter(el => mainContent?.contains(el));
            let bestTarget = mainPageElements[0] || pageElements[0];
            let bestYDist = Infinity;
            for (const el of mainPageElements) {
              const r = el.getBoundingClientRect();
              const yDist = Math.abs((r.top + r.height / 2) - (currentRect.top + currentRect.height / 2));
              if (yDist < bestYDist) {
                bestYDist = yDist;
                bestTarget = el;
              }
            }
            if (bestTarget) {
              e.preventDefault();
              bestTarget.focus();
              bestTarget.scrollIntoView({ behavior: e.repeat ? 'auto' : getScrollBehavior(), block: 'nearest', inline: 'center' });
              return;
            }
          } else {
            // In content viewport: if currently in a horizontal row/container, check for sibling items
            const currentRow = currentFocused.parentElement;
            const isInsideRail = currentFocused.closest('[data-content-rail="true"]') !== null || 
                                currentRow?.classList.contains('overflow-x-auto');
            if (currentRow && isInsideRail) {
              const rowSiblings = Array.from(currentRow.children) as HTMLElement[];
              const currentIdx = rowSiblings.indexOf(currentFocused);
              if (currentIdx >= 0 && currentIdx + 1 < rowSiblings.length) {
                const nextSibling = rowSiblings[currentIdx + 1];
                if (nextSibling) {
                  const targetToFocus = nextSibling.classList.contains('tv-focus-target')
                    ? nextSibling
                    : nextSibling.querySelector<HTMLElement>('.tv-focus-target');
                  
                  if (targetToFocus) {
                    e.preventDefault();
                    targetToFocus.focus();

                    // Smart edge viewport rail scrolling
                    const rail = targetToFocus.closest('[data-content-rail="true"]');
                    const scrollContainer = rail?.querySelector<HTMLElement>('.overflow-x-auto') || 
                                            (currentRow?.classList.contains('overflow-x-auto') ? currentRow : null);

                    if (scrollContainer) {
                      const containerRect = scrollContainer.getBoundingClientRect();
                      const cardRect = targetToFocus.getBoundingClientRect();

                      if (cardRect.right > containerRect.right - 24) {
                        const scrollDelta = cardRect.right - containerRect.right + 48;
                        scrollContainer.scrollBy({
                          left: scrollDelta,
                          behavior: e.repeat ? 'auto' : getScrollBehavior()
                        });
                      } else if (cardRect.left < containerRect.left + 24) {
                        const scrollDelta = cardRect.left - containerRect.left - 24;
                        scrollContainer.scrollBy({
                          left: scrollDelta,
                          behavior: e.repeat ? 'auto' : getScrollBehavior()
                        });
                      }
                    } else {
                      targetToFocus.scrollIntoView({ behavior: e.repeat ? 'auto' : getScrollBehavior(), block: 'nearest', inline: 'nearest' });
                    }
                    return;
                  }
                }
              }

              // At the end of the row (last card): hard boundary lock (never jump to other sections)
              e.preventDefault();
              return;
            }
          }
        } else if (e.key === 'ArrowLeft') {
          // If in sidebar, stay in sidebar
          if (isCurrentInNav) {
            candidateElements = navElements;
          } else {
            // In content viewport: check previous sibling in horizontal row first
            const currentRow = currentFocused.parentElement;
            const isInsideRail = currentFocused.closest('[data-content-rail="true"]') !== null || 
                                currentRow?.classList.contains('overflow-x-auto');
            if (currentRow && isInsideRail) {
              const rowSiblings = Array.from(currentRow.children) as HTMLElement[];
              const currentIdx = rowSiblings.indexOf(currentFocused);
              if (currentIdx > 0) {
                const prevSibling = rowSiblings[currentIdx - 1];
                if (prevSibling) {
                  const targetToFocus = prevSibling.classList.contains('tv-focus-target')
                    ? prevSibling
                    : prevSibling.querySelector<HTMLElement>('.tv-focus-target');
                  
                  if (targetToFocus) {
                    e.preventDefault();
                    targetToFocus.focus();

                    // Smart edge viewport rail scrolling
                    const rail = targetToFocus.closest('[data-content-rail="true"]');
                    const scrollContainer = rail?.querySelector<HTMLElement>('.overflow-x-auto') || 
                                            (currentRow?.classList.contains('overflow-x-auto') ? currentRow : null);

                    if (scrollContainer) {
                      const prevCardIdx = rowSiblings.indexOf(prevSibling);
                      if (prevCardIdx === 0) {
                        scrollContainer.scrollTo({
                          left: 0,
                          behavior: e.repeat ? 'auto' : getScrollBehavior()
                        });
                      } else {
                        const containerRect = scrollContainer.getBoundingClientRect();
                        const cardRect = targetToFocus.getBoundingClientRect();
                        if (cardRect.left < containerRect.left + 24) {
                          const scrollDelta = cardRect.left - containerRect.left - 48;
                          scrollContainer.scrollBy({
                            left: scrollDelta,
                            behavior: e.repeat ? 'auto' : getScrollBehavior()
                          });
                        }
                      }
                    } else {
                      targetToFocus.scrollIntoView({ behavior: e.repeat ? 'auto' : getScrollBehavior(), block: 'nearest', inline: 'nearest' });
                    }
                    return;
                  }
                }
              }

              // During rapid hold (fast scroll), stop cleanly at Card #1 without jumping into sidebar accidentally
              if (e.repeat) {
                e.preventDefault();
                return;
              }
            }

            // For leftmost card/content element (Item 1): save to Memory Anchor (Item 4) & jump to Active Route (Item 2)
            const hasLeftPageCandidates = pageElements.some(el => {
              const r = el.getBoundingClientRect();
              return r.right <= currentRect.left + 20 && r.left < currentRect.left - 10;
            });

            if (hasLeftPageCandidates) {
              candidateElements = pageElements;
            } else {
              // Item 4: Save memory anchor
              lastFocusedContentEl = currentFocused;

              // Item 2: Focus active route link in navbar dynamically
              const currentPath = window.location.pathname;
              const activeNav = document.querySelector<HTMLElement>('aside a[data-active-route="true"]') ||
                                document.querySelector<HTMLElement>('aside a.active, nav a.active') ||
                                document.querySelector<HTMLElement>(`aside a[data-nav-path="${currentPath}"]`) ||
                                document.querySelector<HTMLElement>(`aside a[href="${currentPath}"]`) ||
                                navElements[0];
              if (activeNav) {
                e.preventDefault();
                activeNav.focus();
                activeNav.scrollIntoView({ behavior: e.repeat ? 'auto' : getScrollBehavior(), block: 'nearest', inline: 'center' });
                return;
              }
            }
          }
        }

        for (const el of candidateElements) {
          const rect = el.getBoundingClientRect();

          let isValid = false;
          let dist = 0;

          if (e.key === 'ArrowRight' && rect.left >= currentRect.left + 10) {
            isValid = true;
            // Primary X distance + heavily weighted Y penalty to prevent vertical jumping
            const dx = Math.max(0, rect.left - currentRect.right);
            const dy = Math.abs(rect.top - currentRect.top);
            dist = dx + dy * 3.0;
          } else if (e.key === 'ArrowLeft' && rect.right <= currentRect.right - 10) {
            isValid = true;
            const dx = Math.max(0, currentRect.left - rect.right);
            const dy = Math.abs(rect.top - currentRect.top);
            dist = dx + dy * 3.0;
          } else if (e.key === 'ArrowDown' && rect.top >= currentRect.bottom - 20 && rect.bottom > currentRect.bottom + 10) {
            isValid = true;
            const dy = Math.max(0, rect.top - currentRect.bottom);
            const horizontalDistance = Math.abs(
              (rect.left + rect.width / 2) - (currentRect.left + currentRect.width / 2)
            );
            dist = dy + horizontalDistance * 0.3;
          } else if (e.key === 'ArrowUp' && rect.bottom <= currentRect.top + 20 && rect.top < currentRect.top - 10) {
            isValid = true;
            const dy = Math.max(0, currentRect.top - rect.bottom);
            const horizontalDistance = Math.abs(
              (rect.left + rect.width / 2) - (currentRect.left + currentRect.width / 2)
            );
            dist = dy + horizontalDistance * 0.3;
          }

          if (isValid && dist < minDistance) {
            minDistance = dist;
            nextElement = el;
          }
        }

        // Special fallback when moving ArrowUp from top row of catalog / grid cards to filter buttons or Hero Billboard
        if (e.key === 'ArrowUp' && !nextElement && !isCurrentInNav) {
          const heroBanner = document.querySelector('[data-hero-banner="true"]');
          if (heroBanner) {
            const activeDetailsBtn = heroBanner.querySelector<HTMLElement>('[data-hero-btn="details"][tabindex="0"]') ||
                                    heroBanner.querySelector<HTMLElement>('[data-hero-btn="details"]');
            if (activeDetailsBtn) {
              nextElement = activeDetailsBtn;
            }
          }

          if (!nextElement) {
            const filterSections = document.querySelectorAll<HTMLElement>('[data-tv-filter-section="true"]');
            if (filterSections.length > 0) {
              const filterButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tv-filter-section="true"] .tv-focus-target'))
                .filter(el => el.offsetParent !== null && !el.hasAttribute('disabled'));
              if (filterButtons.length > 0) {
                let bestFilter = filterButtons[0];
                let bestXDist = Infinity;
                for (const fb of filterButtons) {
                  const r = fb.getBoundingClientRect();
                  const xDist = Math.abs((r.left + r.width / 2) - (currentRect.left + currentRect.width / 2));
                  if (xDist < bestXDist) {
                    bestXDist = xDist;
                    bestFilter = fb;
                  }
                }
                nextElement = bestFilter;
              }
            }
          }
        }

        if (nextElement) {
          e.preventDefault();
          nextElement.focus({ preventScroll: true });
          
          // If the focused element is within the Hero Billboard or Filter Section in Movies/Series, scroll immediately to top
          if (nextElement.closest('[data-hero-banner="true"]') !== null || nextElement.closest('[data-tv-filter-section="true"]') !== null) {
            window.scrollTo({ top: 0, left: 0, behavior: getScrollBehavior() });
            nextElement.scrollIntoView({ behavior: e.repeat ? 'auto' : getScrollBehavior(), block: 'nearest', inline: 'nearest' });
          } else {
            nextElement.scrollIntoView({ behavior: e.repeat ? 'auto' : getScrollBehavior(), block: 'center', inline: 'nearest' });
            setTimeout(() => {
              const r = nextElement?.getBoundingClientRect();
              if (r && r.bottom > window.innerHeight - 80) {
                window.scrollBy({ top: r.bottom - window.innerHeight + 140, behavior: getScrollBehavior() });
              }
            }, 50);
          }
        } else {
          // Boundary reached (e.g. at the bottom of the page or end of a row)
          e.preventDefault();
          currentFocused.focus({ preventScroll: true });
        }
      } else if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 23 || e.keyCode === 66) {
        // TV D-Pad Center / OK button
        if (e.repeat) {
          // If held down (repeating), trigger long press context menu
          if (currentFocused) {
            e.preventDefault();
            currentFocused.dispatchEvent(new CustomEvent('tv_long_press', { bubbles: true }));
          }
        } else {
          // Trigger click on the focused button / link if Enter is pressed
          if (currentFocused && typeof currentFocused.click === 'function') {
            e.preventDefault();
            currentFocused.click();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEnabled]);
}
