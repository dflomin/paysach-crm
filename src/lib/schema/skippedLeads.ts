/**
 * Schema for the `skipped_leads` table.
 * Records that were intentionally skipped during import or enrichment.
 */
export interface SkippedLead {
  id: number;
  /** Reference to an import run */
  run_id: number | null;
  /** Raw identifier of the skipped record */
  external_id: string | null;
  reason: string | null;
  skipped_at: Date | null;
}
