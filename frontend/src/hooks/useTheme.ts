import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/**
 * Tracks the app-wide light/dark theme (set as `data-theme` on <html> by
 * AppShell's toggle). Lets components outside AppShell — e.g. the map canvas —
 * react to theme changes without prop-drilling.
 */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => setTheme(readTheme()));
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
