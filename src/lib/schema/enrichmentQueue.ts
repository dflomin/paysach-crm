/**
 * Schema for the `enrichment_queue` table.
 * Queue of businesses pending data enrichment.
 */
export interface EnrichmentQueue {
  id: number;
  business_id: number | null;
  status: string | null;
  created_at: Date | null;
  processed_at: Date | null;
}
