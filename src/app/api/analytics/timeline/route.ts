import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';

/**
 * GET /api/analytics/timeline
 * Query params:
 *   dateFrom   — ISO date string (inclusive)
 *   dateTo     — ISO date string (inclusive)
 *   runIds     — comma-separated run_meta ids
 *   intervalMins — bucket size in minutes (default 5)
 *
 * Returns: Array<{ bucket: string (ISO), state: string, count: number }>
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom     = searchParams.get('dateFrom') ?? '';
  const dateTo       = searchParams.get('dateTo')   ?? '';
  const runIds       = searchParams.get('runIds')?.split(',').filter(Boolean) ?? [];
  const rawInterval = Number(searchParams.get('intervalMins') ?? '5');
  const intervalMins = Number.isNaN(rawInterval) ? 5 : Math.max(1, Math.min(1440, rawInterval));

  const db = getDbConnection();
  const conditions: string[] = ['b.insert_ts IS NOT NULL'];
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

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    // intervalMins is validated above (1-1440), safe to interpolate
    const [rows] = await db.execute(
      `SELECT
         DATE_FORMAT(
           FROM_UNIXTIME(
             FLOOR(UNIX_TIMESTAMP(b.insert_ts) / (${intervalMins} * 60)) * (${intervalMins} * 60)
           ),
           '%Y-%m-%dT%H:%i:00'
         )                                                        AS bucket,
         (SELECT f.state
          FROM filings f
          WHERE f.business_id = b.id
          ORDER BY f.filing_date DESC, f.id DESC
          LIMIT 1)                                                 AS state,
         COUNT(*)                                                  AS count
       FROM businesses b
       ${where}
       GROUP BY bucket, state
       HAVING state IS NOT NULL AND state != ''
       ORDER BY bucket, state`,
      params
    ) as [{ bucket: string; state: string; count: number }[], unknown];

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[analytics/timeline]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
