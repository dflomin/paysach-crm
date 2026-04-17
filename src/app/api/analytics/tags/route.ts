import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';

/**
 * GET /api/analytics/tags
 * Query params:
 *   dateFrom — ISO date string (inclusive), filters on insert_ts
 *   dateTo   — ISO date string (inclusive), filters on insert_ts
 *   runIds   — comma-separated run_meta ids
 *
 * Returns: Array<{ analytics_tag: string, count: number }>
 * Each row is the total number of records with a given tag across all matching runs.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo   = searchParams.get('dateTo')   ?? '';
  const runIds   = searchParams.get('runIds')?.split(',').filter(Boolean) ?? [];

  const db = getDbConnection();
  const conditions: string[] = [
    'analytics_tag IS NOT NULL',
    "analytics_tag != ''",
  ];
  const params: (string | number)[] = [];

  if (dateFrom) {
    conditions.push('insert_ts >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('insert_ts <= DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(dateTo);
  }
  if (runIds.length > 0) {
    const ph = runIds.map(() => '?').join(',');
    conditions.push(`run_id IN (${ph})`);
    params.push(...runIds.map(Number));
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [rows] = await db.execute(
      `SELECT
         analytics_tag,
         COUNT(*) AS count
       FROM analytics
       ${where}
       GROUP BY analytics_tag
       ORDER BY analytics_tag`,
      params
    ) as [{ analytics_tag: string; count: number }[], unknown];

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[analytics/tags]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
