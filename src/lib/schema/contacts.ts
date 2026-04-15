/**
 * Schema for the `contacts` table.
 * One or more contacts per business (owners, members, etc.).
 */
export interface Contact {
  id: number;
  uuid: string;
  business_id: number;
  business_uuid: string;
  /** Full name (legacy single-field) */
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  /** e.g. 'owner', 'member', 'agent' */
  role: string | null;
}
