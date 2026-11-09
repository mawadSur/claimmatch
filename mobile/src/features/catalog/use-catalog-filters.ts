import { cleanSearchTerm } from '@shared/lib/lawsuit-display';
import { useCallback, useEffect, useState } from 'react';

/** The web debounces the search box by about 300 ms (src/components/LawsuitFilters.tsx). */
export const SEARCH_DEBOUNCE_MS = 300;

/** The web's maxLength and MAX_QUERY_LENGTH (src/lib/lawsuit-display.ts). */
export const SEARCH_MAX_LENGTH = 100;

export interface CatalogFilters {
  /** What the search field shows, updated on every keystroke. */
  text: string;
  /** The search term in use: the field's text 300 ms after the last keystroke, cleaned (cleanSearchTerm). */
  q: string | undefined;
  /** The selected category, or null for "All". */
  category: string | null;
  hasDeadline: boolean;
  /** "No proof required" (the web's proof=no). */
  proofNotRequired: boolean;
  /** Any search or filter is on (the web's hasFilters and `filtered`). */
  active: boolean;
  setText(text: string): void;
  /** Uses the field's text at once (the keyboard's search key). */
  submitSearch(): void;
  /** Empties the field and the search term at once. */
  clearSearch(): void;
  showAll(): void;
  /** Selects a category, or goes back to "All" when it is already selected. */
  toggleCategory(category: string): void;
  toggleHasDeadline(): void;
  toggleProofNotRequired(): void;
  clearAll(): void;
}

/**
 * The catalog's search and filter state, kept on the device (the web keeps
 * it in the URL). Category and filter chips apply at once; typed text
 * applies 300 ms after the last keystroke, as on the web.
 */
export function useCatalogFilters(): CatalogFilters {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [hasDeadline, setHasDeadline] = useState(false);
  const [proofNotRequired, setProofNotRequired] = useState(false);

  useEffect(() => {
    if (text === query) return undefined;
    const timer = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, query]);

  const submitSearch = useCallback(() => setQuery(text), [text]);

  const clearSearch = useCallback(() => {
    setText('');
    setQuery('');
  }, []);

  const showAll = useCallback(() => setCategory(null), []);

  const toggleCategory = useCallback((next: string) => {
    setCategory((current) => (current === next ? null : next));
  }, []);

  const toggleHasDeadline = useCallback(() => setHasDeadline((on) => !on), []);
  const toggleProofNotRequired = useCallback(() => setProofNotRequired((on) => !on), []);

  const clearAll = useCallback(() => {
    setText('');
    setQuery('');
    setCategory(null);
    setHasDeadline(false);
    setProofNotRequired(false);
  }, []);

  const q = cleanSearchTerm(query);

  return {
    text,
    q,
    category,
    hasDeadline,
    proofNotRequired,
    active: Boolean(q || category || hasDeadline || proofNotRequired),
    setText,
    submitSearch,
    clearSearch,
    showAll,
    toggleCategory,
    toggleHasDeadline,
    toggleProofNotRequired,
    clearAll,
  };
}
