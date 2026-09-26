import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

let lockCount = 0;
let prevOverflow = '';
let prevPaddingRight = '';

/** Body scroll lock with reference counting so nested overlays behave. */
export function useScrollLock(active: boolean): void {
  useLayoutEffect(() => {
    if (!active || typeof document === 'undefined') return;
    if (lockCount === 0) {
      const scrollbar = window.innerWidth - document.documentElement.clientWidth;
      prevOverflow = document.body.style.overflow;
      prevPaddingRight = document.body.style.paddingRight;
      document.body.style.overflow = 'hidden';
      if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = prevOverflow;
        document.body.style.paddingRight = prevPaddingRight;
      }
    };
  }, [active]);
}

export interface FocusTrapOptions {
  /** Return focus to the previously focused element on deactivate. Default true. */
  returnFocus?: boolean;
  /** Selector or ref for the element to focus initially. Falls back to first focusable → container. */
  initialFocus?: string | RefObject<HTMLElement | null>;
}

/** Traps Tab focus inside `ref` while `active`. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, opts: FocusTrapOptions = {}): void {
  const { returnFocus = true, initialFocus } = opts;
  const lastActive = useRef<Element | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    lastActive.current = document.activeElement;

    const focusInitial = () => {
      let target: HTMLElement | null = null;
      if (typeof initialFocus === 'string') target = container.querySelector<HTMLElement>(initialFocus);
      else if (initialFocus?.current) target = initialFocus.current;
      if (!target) target = container.querySelector<HTMLElement>('[data-autofocus]');
      if (!target) target = container.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? container).focus({ preventScroll: true });
    };
    const raf = requestAnimationFrame(focusInitial);

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !container.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !container.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (returnFocus && lastActive.current instanceof HTMLElement) {
        lastActive.current.focus({ preventScroll: true });
      }
    };
  }, [active, ref, returnFocus, initialFocus]);
}

/** Calls `handler` on pointerdown outside all `refs`. */
export function useOnClickOutside(
  refs: Array<RefObject<HTMLElement | null>>,
  handler: (e: PointerEvent) => void,
  active = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!active) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (refs.some((r) => r.current?.contains(t))) return;
      handlerRef.current(e);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...refs]);
}

/** Escape key → handler while active. */
export function useEscape(handler: () => void, active = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handlerRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
}
