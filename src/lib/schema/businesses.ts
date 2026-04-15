/**
 * Schema for the `businesses` table.
 * Central entity — each row represents one UCC lead/business.
 */
export interface Business {
  id: number;
  uuid: string;
  name: string;
  /** Dialer status: 'New' | 'Contacted' | 'Callback' | 'Not Interested' | 'Converted' | etc. */
  status: string;
  last_called_ts: Date | null;
  /** Timestamp when this record was inserted by the importer */
  insert_ts: Date | null;
}
