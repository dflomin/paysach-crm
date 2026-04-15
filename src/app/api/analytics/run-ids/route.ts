import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDbConnection();
  try {
    // Try run_meta first for labelled runs; fall back to `run-data` distinct run_id values
    const [metaRows] = await db.execute(
      `SELECT id, label, started_at FROM run_meta ORDER BY id DESC`
    ) as [{ id: number; label: string | null; started_at: Date | null }[], unknown];

    if ((metaRows).length > 0) {
      return NextResponse.json(
        (metaRows).map((r) => ({
          id: r.id,
          label: r.label ?? `Run #${r.id}`,
          started_at: r.started_at,
        }))
      );
    }

    // Fallback: distinct run_id values from `run-data`
    const [dataRows] = await db.execute(
      `SELECT DISTINCT run_id FROM \`run-data\` WHERE run_id IS NOT NULL ORDER BY run_id DESC`
    ) as [{ run_id: number }[], unknown];

    return NextResponse.json(
      (dataRows).map((r) => ({
        id: r.run_id,
        label: `Run #${r.run_id}`,
        started_at: null,
      }))
    );
  } catch (err) {
    console.error('[analytics/run-ids]', err);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
