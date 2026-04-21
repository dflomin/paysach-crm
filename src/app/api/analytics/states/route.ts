import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';

/**
 * GET /api/analytics/states
 * Query params:
 *   dateFrom  — ISO date string (inclusive), filters on filings.filing_date
 *   dateTo    — ISO date string (inclusive), filters on filings.filing_date
 *   runIds    — comma-separated run_meta ids
 *
 * Returns: Array<{ filing_date, with_phone, without_phone, total }>
 *   Each row represents one filing_date bucket, counting filings that belong
 *   to a business with/without a primary phone number.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo   = searchParams.get('dateTo')   ?? '';
  const runIds   = searchParams.get('runIds')?.split(',').filter(Boolean) ?? [];

  const db = getDbConnection();
  const conditions: string[] = ['f.filing_date IS NOT NULL'];
  const params: (string | number)[] = [];

  if (dateFrom) {
    conditions.push('f.filing_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('f.filing_date <= DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(dateTo);
  }
  if (runIds.length > 0) {
    const ph = runIds.map(() => '?').join(',');
    conditions.push(`f.business_id IN (SELECT business_id FROM \`run-data\` WHERE run_id IN (${ph}) AND business_id IS NOT NULL)`);
    params.push(...runIds.map(Number));
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    const [rows] = await db.execute(
      `SELECT
         DATE_FORMAT(f.filing_date, '%Y-%m-%d')        AS filing_date,
         SUM(CASE WHEN EXISTS (
           SELECT 1 FROM phones p
           WHERE p.business_uuid = f.business_uuid
             AND p.type = 'primary'
             AND p.phone IS NOT NULL
             AND TRIM(p.phone) != ''
         ) THEN 1 ELSE 0 END)                          AS with_phone,
         SUM(CASE WHEN NOT EXISTS (
           SELECT 1 FROM phones p
           WHERE p.business_uuid = f.business_uuid
             AND p.type = 'primary'
             AND p.phone IS NOT NULL
             AND TRIM(p.phone) != ''
         ) THEN 1 ELSE 0 END)                          AS without_phone,
         COUNT(*)                                      AS total
       FROM filings f
       ${where}
       GROUP BY DATE_FORMAT(f.filing_date, '%Y-%m-%d')
       ORDER BY filing_date`,
      params
    ) as [{ filing_date: string; with_phone: number; without_phone: number; total: number }[], unknown];

    return NextResponse.json(rows);
  } catch (err) {
    console.error('[analytics/states]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
