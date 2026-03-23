import { getDbConnection } from "@/lib/db";
import { Briefcase, LogIn } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import CrmClient from "./crm-client";

export default async function ({
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

  const searchParameters = await searchParams;
  const tab = typeof searchParameters.tab === 'string' ? searchParameters.tab : 'New';
  const q = typeof searchParameters.q === 'string' ? searchParameters.q : '';
  const leadId = typeof searchParameters.leadId === 'string' ? searchParameters.leadId : null;
  const requestedPage = typeof searchParameters.page === 'string' ? Number.parseInt(searchParameters.page, 10) : 1;
  const pageSize = 25;
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const searchQuery = `%${q}%`;

  // Fetch full result set for current tab/search. Client applies filters/sort/paging.
  const [businesses] = await db.execute(`
    SELECT b.*,
      (
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
      ) as contact_name,
      (SELECT phone FROM phones p WHERE p.business_id = b.id AND p.type = 'primary' LIMIT 1) as primary_phone,
      (SELECT is_dead FROM phones p WHERE p.business_id = b.id AND p.type = 'primary' LIMIT 1) as primary_phone_dead,
      (SELECT f.state FROM filings f WHERE f.business_id = b.id ORDER BY f.filing_date DESC, f.id DESC LIMIT 1) as filing_state
    FROM businesses b
    WHERE (? = 'All' OR b.status = ?)
    AND (
      b.name LIKE ? OR 
      EXISTS (SELECT 1 FROM contacts c WHERE c.business_id = b.id AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.name LIKE ?)) OR
      EXISTS (SELECT 1 FROM phones p WHERE p.business_id = b.id AND p.phone LIKE ?)
    )
    ORDER BY b.last_called_ts DESC, b.insert_ts DESC
  `, [
    tab, tab,
    searchQuery, // matches b.name
    searchQuery, searchQuery, searchQuery, // matches contacts
    searchQuery, // matches phones
  ]);

  const totalCount = (businesses as any[]).length;

  // 4. Fetch Selected Lead Details
  let selectedLead = null;
  let phones: any[] = [];
  let contacts: any[] = [];
  let filings: any[] = [];
  let notes: any[] = [];

  if (leadId) {
    const [leadRows] = await db.execute(`
      SELECT b.*, 
      (
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
      ) as contact_name
      FROM businesses b WHERE b.id = ?
    `, [leadId]);
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
      initialTab={tab}
      initialQuery={q}
      initialPage={page}
      pageSize={pageSize}
      totalCount={totalCount}
    />
  );
}