import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { redirect } from 'next/navigation';
import AnalyticsClient from './analytics-client';

export const metadata = { title: 'Analytics — UCC Dialer CRM' };

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/api/auth/signin');

  return <AnalyticsClient />;
}
