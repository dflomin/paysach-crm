import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';

/**
 * GET /api/analytics/states
 * Query params:
 *   dateFrom  — ISO date string (inclusive)
 *   dateTo    — ISO date string (inclusive)
 *   runIds    — comma-separated run_meta ids
 *
 * Returns: Array<{ state, with_phone, without_phone, total }>
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo   = searchParams.get('dateTo')   ?? '';
  const runIds   = searchParams.get('runIds')?.split(',').filter(Boolean) ?? [];

  const db = getDbConnection();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (dateFrom) {
    conditions.push('b.insert_ts >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('b.insert_ts <= DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(dateTo);
  }
  if (runIds.length > 0) {
    const ph = runIds.map(() => '?').join(',');
    conditions.push(`b.id IN (SELECT business_id FROM \`run-data\` WHERE run_id IN (${ph}) AND business_id IS NOT NULL)`);
    params.push(...runIds.map(Number));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [rows] = await db.execute(
      `SELECT
         filing_state                                  AS state,
         SUM(has_phone)                                AS with_phone,
         SUM(1 - has_phone)                            AS without_phone,
         COUNT(*)                                      AS total
       FROM (
         SELECT
           b.id,
           (SELECT f.state
            FROM filings f
            WHERE f.business_id = b.id
            ORDER BY f.filing_date DESC, f.id DESC
            LIMIT 1)                                   AS filing_state,
           CASE WHEN EXISTS (
             SELECT 1 FROM phones p
             WHERE p.business_id = b.id
               AND p.type = 'primary'
               AND p.phone IS NOT NULL
               AND TRIM(p.phone) != ''
           ) THEN 1 ELSE 0 END                         AS has_phone
         FROM businesses b
         ${where}
       ) sub
       WHERE filing_state IS NOT NULL AND filing_state != ''
       GROUP BY filing_state
       ORDER BY filing_state`,
      params
    ) as [{ state: string; with_phone: number; without_phone: number; total: number }[], unknown];

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[analytics/states]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
