/**
 * Shared deduplication utilities for UCC lead data.
 *
 * Mirrors the dedup logic from the legacy getResults script:
 *  1. Exact business name match (case-insensitive)
 *  2. Fuzzy business name match (Dice coefficient >= 0.8, bucketed by first char + state)
 *  3. Fuzzy stripped-suffix name match (same threshold)
 *  4. Fuzzy address match (>= 0.8)
 *  5. Exact phone match
 *
 * Name fuzzy-matching is scoped per state: two businesses with similar names in
 * different states are treated as distinct leads and are never merged.
 */

const BUSINESS_SUFFIXES = [
  'LLC', 'INC', 'CORP', 'CORPORATION', 'LTD', 'CO', 'COMPANY', 'LIMITED',
  'PC', 'PLC', 'LLP', 'LP', 'PARTNERSHIP', 'ASSOCIATES', 'GROUP',
];

const SUFFIX_REGEX = new RegExp(
  `\\b(${BUSINESS_SUFFIXES.join('|')})\\b[.,\\s]*$`,
  'i'
);

/** Remove common business-entity suffixes from the end of a name. */
export function stripBusinessSuffixes(name: string): string {
  if (!name || typeof name !== 'string') return name;
  return name.replace(SUFFIX_REGEX, '').trim();
}

/** Compute bigram Dice coefficient similarity between two strings (0–1). */
export function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const na = a.toLowerCase().replace(/\s+/g, ' ').trim();
  const nb = b.toLowerCase().replace(/\s+/g, ' ').trim();
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < na.length - 1; i++) bigramsA.add(na.slice(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < nb.length - 1; i++) bigramsB.add(nb.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/** Return true if `target` fuzzy-matches any string in `candidates` at >= `threshold`. */
export function fuzzyMatchExists(
  target: string,
  candidates: string[],
  threshold: number
): boolean {
  for (const candidate of candidates) {
    if (diceSimilarity(target, candidate) >= threshold) return true;
  }
  return false;
}

export interface DedupeOptions {
  /** Field name that contains the business/entity name. */
  nameField: string;
  /** Field name that contains the filing/business state (used to scope fuzzy name matching). */
  stateField?: string;
  /** Field name that contains the address string (optional). */
  addressField?: string;
  /** Field name that contains a representative phone number (optional). */
  phoneField?: string;
}

/**
 * Fast deduplication using only O(1) exact-match checks (no fuzzy logic).
 *
 * Used during CRM page load where performance is critical. Removes rows whose
 * business name (case-insensitive) or primary phone number exactly matches a
 * previously seen row. Fuzzy name and fuzzy address checks are intentionally
 * omitted here — use `dedupeBusinessRows` for exports where thoroughness matters.
 *
 * The order of `rows` is preserved; only duplicates are removed.
 */
export function dedupeBusinessRowsExact<T extends Record<string, unknown>>(
  rows: T[],
  opts: Pick<DedupeOptions, 'nameField' | 'phoneField'>
): T[] {
  const { nameField, phoneField } = opts;

  const exactNames = new Set<string>();
  const seenPhones = new Set<string>();
  const result: T[] = [];

  for (const row of rows) {
    const rawName = String(row[nameField] ?? '');
    let name: string;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      name = rawName;
    }

    const phone = phoneField
      ? (row[phoneField] as string | null | undefined) ?? null
      : null;

    // 1. Exact name dedup (case-insensitive)
    if (exactNames.has(name.toLowerCase())) continue;

    // 2. Exact phone dedup
    if (phone && seenPhones.has(phone)) continue;

    // Passed all filters — record it
    exactNames.add(name.toLowerCase());
    const stripped = stripBusinessSuffixes(name);
    if (stripped.toLowerCase() !== name.toLowerCase()) {
      exactNames.add(stripped.toLowerCase());
    }
    if (phone) seenPhones.add(phone);
    result.push(row);
  }

  return result;
}

/**
 * Deduplicate an ordered array of business rows using the same logic as the
 * legacy getResults script:
 *  - exact name (case-insensitive)
 *  - fuzzy name (Dice >= 0.8, bucketed by first-letter + state so that similar
 *    names in different states are never merged)
 *  - fuzzy stripped name (same)
 *  - fuzzy address (Dice >= 0.8)
 *  - exact phone
 *
 * The order of `rows` is preserved; only duplicates are removed.
 */
export function dedupeBusinessRows<T extends Record<string, unknown>>(
  rows: T[],
  opts: DedupeOptions
): T[] {
  const { nameField, stateField, addressField, phoneField } = opts;

  const exactNames = new Set<string>();
  // Bucketed by "<firstUpperChar>|<state>" for O(N) fuzzy matching scoped per state
  const nameBuckets: Record<string, string[]> = {};
  const seenAddresses: string[] = [];
  const seenPhones = new Set<string>();
  const result: T[] = [];

  const getBucket = (name: string, state: string): string[] => {
    const char = name.charAt(0).toUpperCase() || '#';
    const key = `${char}|${state.toUpperCase()}`;
    if (!nameBuckets[key]) nameBuckets[key] = [];
    return nameBuckets[key];
  };

  for (const row of rows) {
    const rawName = String(row[nameField] ?? '');
    // Decode URI-encoded names (same as the original script)
    let name: string;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      name = rawName;
    }

    const state = stateField
      ? String(row[stateField] ?? '').trim()
      : '';
    const address = addressField
      ? (row[addressField] as string | null | undefined) ?? null
      : null;
    const phone = phoneField
      ? (row[phoneField] as string | null | undefined) ?? null
      : null;

    // 1. Exact name dedup
    if (exactNames.has(name.toLowerCase())) continue;

    // 2. Exact phone dedup (note: original script had a Set.length bug that made
    //    this a no-op; we implement it correctly here)
    if (phone && seenPhones.size > 0 && seenPhones.has(phone)) continue;

    // 3. Fuzzy name dedup (bucketed by first char + state)
    if (name.length >= 2 && fuzzyMatchExists(name, getBucket(name, state), 0.8)) continue;

    // 4. Fuzzy stripped-suffix name dedup (same per-state bucket)
    const stripped = stripBusinessSuffixes(name);
    if (
      stripped !== name &&
      stripped.length >= 2 &&
      fuzzyMatchExists(stripped, getBucket(stripped, state), 0.8)
    ) {
      continue;
    }

    // 5. Fuzzy address dedup
    if (address && address.trim().length > 0 && fuzzyMatchExists(address, seenAddresses, 0.8)) {
      seenAddresses.push(address);
      continue;
    }

    // Passed all filters — record it
    exactNames.add(name.toLowerCase());
    if (stripped.toLowerCase() !== name.toLowerCase()) {
      exactNames.add(stripped.toLowerCase());
    }
    getBucket(name, state).push(name);
    getBucket(stripped, state).push(stripped);
    if (address && address.trim().length > 0) seenAddresses.push(address);
    if (phone) seenPhones.add(phone);
    result.push(row);
  }

  return result;
}
