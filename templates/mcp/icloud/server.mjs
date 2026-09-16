import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  listCalendars,
  getEvents,
  createEvent,
  listReminders,
  createReminder,
} from './client.mjs';

const server = new Server(
  {
    name: 'icloud-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'icloud_list_calendars',
        description: 'List all iCloud calendars and reminder lists.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'icloud_get_events',
        description: 'Get events from iCloud calendar.',
        inputSchema: {
          type: 'object',
          properties: {
            calendarName: { type: 'string', description: 'Filter by calendar name' },
            start: { type: 'string', description: 'ISO start date' },
            end: { type: 'string', description: 'ISO end date' },
          },
        },
      },
      {
        name: 'icloud_create_event',
        description: 'Create a new event in an iCloud calendar.',
        inputSchema: {
          type: 'object',
          properties: {
            calendarName: { type: 'string', description: 'Target calendar name (optional)' },
            summary: { type: 'string', description: 'Title of the event' },
            description: { type: 'string', description: 'Description / notes' },
            location: { type: 'string', description: 'Location string' },
            start: { type: 'string', description: 'ISO start date time (e.g. 2026-09-13T10:00:00Z)' },
            end: { type: 'string', description: 'ISO end date time (e.g. 2026-09-13T11:00:00Z)' },
          },
          required: ['summary', 'start', 'end'],
        },
      },
      {
        name: 'icloud_list_reminders',
        description: 'List reminders / tasks from iCloud Reminders lists.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'icloud_create_reminder',
        description: 'Create a new reminder / task in iCloud Reminders.',
        inputSchema: {
          type: 'object',
          properties: {
            listName: { type: 'string', description: 'Name of Reminders list' },
            summary: { type: 'string', description: 'Reminder task title' },
            description: { type: 'string', description: 'Detailed notes' },
            due: { type: 'string', description: 'Due date time ISO string' },
          },
          required: ['summary'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'icloud_list_calendars') {
      const cals = await listCalendars();
      return { content: [{ type: 'text', text: JSON.stringify(cals, null, 2) }] };
    }
    if (name === 'icloud_get_events') {
      const events = await getEvents(args || {});
      return { content: [{ type: 'text', text: JSON.stringify(events, null, 2) }] };
    }
    if (name === 'icloud_create_event') {
      const res = await createEvent(args);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    }
    if (name === 'icloud_list_reminders') {
      const reminders = await listReminders();
      return { content: [{ type: 'text', text: JSON.stringify(reminders, null, 2) }] };
    }
    if (name === 'icloud_create_reminder') {
      const res = await createReminder(args);
      return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text', text: err.message || String(err) }],
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch((err) => {
  console.error("Fatal server error:", err);
  process.exit(1);
});
