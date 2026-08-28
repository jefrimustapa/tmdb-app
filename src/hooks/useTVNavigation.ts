import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Spatial D-Pad navigation for Android TV remotes and keyboard arrow navigation
 */
export function useTVNavigation(isEnabled = true) {
  const location = useLocation();

  // Set initial focus to main content viewport whenever route changes
  useEffect(() => {
    if (!isEnabled) return;

    const setInitialFocus = () => {
      const pathname = location.pathname;
      const mainContent = document.querySelector('main');
      let target: HTMLElement | null = null;

      if (mainContent) {
        if (pathname === '/') {
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
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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
        const isHeaderFocused = header && header.contains(document.activeElement);

        // If not in header and user presses ArrowUp, move focus to header and reveal it
        if (!isHeaderFocused) {
          if (e.key === 'ArrowUp' || e.keyCode === 19) {
            e.preventDefault();
            const firstHeaderItem = header?.querySelector<HTMLElement>('[data-watch-header-item="true"], .tv-focus-target');
            if (firstHeaderItem) {
              firstHeaderItem.focus();
              return;
            }
          }
          return;
        }

        // Check if provider dropdown is currently open
        const openDropdown = header.querySelector('[data-provider-dropdown-open="true"]');
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
          const iframe = document.querySelector<HTMLIFrameElement>('iframe');
          if (iframe) {
            try {
              iframe.focus();
            } catch {}
          }
          return;
        }

        // Handle Back/Escape keys on Watch page
        if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 4 || e.key === 'BrowserBack' || e.key === 'GoBack') {
          e.preventDefault();
          if (openDropdown) {
            window.dispatchEvent(new CustomEvent('tmdb_close_dropdowns'));
            const trigger = header?.querySelector<HTMLElement>('[data-provider-trigger="true"]');
            if (trigger) { trigger.focus(); }
            return;
          }
          const backBtn = header?.querySelector<HTMLElement>('button[aria-label="Back"], [data-watch-header-item="true"]');
          if (backBtn && typeof backBtn.click === 'function') {
            backBtn.click();
          } else {
            window.history.back();
          }
          return;
        }

        // When dropdown is closed, navigate horizontally between header elements (Back Button <-> Provider Picker Trigger)
        const headerFocusables = Array.from(header.querySelectorAll<HTMLElement>('[data-watch-header-item="true"], .tv-focus-target, button'))
          .filter(el => {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && !el.hasAttribute('disabled') && (rect.width > 0 || rect.height > 0);
          });

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

      // In TV mode, all intended spatial focus items are explicitly tagged with .tv-focus-target
      const focusableSelectors = '.tv-focus-target';

      const focusableElements = Array.from(
        document.querySelectorAll<HTMLElement>(focusableSelectors)
      ).filter(el => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               !el.hasAttribute('disabled') &&
               (rect.width > 0 || rect.height > 0);
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

        if (isCurrentInNav && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          // Linear navigation inside Sidebar
          const allNav = Array.from(document.querySelectorAll<HTMLElement>('aside .tv-focus-target, [data-tv-nav="true"]'))
            .filter(el => {
              const style = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              return style.display !== 'none' && style.visibility !== 'hidden' && (rect.width > 0 || rect.height > 0);
            });
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
            // Directly focus the most appropriate page element (closest Y or first in main)
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
              bestTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              return;
            }
          } else {
            // In content viewport: if currently in a horizontal row/container, check for sibling items
            const currentRow = currentFocused.parentElement;
            if (currentRow) {
              const rowSiblings = Array.from(currentRow.children) as HTMLElement[];
              const currentIdx = rowSiblings.indexOf(currentFocused);
              if (currentIdx >= 0 && currentIdx + 1 < rowSiblings.length) {
                const nextSibling = rowSiblings[currentIdx + 1];
                if (nextSibling) {
                  const targetToFocus = nextSibling.classList.contains('tv-focus-target')
                    ? nextSibling
                    : nextSibling.querySelector<HTMLElement>('.tv-focus-target') || nextSibling;
                  
                  e.preventDefault();
                  targetToFocus.focus();
                  targetToFocus.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                  return;
                }
              }
            }
          }
        } else if (e.key === 'ArrowLeft') {
          // If in sidebar, stay in sidebar
          if (isCurrentInNav) {
            candidateElements = navElements;
          } else {
            // In content viewport: check previous sibling in horizontal row first
            const currentRow = currentFocused.parentElement;
            if (currentRow) {
              const rowSiblings = Array.from(currentRow.children) as HTMLElement[];
              const currentIdx = rowSiblings.indexOf(currentFocused);
              if (currentIdx > 0) {
                const prevSibling = rowSiblings[currentIdx - 1];
                if (prevSibling) {
                  const targetToFocus = prevSibling.classList.contains('tv-focus-target')
                    ? prevSibling
                    : prevSibling.querySelector<HTMLElement>('.tv-focus-target') || prevSibling;
                  
                  e.preventDefault();
                  targetToFocus.focus();
                  targetToFocus.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                  return;
                }
              }
            }

            // For leftmost card/content element: only jump to nav if no valid page element is to the left
            const hasLeftPageCandidates = pageElements.some(el => {
              const r = el.getBoundingClientRect();
              return r.right <= currentRect.left + 20 && r.left < currentRect.left - 10;
            });

            if (hasLeftPageCandidates) {
              candidateElements = pageElements;
            } else {
              // Moving from content viewport into navbar: focus active link or Y-closest nav element
              const activeNav = document.querySelector<HTMLElement>('aside a.active, nav a.active') ||
                                document.querySelector<HTMLElement>(`aside a[href="${location.pathname}"], nav a[href="${location.pathname}"]`) ||
                                navElements[0];
              if (activeNav) {
                e.preventDefault();
                activeNav.focus();
                activeNav.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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

        // Special fallback when moving ArrowUp from top row of catalog / grid cards to filter buttons
        if (e.key === 'ArrowUp' && !nextElement && !isCurrentInNav) {
          const filterSections = document.querySelectorAll<HTMLElement>('[data-tv-filter-section="true"]');
          if (filterSections.length > 0) {
            // Find filter buttons in the nearest filter section directly above
            const filterButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-tv-filter-section="true"] .tv-focus-target'))
              .filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden';
              });
            if (filterButtons.length > 0) {
              // Find the filter button that is horizontally closest to current card or active
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

        if (nextElement) {
          e.preventDefault();
          nextElement.focus();
          
          // If the focused element is within the Hero Billboard or Filter Section in Movies/Series, scroll immediately to top
          if (nextElement.closest('[data-hero-banner="true"]') !== null || nextElement.closest('[data-tv-filter-section="true"]') !== null) {
            window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
            nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          } else {
            nextElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            setTimeout(() => {
              const r = nextElement?.getBoundingClientRect();
              if (r && r.bottom > window.innerHeight - 80) {
                window.scrollBy({ top: r.bottom - window.innerHeight + 140, behavior: 'smooth' });
              }
            }, 50);
          }
        } else {
          // Boundary reached (e.g. at the bottom of the page or end of a row)
          // Always prevent default to prevent the webview from dropping focus to body or scrolling untracked
          e.preventDefault();
          currentFocused.focus();
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
