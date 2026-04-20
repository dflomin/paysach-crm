import { getDbConnection } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextRequest, NextResponse } from 'next/server';

function buildWhereClause(sp: URLSearchParams): { whereClause: string; queryParams: unknown[] } {
  const whereClauses: string[] = [];
  const queryParams: unknown[] = [];

  const tab = sp.get('tab') || 'New';
  const q = sp.get('q') || '';
  const leadFilter = sp.get('lead') || '';
  const statusFilter = sp.get('status') || '';
  const phoneParam = sp.get('phone') || 'present';
  const statesParam = sp.get('states') || '';
  const lcFrom = sp.get('lcFrom') || '';
  const lcTo = sp.get('lcTo') || '';
  const filingMin = sp.get('filingMin') || '';

  if (tab !== 'All') {
    whereClauses.push('b.status = ?');
    queryParams.push(tab);
  }

  if (statusFilter) {
    whereClauses.push('b.status = ?');
    queryParams.push(statusFilter);
  }

  if (q) {
    const sq = `%${q}%`;
    whereClauses.push(
      `(b.name LIKE ? OR EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = b.id AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.name LIKE ?)) OR EXISTS (SELECT 1 FROM phones p WHERE p.business_id = b.id AND p.phone LIKE ?))`
    );
    queryParams.push(sq, sq, sq, sq, sq);
  }

  if (leadFilter) {
    const lq = `%${leadFilter}%`;
    whereClauses.push(
      `(b.name LIKE ? OR EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = b.id AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.name LIKE ?)))`
    );
    queryParams.push(lq, lq, lq, lq);
  }

  const phoneValues = phoneParam ? phoneParam.split(',').filter(Boolean) : [];
  const hasPresent = phoneValues.includes('present');
  const hasMissing = phoneValues.includes('missing');
  if (hasPresent && !hasMissing) {
    whereClauses.push(
      `EXISTS (SELECT 1 FROM phones p WHERE p.business_id = b.id AND p.type = 'primary' AND p.phone IS NOT NULL AND TRIM(p.phone) != '')`
    );
  } else if (hasMissing && !hasPresent) {
    whereClauses.push(
      `NOT EXISTS (SELECT 1 FROM phones p WHERE p.business_id = b.id AND p.type = 'primary' AND p.phone IS NOT NULL AND TRIM(p.phone) != '')`
    );
  }

  const selectedStates = statesParam ? statesParam.split(',').filter(Boolean) : [];
  if (selectedStates.length > 0) {
    const placeholders = selectedStates.map(() => '?').join(', ');
    whereClauses.push(
      `(SELECT f.state FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) IN (${placeholders})`
    );
    queryParams.push(...selectedStates);
  }

  if (lcFrom) {
    whereClauses.push('b.last_called_ts IS NOT NULL AND DATE(b.last_called_ts) >= ?');
    queryParams.push(lcFrom);
  }
  if (lcTo) {
    whereClauses.push('b.last_called_ts IS NOT NULL AND DATE(b.last_called_ts) <= ?');
    queryParams.push(lcTo);
  }

  if (filingMin) {
    whereClauses.push(
      `(SELECT f.filing_date FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) >= ?`
    );
    queryParams.push(filingMin);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereClause, queryParams };
}

