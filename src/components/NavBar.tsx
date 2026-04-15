import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Briefcase, BarChart2 } from 'lucide-react';

const NAV_LINKS = [
  { href: '/',           label: 'CRM',       icon: Briefcase },
  { href: '/analytics',  label: 'Analytics', icon: BarChart2 },
];

export default async function NavBar() {
  const session = await getServerSession(authOptions);
  if (!session) return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex h-12 max-w-screen-2xl items-center gap-1 px-4">
        {/* Brand */}
        <span className="mr-4 flex items-center gap-1.5 font-semibold text-slate-800 text-sm select-none">
          <Briefcase size={16} className="text-blue-600" strokeWidth={2} />
          UCC Dialer CRM
        </span>

        {/* Page links */}
        {NAV_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <Icon size={14} strokeWidth={2} />
            {label}
          </Link>
        ))}

        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
          <span className="hidden sm:block">{session.user?.email}</span>
          <Link
            href="/api/auth/signout"
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Sign out
          </Link>
        </div>
      </div>
    </nav>
  );
}
