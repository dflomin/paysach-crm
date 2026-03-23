import { getDbConnection } from "@/lib/db";
import { Briefcase, LogIn } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/route";
import { CrmClient } from "./crm-client";

export default async function ({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
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

  const tab = typeof searchParams.tab === 'string' ? searchParams.tab : 'All';
  const q = typeof searchParams.q === 'string' ? searchParams.q : '';
  const leadId = typeof searchParams.leadId === 'string' ? searchParams.leadId : null;

  const db = getDbConnection();

  const searchQuery = `%${q}%`;
  // ACTUAL DB QUERY
  const [businesses] = await db.execute(`
    SELECT b.*,
      (SELECT phone FROM phones p WHERE p.business_id = b.id AND p.type = 'primary' LIMIT 1) as primary_phone,
      (SELECT is_dead FROM phones p WHERE p.business_id = b.id AND p.type = 'primary' LIMIT 1) as primary_phone_dead
    FROM businesses b
    WHERE (? = 'All' OR b.status = ?)
    AND (b.name LIKE ? OR b.contact_name LIKE ?)
    ORDER BY b.last_called_ts DESC, b.insert_ts DESC
    LIMIT 100
  `, [tab, tab, searchQuery, searchQuery]);

  let selectedLead = null;
  let phones: any[] = [];
  let filings: any[] = [];
  let notes: any[] = [];

  if (leadId) {
    const [leadRows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [leadId]);
    selectedLead = (leadRows as any[])[0] || null;

    if (selectedLead) {
      const [phoneRows] = await db.execute('SELECT * FROM phones WHERE business_id = ? ORDER BY type ASC', [leadId]);
      phones = phoneRows as any[];

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
      filings={sanitizeData(filings)}
      notes={sanitizeData(notes)}
      initialTab={tab}
      initialQuery={q}
    />
  );
}