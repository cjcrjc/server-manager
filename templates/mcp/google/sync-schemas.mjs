import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const targetDir = path.join(os.homedir(), ".gemini", "antigravity-cli", "mcp", "google");
fs.mkdirSync(targetDir, { recursive: true });

const instructions = `Google Workspace MCP Server. Provides full access to Google Calendar, Gmail, Google Drive, Google Docs, Google Sheets, and Google Tasks across connected Google accounts. Always confirm user intent before sending messages or deleting entries.`;

fs.writeFileSync(path.join(targetDir, "instructions.md"), instructions, "utf-8");

const tools = [
  {
    name: "google_status",
    description: "Check Google Workspace MCP authentication status and connected accounts.",
    parameters: {
      type: "object",
      properties: {
        account: { type: "string", description: "Optional account alias (e.g. personal, work)" }
      }
    }
  },
  {
    name: "google_calendar_list_events",
    description: "List events from Google Calendar within a date range.",
    parameters: {
      type: "object",
      properties: {
        account: { type: "string", description: "Account alias" },
        calendarId: { type: "string", description: "Calendar ID (default: primary)" },
        timeMin: { type: "string", description: "ISO start date/time" },
        timeMax: { type: "string", description: "ISO end date/time" },
        query: { type: "string", description: "Search query string" }
      }
    }
  },
  {
    name: "google_calendar_create_event",
    description: "Create a new event in Google Calendar.",
    parameters: {
      type: "object",
      properties: {
        account: { type: "string", description: "Account alias" },
        calendarId: { type: "string", description: "Calendar ID (default: primary)" },
        summary: { type: "string", description: "Event title/summary" },
        description: { type: "string", description: "Event description" },
        start: { type: "string", description: "ISO start date/time" },
        end: { type: "string", description: "ISO end date/time" },
        attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses" }
      },
      required: ["summary", "start", "end"]
    }
  },
  {
    name: "google_gmail_list_messages",
    description: "Search and list messages from Gmail inbox.",
    parameters: {
      type: "object",
      properties: {
        account: { type: "string", description: "Account alias" },
        query: { type: "string", description: "Gmail search query (e.g. is:unread, from:boss)" },
        maxResults: { type: "number", description: "Max messages to return (default: 10)" }
      }
    }
  },
  {
    name: "google_gmail_send_message",
    description: "Send an email message using Gmail.",
    parameters: {
      type: "object",
      properties: {
        account: { type: "string", description: "Account alias" },
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body content" }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "google_drive_list_files",
    description: "List files and folders in Google Drive.",
    parameters: {
      type: "object",
      properties: {
        account: { type: "string", description: "Account alias" },
        query: { type: "string", description: "Drive search query" },
        pageSize: { type: "number", description: "Max results" }
      }
    }
  },
  {
    name: "google_docs_get_document",
    description: "Read text and structure from a Google Document.",
    parameters: {
      type: "object",
      properties: {
        account: { type: "string", description: "Account alias" },
        documentId: { type: "string", description: "Google Doc ID" }
      },
      required: ["documentId"]
    }
  },
  {
    name: "google_tasks_list",
    description: "List tasks from Google Tasks lists.",
    parameters: {
      type: "object",
      properties: {
        account: { type: "string", description: "Account alias" },
        tasklist: { type: "string", description: "Task list ID (default: @default)" }
      }
    }
  }
];

for (const tool of tools) {
  const filePath = path.join(targetDir, `${tool.name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(tool, null, 2), "utf-8");
}

console.log(`Synced ${tools.length} Google Workspace MCP tool schemas to ${targetDir}`);
