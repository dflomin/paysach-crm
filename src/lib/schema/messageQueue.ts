/**
 * Schema for the `message_queue` table.
 * Outbound messaging queue (SMS, email, voicemail drops, etc.).
 */
export interface MessageQueue {
  id: number;
  business_id: number | null;
  channel: string | null;
  payload: string | null;
  status: string | null;
  scheduled_at: Date | null;
  sent_at: Date | null;
}
