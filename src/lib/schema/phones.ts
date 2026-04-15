/**
 * Schema for the `phones` table.
 * Phone numbers linked to a business and optionally to a specific contact.
 */
export interface Phone {
  id: number;
  business_id: number;
  business_uuid: string;
  contact_id: number | null;
  phone: string | null;
  /** e.g. 'primary', 'mobile', 'office', 'fax' */
  type: string | null;
  /** 1 = confirmed dead/disconnected, 0 = active */
  is_dead: 0 | 1;
}
