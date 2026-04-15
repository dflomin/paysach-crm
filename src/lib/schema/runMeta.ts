/**
 * Schema for the `run_meta` table.
 * One row per import run — contains metadata about each ingestion batch.
 */
export interface RunMeta {
  id: number;
  /** Human-readable label for this run (e.g. 'TX-2024-01') */
  label: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  /** Total records attempted */
  total_records: number | null;
  /** Records successfully inserted */
  inserted_records: number | null;
  status: string | null;
}
