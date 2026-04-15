/**
 * Schema for the `analytics` table.
 * AI / enrichment analytics tied to a specific filing.
 */
export interface Analytics {
  id: number;
  filing_id: number;
}
