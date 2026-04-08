import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(nodes).filter((el) => el.getClientRects().length > 0);
}

/**
 * 모달 등에 포커스를 가두고 Tab / Shift+Tab 순환만 허용한다.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = getFocusableElements(container);
      if (list.length === 0) return;

      const first = list[0];
      const last = list[list.length - 1];
      const cur = document.activeElement;

      if (e.shiftKey) {
        if (cur === first || !cur || !container.contains(cur)) {
          e.preventDefault();
          last.focus();
        }
      } else if (cur === last || !cur || !container.contains(cur)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [active, containerRef]);
}
