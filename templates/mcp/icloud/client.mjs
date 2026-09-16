import { DAVClient } from 'tsdav';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';

const envFile = process.env.ICLOUD_CONFIG_FILE || path.join(os.homedir(), '.icloud_credentials.env');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

export function getCredentials() {
  const username = process.env.ICLOUD_APPLE_ID;
  const password = process.env.ICLOUD_APP_PASSWORD;
  if (!username || !password) {
    throw new Error(`AUTH_REQUIRED: Missing credentials. Run /home/cam/icloud-mcp/configure.py or set ICLOUD_APPLE_ID and ICLOUD_APP_PASSWORD in ${envFile}`);
  }
  return { username, password };
}

let davClient = null;

export async function getDAVClient() {
  if (davClient) return davClient;
  const { username, password } = getCredentials();
  
  const client = new DAVClient({
    serverUrl: 'https://caldav.icloud.com',
    credentials: {
      username,
      password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });

  await client.login();
  davClient = client;
  return davClient;
}

export async function listCalendars() {
  const client = await getDAVClient();
  const calendars = await client.fetchCalendars();
  return calendars.map(cal => ({
    name: cal.displayName,
    url: cal.url,
    components: cal.components,
  }));
}

export async function getEvents(options = {}) {
  const client = await getDAVClient();
  const calendars = await client.fetchCalendars();
  const caldavCalendars = calendars.filter(c => !c.components || c.components.includes('VEVENT'));
  
  let allEvents = [];
  for (const cal of caldavCalendars) {
    if (options.calendarName && cal.displayName.toLowerCase() !== options.calendarName.toLowerCase()) {
      continue;
    }
    const calendarObjects = await client.fetchCalendarObjects({
      calendar: cal,
      timeRange: options.start && options.end ? {
        start: new Date(options.start).toISOString(),
        end: new Date(options.end).toISOString(),
      } : undefined,
    });

    for (const obj of calendarObjects) {
      allEvents.push({
        calendar: cal.displayName,
        url: obj.url,
        data: obj.data,
      });
    }
  }
  return allEvents;
}

export async function createEvent({ calendarName, summary, description, location, start, end }) {
  const client = await getDAVClient();
  const calendars = await client.fetchCalendars();
  let targetCal = calendars.find(c => (!c.components || c.components.includes('VEVENT')) && (!calendarName || c.displayName.toLowerCase() === calendarName.toLowerCase()));

  if (!targetCal) {
    targetCal = calendars.find(c => !c.components || c.components.includes('VEVENT'));
  }
  if (!targetCal) throw new Error("No VEVENT calendar found in iCloud");

  const uid = 'mcp-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const startStr = new Date(start).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const endStr = new Date(end).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const icsData = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Antigravity//iCloud MCP Server//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${summary}`,
    description ? `DESCRIPTION:${description}` : '',
    location ? `LOCATION:${location}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  const created = await client.createCalendarObject({
    calendar: targetCal,
    filename: `${uid}.ics`,
    iCalString: icsData,
  });

  return { success: true, calendar: targetCal.displayName, uid, filename: `${uid}.ics` };
}

// Reminder lists readable/writable over CalDAV. Apple marks lists upgraded to the
// newer Reminders format with '⚠️' in the CalDAV displayName; those only ever serve a
// placeholder stub, so writes to them land nowhere visible in the Reminders app.
// ponytail: name-based detection. If Apple changes the marker, switch to probing for
// the "upgraded these reminders" stub item instead.
async function reminderLists(client) {
  const calendars = await client.fetchCalendars();
  return calendars.filter(c => c.components?.includes('VTODO') && !c.displayName.includes('⚠️'));
}

export async function listReminders() {
  const client = await getDAVClient();
  const reminderCals = await reminderLists(client);

  let allReminders = [];
  for (const cal of reminderCals) {
    // iCloud returns nothing for an unfiltered fetch on a VTODO collection.
    const objects = await client.fetchCalendarObjects({
      calendar: cal,
      filters: [{ 'comp-filter': { _attributes: { name: 'VCALENDAR' }, 'comp-filter': { _attributes: { name: 'VTODO' } } } }],
    });
    for (const obj of objects) {
      allReminders.push({
        list: cal.displayName,
        url: obj.url,
        data: obj.data,
      });
    }
  }
  return allReminders;
}

export async function createReminder({ listName, summary, description, due }) {
  const client = await getDAVClient();
  const reminderCals = await reminderLists(client);

  let targetList = reminderCals.find(c => listName && c.displayName.toLowerCase() === listName.toLowerCase());
  if (!targetList && listName) {
    throw new Error(`List "${listName}" is not writable over CalDAV. Available: ${reminderCals.map(c => c.displayName).join(', ') || 'none'}`);
  }
  if (!targetList) targetList = reminderCals[0];
  if (!targetList) throw new Error("No CalDAV-writable Reminders list found in iCloud");

  const uid = 'reminder-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dueStr = due ? new Date(due).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z' : null;

  const icsData = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Antigravity//iCloud MCP Server//EN',
    'BEGIN:VTODO',
    `UID:${uid}`,
    `DTSTAMP:${nowStr}`,
    `SUMMARY:${summary}`,
    description ? `DESCRIPTION:${description}` : '',
    dueStr ? `DUE:${dueStr}` : '',
    'STATUS:NEEDS-ACTION',
    'END:VTODO',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  await client.createCalendarObject({
    calendar: targetList,
    filename: `${uid}.ics`,
    iCalString: icsData,
  });

  return { success: true, list: targetList.displayName, uid };
}
