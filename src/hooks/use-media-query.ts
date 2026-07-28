import { useCallback, useSyncExternalStore } from "react";

/**
 * Hook to check if a media query matches
 * @param query The media query string (e.g., "(min-width: 768px)")
 * @returns Boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Server snapshot — same `false` the old useState initial value gave.
    () => false
  );
}

// Preset breakpoints matching Tailwind CSS
export function useIsMobile(): boolean {
  return !useMediaQuery("(min-width: 768px)");
}

export function useIsTablet(): boolean {
  // Both hooks must run unconditionally — the old `a && !b` short-circuit
  // skipped the second hook call whenever `a` was false, which breaks the
  // Rules of Hooks the moment the viewport crosses the breakpoint.
  const isAtLeastMd = useMediaQuery("(min-width: 768px)");
  const isAtLeastLg = useMediaQuery("(min-width: 1024px)");
  return isAtLeastMd && !isAtLeastLg;
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