const EXPORT_SELECT = `
  SELECT
    b.id AS business_id,
    b.name AS business_name,
    (SELECT f.document_id FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) AS filing_id,
    (SELECT f.filing_date FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) AS filing_date,
    (SELECT f.state FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) AS state,
    (SELECT f.secured_party FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) AS lender_name,
    (
      SELECT COALESCE(
        NULLIF(TRIM(c.name), ''),
        NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '')
      )
      FROM contacts c
      WHERE c.business_id = b.id
        AND EXISTS (SELECT 1 FROM phones p WHERE p.contact_id = c.id AND p.phone IS NOT NULL AND TRIM(p.phone) != '')
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(c.role, '')) LIKE '%owner%' THEN 0
          WHEN LOWER(COALESCE(c.role, '')) LIKE '%member%' THEN 1
          ELSE 2
        END, c.id ASC
      LIMIT 1
    ) AS contact_name,
    (
      SELECT c.role
      FROM contacts c
      WHERE c.business_id = b.id
        AND EXISTS (SELECT 1 FROM phones p WHERE p.contact_id = c.id AND p.phone IS NOT NULL AND TRIM(p.phone) != '')
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(c.role, '')) LIKE '%owner%' THEN 0
          WHEN LOWER(COALESCE(c.role, '')) LIKE '%member%' THEN 1
          ELSE 2
        END, c.id ASC
      LIMIT 1
    ) AS contact_title,
    (
      SELECT p.phone
      FROM contacts c
      JOIN phones p ON p.contact_id = c.id
      WHERE c.business_id = b.id
        AND p.phone IS NOT NULL AND TRIM(p.phone) != ''
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(c.role, '')) LIKE '%owner%' THEN 0
          WHEN LOWER(COALESCE(c.role, '')) LIKE '%member%' THEN 1
          ELSE 2
        END, c.id ASC, p.id ASC
      LIMIT 1
    ) AS phone_number,
    (
      SELECT p.type
      FROM contacts c
      JOIN phones p ON p.contact_id = c.id
      WHERE c.business_id = b.id
        AND p.phone IS NOT NULL AND TRIM(p.phone) != ''
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(c.role, '')) LIKE '%owner%' THEN 0
          WHEN LOWER(COALESCE(c.role, '')) LIKE '%member%' THEN 1
          ELSE 2
        END, c.id ASC, p.id ASC
      LIMIT 1
    ) AS phone_type
  FROM businesses b
`;

function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function normalizeDateField(row: Record<string, unknown>, field: string) {
  const val = row[field];
  if (val instanceof Date) {
    row[field] = val.toISOString().split('T')[0];
  } else if (typeof val === 'string' && val.includes('T')) {
    row[field] = val.split('T')[0];
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDbConnection();
  const sp = request.nextUrl.searchParams;
  const { whereClause, queryParams } = buildWhereClause(sp);

  const isSample = sp.get('sample') === '1';

  if (isSample) {
    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM businesses b ${whereClause}`,
      queryParams
    );
    const total = (countResult as { total: number }[])[0].total;
    if (total === 0) {
      return NextResponse.json({ row: null, total: 0 });
    }
    const sampleOffset = Math.min(
      Math.max(parseInt(sp.get('sampleOffset') || '0', 10), 0),
      total - 1
    );
    const [rows] = await db.execute(
      `${EXPORT_SELECT} ${whereClause} ORDER BY b.id DESC LIMIT 1 OFFSET ?`,
      [...queryParams, sampleOffset]
    );
    const row = (rows as Record<string, unknown>[])[0] ?? null;
    if (row) normalizeDateField(row, 'filing_date');
    return NextResponse.json({ row, total });
  }

  // Full CSV export
  const columnMapParam = sp.get('columns');
  const defaultColumnMap: Record<string, string> = {
    business_id: 'Business ID',
    business_name: 'Business Name',
    filing_id: 'Filing ID',
    filing_date: 'Filing Date',
    state: 'State',
    lender_name: 'Lender Name',
    contact_name: 'Contact Name',
    contact_title: 'Contact Title',
    phone_number: 'Phone Number',
    phone_type: 'Phone Type',
  };
  let columnMap = defaultColumnMap;
  if (columnMapParam) {
    try {
      const parsed: unknown = JSON.parse(columnMapParam);
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Object.values(parsed).every((v) => typeof v === 'string')
      ) {
        columnMap = parsed as Record<string, string>;
      }
    } catch {
      // use defaults
    }
  }

  const [rows] = await db.execute(
    `${EXPORT_SELECT} ${whereClause} ORDER BY b.id DESC`,
    queryParams
  );

  const dataRows = rows as Record<string, unknown>[];
  for (const row of dataRows) {
    normalizeDateField(row, 'filing_date');
  }

  const fieldKeys = Object.keys(columnMap);
  const headerRow = fieldKeys.map((k) => escapeCSVValue(columnMap[k])).join(',');
  const csvRows = dataRows.map((row) =>
    fieldKeys.map((k) => escapeCSVValue(row[k])).join(',')
  );

  const csv = [headerRow, ...csvRows].join('\r\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ucc-leads-export.csv"`,
    },
  });
}
