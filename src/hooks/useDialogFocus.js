import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable=\"true\"]",
  "[tabindex]:not([tabindex=\"-1\"]):not([disabled])"
].join(",");

const dialogStack = [];

function isAvailable(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.matches("[inert], [aria-hidden=\"true\"]")) return false;
  if (element.closest("[hidden], [inert], [aria-hidden=\"true\"]")) return false;
  return element.getClientRects().length > 0;
}

function getFocusableElements(dialog) {
  return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isAvailable);
}

function removeFromDialogStack(dialog) {
  const index = dialogStack.lastIndexOf(dialog);
  if (index >= 0) dialogStack.splice(index, 1);
}

/**
 * Keeps keyboard focus inside an open modal dialog and restores focus when it closes.
 */
export function useDialogFocus({
  isOpen = true,
  onClose,
  closeOnEscape = true,
  initialFocusRef,
  restoreFocus = true
} = {}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;

    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const activeElement = document.activeElement;
    const opener = activeElement instanceof HTMLElement && !dialog.contains(activeElement)
      ? activeElement
      : null;

    dialogStack.push(dialog);

    const focusFrame = window.requestAnimationFrame(() => {
      if (dialogStack[dialogStack.length - 1] !== dialog) return;
      const requestedTarget = initialFocusRef?.current;
      const target = requestedTarget instanceof HTMLElement && dialog.contains(requestedTarget) && isAvailable(requestedTarget)
        ? requestedTarget
        : getFocusableElements(dialog)[0] || dialog;
      target.focus({ preventScroll: true });
    });

    const handleKeyDown = (event) => {
      if (dialogStack[dialogStack.length - 1] !== dialog) return;

      if (event.key === "Escape") {
        const canClose = closeOnEscape
          && typeof onCloseRef.current === "function"
          && !event.defaultPrevented
          && !event.isComposing
          && !event.repeat
          && !event.altKey
          && !event.ctrlKey
          && !event.metaKey;

        if (canClose) {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      if (event.key !== "Tab" || event.defaultPrevented) return;

      const focusable = getFocusableElements(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focused = document.activeElement;

      if (!dialog.contains(focused)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && focused === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      removeFromDialogStack(dialog);

      if (restoreFocus && opener?.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [closeOnEscape, initialFocusRef, isOpen, restoreFocus]);

  return dialogRef;
}
