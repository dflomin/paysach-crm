/**
 * Schema for the `run-data` table (hyphenated name in MariaDB).
 * Each row represents an individual data record belonging to an import run.
 * Use backtick quoting when referencing this table: `\`run-data\``
 */
export interface RunData {
  id: number;
  run_id: number | null;
  business_id: number | null;
  /** Raw import payload or source data (JSON / text) */
  data: string | null;
}
