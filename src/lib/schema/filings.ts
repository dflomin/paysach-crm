/**
 * Schema for the `filings` table.
 * UCC filing records — each business may have multiple filings.
 */
export interface Filing {
  id: number;
  uuid: string;
  business_id: number;
  business_uuid: string;
  document_id: string;
  filing_date: Date | null;
  /** US state abbreviation, e.g. 'CA', 'TX', 'FL' */
  state: string | null;
}
