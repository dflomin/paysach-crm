/**
 * Schema for the `ai_queue` table.
 * Queue for AI-powered processing tasks (e.g. contact extraction, scoring).
 */
export interface AiQueue {
  id: number;
  business_id: number | null;
  task_type: string | null;
  payload: string | null;
  status: string | null;
  created_at: Date | null;
  processed_at: Date | null;
}
