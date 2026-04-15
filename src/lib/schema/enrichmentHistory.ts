/**
 * Schema for the `enrichment_history` table.
 * Audit trail of completed enrichment operations.
 */
export interface EnrichmentHistory {
  id: number;
  business_id: number | null;
  source: string | null;
  result: string | null;
  enriched_at: Date | null;
}
