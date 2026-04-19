import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';

/**
 * GET /api/analytics/fallback-coverage
 *
 * Analyses the two-stage fallback enrichment flow per (business_name, run_date):
 *
 *   Owner search  : Exa contact/owner search  →  Serper owner search (fallback)
 *   Phone search  : Serper phone search        →  Exa phone search   (fallback)
 *
 * The presence of fallback-stage tags for a given business+run_date signals that
 * the primary stage produced no result.  Within the fallback stage we look for
 * tags containing "found" (case-insensitive) to determine whether the fallback
 * itself succeeded.
 *
 * NOTE: adjust the LIKE patterns in the inner query if your tag naming scheme
 * differs (e.g. "success" instead of "found").
 *
 * Query params:
 *   dateFrom — ISO date string (inclusive), filters on insert_ts
 *   dateTo   — ISO date string (inclusive), filters on insert_ts
 *   runIds   — comma-separated run_meta ids
 *
 * Returns:
 *   ownerExaFound      — businesses where Exa handled owner lookup (no fallback needed)
 *   ownerSerperRescued — businesses where Exa failed but Serper found the owner
 *   ownerBothFailed    — businesses where both Exa and Serper found nothing for owner
 *   phoneSerperFound   — businesses where Serper handled phone lookup (no fallback needed)
 *   phoneExaRescued    — businesses where Serper failed but Exa found the phone
 *   phoneBothFailed    — businesses where both Serper and Exa found nothing for phone
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
    'business_name IS NOT NULL',
    "business_name != ''",
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
         /* ── Owner search flow ───────────────────────────────────────────────── */
         SUM(CASE
           WHEN has_exa_owner = 1 AND has_serper_owner = 0 THEN 1
           ELSE 0
         END)                                              AS ownerExaFound,

         SUM(CASE
           WHEN has_serper_owner = 1 AND serper_owner_found = 1 THEN 1
           ELSE 0
         END)                                              AS ownerSerperRescued,

         SUM(CASE
           WHEN has_serper_owner = 1 AND serper_owner_found = 0 THEN 1
           ELSE 0
         END)                                              AS ownerBothFailed,

         /* ── Phone search flow ────────────────────────────────────────────────── */
         SUM(CASE
           WHEN has_serper_phone = 1 AND has_exa_phone = 0 THEN 1
           ELSE 0
         END)                                              AS phoneSerperFound,

         SUM(CASE
           WHEN has_exa_phone = 1 AND exa_phone_found = 1 THEN 1
           ELSE 0
         END)                                              AS phoneExaRescued,

         SUM(CASE
           WHEN has_exa_phone = 1 AND exa_phone_found = 0 THEN 1
           ELSE 0
         END)                                              AS phoneBothFailed

       FROM (
         SELECT
           business_name,
           run_date,

           /* Did the Exa owner/contact stage run? */
           MAX(CASE
             WHEN LOWER(analytics_tag) LIKE 'exa%'
              AND (LOWER(analytics_tag) LIKE '%contact%'
                OR LOWER(analytics_tag) LIKE '%owner%')
             THEN 1 ELSE 0
           END)                                            AS has_exa_owner,

           /* Did the Serper owner fallback run? */
           MAX(CASE
             WHEN LOWER(analytics_tag) LIKE 'serper%'
              AND LOWER(analytics_tag) LIKE '%owner%'
             THEN 1 ELSE 0
           END)                                            AS has_serper_owner,

           /* Did the Serper owner fallback find a result? */
           MAX(CASE
             WHEN LOWER(analytics_tag) LIKE 'serper%'
              AND LOWER(analytics_tag) LIKE '%owner%'
              AND LOWER(analytics_tag) LIKE '%found%'
             THEN 1 ELSE 0
           END)                                            AS serper_owner_found,

           /* Did the Serper phone stage run? */
           MAX(CASE
             WHEN LOWER(analytics_tag) LIKE 'serper%'
              AND LOWER(analytics_tag) LIKE '%phone%'
             THEN 1 ELSE 0
           END)                                            AS has_serper_phone,

           /* Did the Exa phone fallback run? */
           MAX(CASE
             WHEN LOWER(analytics_tag) LIKE 'exa%'
              AND LOWER(analytics_tag) LIKE '%phone%'
             THEN 1 ELSE 0
           END)                                            AS has_exa_phone,

           /* Did the Exa phone fallback find a result? */
           MAX(CASE
             WHEN LOWER(analytics_tag) LIKE 'exa%'
              AND LOWER(analytics_tag) LIKE '%phone%'
              AND LOWER(analytics_tag) LIKE '%found%'
             THEN 1 ELSE 0
           END)                                            AS exa_phone_found

         FROM analytics
         ${where}
         GROUP BY business_name, run_date
       ) flow
       WHERE has_exa_owner = 1
          OR has_serper_owner = 1
          OR has_serper_phone = 1
          OR has_exa_phone = 1`,
      params
    ) as [{
      ownerExaFound:      number;
      ownerSerperRescued: number;
      ownerBothFailed:    number;
      phoneSerperFound:   number;
      phoneExaRescued:    number;
      phoneBothFailed:    number;
    }[], unknown];

    const r = rows[0] ?? {};

    return NextResponse.json({
      ownerExaFound:      Number(r.ownerExaFound      ?? 0),
      ownerSerperRescued: Number(r.ownerSerperRescued ?? 0),
      ownerBothFailed:    Number(r.ownerBothFailed    ?? 0),
      phoneSerperFound:   Number(r.phoneSerperFound   ?? 0),
      phoneExaRescued:    Number(r.phoneExaRescued    ?? 0),
      phoneBothFailed:    Number(r.phoneBothFailed    ?? 0),
    });
  } catch (err) {
    console.error('[analytics/fallback-coverage]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
