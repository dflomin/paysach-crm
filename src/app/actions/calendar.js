'use server'
import { google } from 'googleapis';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDbConnection } from '@/lib/db';

export async function scheduleCalendarEvent(businessId, businessName, dateIsoString) {
  const session = await getServerSession(authOptions);
  if (!session || !session.accessToken) throw new Error('Unauthorized');

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: session.accessToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const crmUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const startTime = new Date(dateIsoString);
  const endTime = new Date(startTime.getTime() + 30 * 60000);

  const event = {
    summary: `Call ${businessName}`,
    description: `CRM Link: ${crmUrl}/?leadId=${businessId}`,
    start: { dateTime: startTime.toISOString() },
    end: { dateTime: endTime.toISOString() }
  };

  try {
    const response = await calendar.events.insert({ calendarId: 'primary', resource: event });
    const db = getDbConnection();
    await db.execute(
      'INSERT INTO notes (business_id, body, is_system_generated) VALUES (?, ?, 1)',
      [businessId, `Scheduled Google Calendar Follow-up`]
    );
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to sync' };
  }
}