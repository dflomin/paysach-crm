/**
 * Schema for the `addresses` table.
 * Physical addresses linked to a business.
 */
export interface Address {
  id: number;
  business_id: number;
  address: string | null;
  /** US state abbreviation */
  state: string;
}
