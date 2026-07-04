import { google } from 'googleapis';

/**
 * Represents a busy time slot from Google Calendar.
 */
export interface BusySlot {
  summary: string;
  start: string; // ISO 8601
  end: string;   // ISO 8601
}

/**
 * Checks if Google Calendar credentials are configured.
 */
function isGoogleCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CALENDAR_ID &&
    process.env.GOOGLE_CLIENT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

/**
 * Google Calendar Client: Fetches upcoming events for a given date range
 * using JWT-authorized service account credentials.
 *
 * In test mode, returns mock busy slots for testing the scheduling pipeline.
 *
 * @param startDate - ISO date string for the range start (inclusive)
 * @param endDate - ISO date string for the range end (inclusive)
 * @returns Array of BusySlot objects representing occupied time windows
 */
export async function fetchUpcomingEvents(
  startDate: string,
  endDate: string
): Promise<BusySlot[]> {
  if (process.env.NODE_ENV === 'test') {
    console.log(`[GCal Mock] Fetching events from ${startDate} to ${endDate}`);
    return [
      {
        summary: 'Team Standup',
        start: `${startDate}T09:00:00+08:00`,
        end: `${startDate}T09:30:00+08:00`,
      },
      {
        summary: 'Client Meeting',
        start: `${startDate}T14:00:00+08:00`,
        end: `${startDate}T15:00:00+08:00`,
      },
    ];
  }

  if (!isGoogleCalendarConfigured()) {
    console.warn('[GCal] Google Calendar not configured, skipping.');
    return [];
  }

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_CLIENT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: new Date(startDate).toISOString(),
    timeMax: new Date(endDate).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });

  const events = response.data.items ?? [];
  return events
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      summary: e.summary ?? '(No title)',
      start: e.start!.dateTime!,
      end: e.end!.dateTime!,
    }));
}
