import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';

/**
 * GET /api/analytics/totals
 * Query params:
 *   dateFrom — ISO date string (inclusive), filters businesses.insert_ts / analytics.insert_ts
 *   dateTo   — ISO date string (inclusive)
 *   runIds   — comma-separated run_meta ids
 *
 * Returns:
 *   totalFilings               — COUNT(*) of filings for matched businesses
 *   totalBusinesses            — COUNT(*) of matched businesses
 *   duplicateAddressCount      — COUNT of analytics rows with tag DB_DUPLICATE_BUSINESS_ADDRESS
 *   geminiCost                 — SUM(instances) for COST_GEMINI_OUTPUT_TOKENS * 0.60 / 1_000_000
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo   = searchParams.get('dateTo')   ?? '';
  const runIds   = searchParams.get('runIds')?.split(',').filter(Boolean) ?? [];

  const db = getDbConnection();

  // ── Business / filing conditions ───────────────────────────────────────────
  const bizConditions: string[] = [];
  const bizParams: (string | number)[] = [];

  if (dateFrom) {
    bizConditions.push('b.insert_ts >= ?');
    bizParams.push(dateFrom);
  }
  if (dateTo) {
    bizConditions.push('b.insert_ts <= DATE_ADD(?, INTERVAL 1 DAY)');
    bizParams.push(dateTo);
  }
  if (runIds.length > 0) {
    const ph = runIds.map(() => '?').join(',');
    bizConditions.push(`b.id IN (SELECT business_id FROM \`run-data\` WHERE run_id IN (${ph}) AND business_id IS NOT NULL)`);
    bizParams.push(...runIds.map(Number));
  }
  const bizWhere = bizConditions.length > 0 ? `WHERE ${bizConditions.join(' AND ')}` : '';

  // ── Analytics conditions ───────────────────────────────────────────────────
  const analyticsConditions: string[] = [];
  const analyticsParams: (string | number)[] = [];

  if (dateFrom) {
    analyticsConditions.push('insert_ts >= ?');
    analyticsParams.push(dateFrom);
  }
  if (dateTo) {
    analyticsConditions.push('insert_ts <= DATE_ADD(?, INTERVAL 1 DAY)');
    analyticsParams.push(dateTo);
  }
  if (runIds.length > 0) {
    const ph = runIds.map(() => '?').join(',');
    analyticsConditions.push(`run_id IN (${ph})`);
    analyticsParams.push(...runIds.map(Number));
  }
  const analyticsWhere = analyticsConditions.length > 0 ? `AND ${analyticsConditions.join(' AND ')}` : '';

  try {
    const [bizRows] = await db.execute(
      `SELECT
         COUNT(DISTINCT b.id)  AS totalBusinesses,
         COUNT(f.id)           AS totalFilings
       FROM businesses b
       LEFT JOIN filings f ON f.business_id = b.id
       ${bizWhere}`,
      bizParams
    ) as [{ totalBusinesses: number; totalFilings: number }[], unknown];

    const [dupRows] = await db.execute(
      `SELECT COUNT(*) AS duplicateAddressCount
       FROM analytics
       WHERE analytics_tag = 'DB_DUPLICATE_BUSINESS_ADDRESS'
       ${analyticsWhere}`,
      analyticsParams
    ) as [{ duplicateAddressCount: number }[], unknown];

    const [geminiRows] = await db.execute(
      `SELECT
         COALESCE(SUM(instances), 0) AS totalInstances,
         COUNT(*)                    AS geminiRequests
       FROM analytics
       WHERE analytics_tag = 'COST_GEMINI_OUTPUT_TOKENS'
       ${analyticsWhere}`,
      analyticsParams
    ) as [{ totalInstances: number; geminiRequests: number }[], unknown];

    const totalBusinesses       = Number(bizRows[0]?.totalBusinesses ?? 0);
    const totalFilings          = Number(bizRows[0]?.totalFilings ?? 0);
    const duplicateAddressCount = Number(dupRows[0]?.duplicateAddressCount ?? 0);
    const totalInstances        = Number(geminiRows[0]?.totalInstances ?? 0);
    const geminiRequests        = Number(geminiRows[0]?.geminiRequests ?? 0);
    // $0.60 per 1 million output tokens (Gemini 2.5 Flash non-thinking)
    const GEMINI_COST_PER_MILLION_TOKENS = 0.60;
    const geminiCost            = (totalInstances / 1_000_000) * GEMINI_COST_PER_MILLION_TOKENS;

    return NextResponse.json({
      totalFilings,
      totalBusinesses,
      duplicateAddressCount,
      geminiCost,
      geminiTokens: totalInstances,
      geminiRequests,
    });
  } catch (err) {
    console.error('[analytics/totals]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
