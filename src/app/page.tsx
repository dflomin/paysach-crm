import { getDbConnection } from "@/lib/db";
import { dedupeBusinessRowsExact } from "@/lib/dedupe";
import { Briefcase, LogIn } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import CrmClient from "./crm-client";

const CONTACT_NAME_SUBQUERY = `(
  SELECT COALESCE(
    NULLIF(TRIM(c.name), ''),
    NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '')
  )
  FROM contacts c
  WHERE c.business_id = b.id
  ORDER BY
    CASE
      WHEN LOWER(COALESCE(c.role, '')) LIKE '%owner%' THEN 0
      WHEN LOWER(COALESCE(c.role, '')) LIKE '%member%' THEN 1
      ELSE 2
    END,
    c.id ASC
  LIMIT 1
) as contact_name`;

// Safe sort column whitelist to prevent SQL injection
const SORT_COLUMN_MAP: Record<string, string> = {
  lead: 'b.name',
  phone: 'primary_phone',
  status: 'b.status',
  state: 'filing_state',
  lastCalled: 'b.last_called_ts',
  filedDate: 'most_recent_filing_date',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const db = getDbConnection();
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="flex justify-center text-blue-600">
            <Briefcase size={48} strokeWidth={1.5} />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">UCC Dialer CRM</h2>
          <p className="mt-2 text-center text-sm text-slate-600">Secure access restricted to authorized users.</p>
        </div>
        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-200">
            <a href="/api/auth/signin" className="w-full flex justify-center items-center py-2.5 px-4 border border-slate-300 rounded-md shadow-sm bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <LogIn className="mr-2" size={18} />
              Sign in with Google
            </a>
          </div>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const getString = (key: string, def = '') =>
    typeof sp[key] === 'string' ? (sp[key] as string) : def;

  const tab         = getString('tab', 'New');
  const q           = getString('q');
  const leadId      = getString('leadId') || null;
  const leadFilter  = getString('lead');
  const statusFilter = getString('status');
  const phoneParam  = getString('phone', 'present');
  const statesParam = getString('states');
  const lcFrom      = getString('lcFrom');
  const lcTo        = getString('lcTo');
  const filingMin   = getString('filingMin');
  const sortParam   = getString('sort', 'lastCalled');
  const dirParam    = getString('dir', 'desc');

  const requestedPage = Number.parseInt(getString('page', '1'), 10);
  const pageSize = 25;
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  // --- Build WHERE conditions ---
  const whereClauses: string[] = [];
  const queryParams: any[] = [];

  // Tab / status filter
  if (tab !== 'All') {
    whereClauses.push('b.status = ?');
    queryParams.push(tab);
  }

  // Status column filter (additional, works alongside tab)
  if (statusFilter) {
    whereClauses.push('b.status = ?');
    queryParams.push(statusFilter);
  }

  // Full-text search (name, contacts, phones)
  if (q) {
    const sq = `%${q}%`;
    whereClauses.push(
      `(b.name LIKE ? OR EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = b.id AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.name LIKE ?)) OR EXISTS (SELECT 1 FROM phones p WHERE p.business_id = b.id AND p.phone LIKE ?))`
    );
    queryParams.push(sq, sq, sq, sq, sq);
  }

  // Lead column text filter (name + contact name)
  if (leadFilter) {
    const lq = `%${leadFilter}%`;
    whereClauses.push(
      `(b.name LIKE ? OR EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = b.id AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.name LIKE ?)))`
    );
    queryParams.push(lq, lq, lq, lq);
  }

  // Phone presence filter
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
  // If both or neither selected: no phone condition (all pass)

  // Filing state multi-select filter
  const selectedStates = statesParam ? statesParam.split(',').filter(Boolean) : [];
  if (selectedStates.length > 0) {
    const placeholders = selectedStates.map(() => '?').join(', ');
    whereClauses.push(
      `(SELECT f.state FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) IN (${placeholders})`
    );
    queryParams.push(...selectedStates);
  }

  // Last called date range
  if (lcFrom) {
    whereClauses.push('b.last_called_ts IS NOT NULL AND DATE(b.last_called_ts) >= ?');
    queryParams.push(lcFrom);
  }
  if (lcTo) {
    whereClauses.push('b.last_called_ts IS NOT NULL AND DATE(b.last_called_ts) <= ?');
    queryParams.push(lcTo);
  }

  // Filing date minimum
  if (filingMin) {
    whereClauses.push(
      `(SELECT f.filing_date FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) >= ?`
    );
    queryParams.push(filingMin);
  }

  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  // --- Sort ---
  const sortCol = SORT_COLUMN_MAP[sortParam] ?? 'b.last_called_ts';
  const sortDir = dirParam === 'asc' ? 'ASC' : 'DESC';
  // NULLs last: `col IS NULL` = 0 for non-null, 1 for null → ascending keeps non-nulls first
  const orderByClause = `ORDER BY ${sortCol} IS NULL, ${sortCol} ${sortDir}, b.id DESC`;

  // Run all rows + state list in parallel (no SQL pagination — dedup happens in JS)
  const [businessResult, stateResult] = await Promise.all([
    db.execute(
      `SELECT b.*,
        ${CONTACT_NAME_SUBQUERY},
        (SELECT phone FROM phones p WHERE p.business_id = b.id AND p.type = 'primary' LIMIT 1) as primary_phone,
        (SELECT is_dead FROM phones p WHERE p.business_id = b.id AND p.type = 'primary' LIMIT 1) as primary_phone_dead,
        (SELECT f.state FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) as filing_state,
        (SELECT f.filing_date FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) as most_recent_filing_date,
        (SELECT a.address FROM addresses a WHERE a.business_id = b.id LIMIT 1) as business_address
      FROM businesses b
      ${whereClause}
      ${orderByClause}`,
      queryParams
    ),
    db.execute(
      `SELECT DISTINCT state FROM filings WHERE state IS NOT NULL AND TRIM(state) != '' ORDER BY state`
    ),
  ]);

  const allMatchingBusinesses = businessResult[0] as any[];
  const allStateOptions = (stateResult[0] as any[]).map((r: any) => r.state as string);

  // Apply fast in-memory deduplication (exact name + exact phone only).
  // Fuzzy name/address checks are intentionally skipped here for performance;
  // the full fuzzy dedupe still runs in the CSV export.
  const deduped = dedupeBusinessRowsExact(allMatchingBusinesses, {
    nameField: 'name',
    phoneField: 'primary_phone',
  });

  const totalCount = deduped.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const offset = (safePage - 1) * pageSize;
  const businesses = deduped.slice(offset, offset + pageSize);

  // --- Fetch selected lead details ---
  let selectedLead = null;
  let phones: any[] = [];
  let contacts: any[] = [];
  let filings: any[] = [];
  let notes: any[] = [];

  if (leadId) {
    const [leadRows] = await db.execute(
      `SELECT b.*, ${CONTACT_NAME_SUBQUERY} FROM businesses b WHERE b.id = ?`,
      [leadId]
    );
    selectedLead = (leadRows as any[])[0] || null;

    if (selectedLead) {
      const [phoneRows] = await db.execute('SELECT * FROM phones WHERE business_id = ? ORDER BY type ASC', [leadId]);
      phones = phoneRows as any[];

      const [contactRows] = await db.execute('SELECT * FROM contacts WHERE business_id = ? ORDER BY id ASC', [leadId]);
      contacts = contactRows as any[];

      const [filingRows] = await db.execute('SELECT * FROM filings WHERE business_id = ? ORDER BY filing_date DESC', [leadId]);
      filings = filingRows as any[];

      const [noteRows] = await db.execute('SELECT * FROM notes WHERE business_id = ? ORDER BY created_ts DESC', [leadId]);
      notes = noteRows as any[];
    }
  }

  const sanitizeData = (data: any) => JSON.parse(JSON.stringify(data));

  return (
    <CrmClient
      businesses={sanitizeData(businesses)}
      selectedLead={sanitizeData(selectedLead)}
      phones={sanitizeData(phones)}
      contacts={sanitizeData(contacts)}
      filings={sanitizeData(filings)}
      notes={sanitizeData(notes)}
      totalCount={totalCount}
      pageSize={pageSize}
      initialTab={tab}
      initialQuery={q}
      initialLead={leadFilter}
      initialStatus={statusFilter}
      initialPhone={phoneParam}
      initialStates={statesParam}
      initialLcFrom={lcFrom}
      initialLcTo={lcTo}
      initialFilingMin={filingMin}
      initialSort={sortParam}
      initialDir={dirParam}
      initialPage={page}
      allStateOptions={sanitizeData(allStateOptions)}
    />
  );
}