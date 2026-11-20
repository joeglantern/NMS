const isCatchAll = (label: string) => /^others?$/i.test(label.trim());

/**
 * Orders dropdown options A to Z, ignoring case. A catch-all "Other" stays at
 * the end, where people look for it after reading the real choices.
 */
export function sortAZ<T>(items: readonly T[], label: (item: T) => string = String): T[] {
  return [...items].sort((a, b) => {
    const la = label(a);
    const lb = label(b);
    if (isCatchAll(la) !== isCatchAll(lb)) return isCatchAll(la) ? 1 : -1;
    return la.localeCompare(lb, 'en', { sensitivity: 'base', numeric: true });
  });
}
