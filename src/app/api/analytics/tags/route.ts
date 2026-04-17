import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';

/**
 * GET /api/analytics/tags
 * Query params:
 *   dateFrom — ISO date string (inclusive), filters on insert_ts
 *   dateTo   — ISO date string (inclusive), filters on insert_ts
 *
 * Returns: Array<{ run_id: string, analytics_tag: string, count: number }>
 * Each row is the number of records with a given tag for a given run_id.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo   = searchParams.get('dateTo')   ?? '';

  const db = getDbConnection();
  const conditions: string[] = [
    'run_id IS NOT NULL',
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

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [rows] = await db.execute(
      `SELECT
         run_id,
         analytics_tag,
         COUNT(*) AS count
       FROM analytics
       ${where}
       GROUP BY run_id, analytics_tag
       ORDER BY run_id, analytics_tag`,
      params
    ) as [{ run_id: string; analytics_tag: string; count: number }[], unknown];

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[analytics/tags]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
