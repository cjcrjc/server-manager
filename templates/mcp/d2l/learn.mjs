import { readFile, stat, mkdir, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'dotenv';
import ICAL from 'ical.js';
import { LearnError } from './learn-error.mjs';
import { loginToLearn } from './auth.mjs';

export { LearnError };
export const BASE = 'https://learn.uwaterloo.ca';

export async function loadConfig() {
  const file = process.env.LEARN_CONFIG_FILE || join(homedir(), '.learn_cookies.env');
  let values = {};
  try {
    const info = await stat(file);
    if (info.mode & 0o077) throw new LearnError('CONFIG_PERMISSIONS', 'Run chmod 600 on the LEARN credentials file.');
    values = parse(await readFile(file));
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const get = key => process.env[key] || values[key] || '';
  return {
    session: get('d2lSessionVal') || get('D2L_SESSION_VAL'),
    secureSession: get('d2lSecureSessionVal') || get('D2L_SECURE_SESSION_VAL'),
    feed: get('LEARN_ICAL_URL'),
    username: get('WATERLOO_USERNAME') || get('D2L_USERNAME') || get('LEARN_USERNAME'),
    password: get('WATERLOO_PASSWORD') || get('D2L_PASSWORD') || get('LEARN_PASSWORD'),
    authCookies: get('AUTH_COOKIES') || get('DUO_COOKIES'),
    ntfyTopic: get('NTFY_TOPIC') || get('NTFY_URL'),
    lp: get('LEARN_LP_VERSION'),
    le: get('LEARN_LE_VERSION'),
    file
  };
}

export async function saveCookies(session, secureSession, targetFile, authCookies = null) {
  const file = targetFile || process.env.LEARN_CONFIG_FILE || join(homedir(), '.learn_cookies.env');
  let current = {};
  try {
    current = parse(await readFile(file));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  current.d2lSessionVal = session;
  current.d2lSecureSessionVal = secureSession;
  if (authCookies !== null && authCookies !== undefined) {
    current.AUTH_COOKIES = typeof authCookies === 'string' ? authCookies : JSON.stringify(authCookies);
  }

  let content = '';
  for (const [k, v] of Object.entries(current)) {
    content += `${k}=${JSON.stringify(v)}\n`;
  }
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, content, { mode: 0o600 });
  await rename(tmp, file);
}

export function range(start, end) {
  const a = new Date(start), b = new Date(end);
  if (!Number.isFinite(+a) || !Number.isFinite(+b) || a >= b || b - a > 366 * 86400000)
    throw new LearnError('INVALID_RANGE', 'Supply an ordered ISO date range of at most 366 days.');
  return { startDateTime: a.toISOString(), endDateTime: b.toISOString() };
}

export function id(value) {
  if (!/^\d+$/.test(String(value))) throw new LearnError('INVALID_ID', 'Expected a numeric D2L identifier.');
  return String(value);
}

function items(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Items)) return data.Items;
  if (Array.isArray(data?.Objects)) return data.Objects;
  throw new LearnError('UNEXPECTED_RESPONSE', 'LEARN returned an unexpected list format.');
}

export class LearnClient {
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetcher = fetcher;
  }

  hasSession() { return Boolean(this.config.session && this.config.secureSession); }
  hasCredentials() { return Boolean(this.config.username && this.config.password); }

  async login(onStatus = () => {}, passcode = null) {
    if (!this.hasCredentials()) {
      throw new LearnError('AUTH_REQUIRED', 'Waterloo username and password not configured in ~/.learn_cookies.env. Run configure.py or set WATERLOO_USERNAME and WATERLOO_PASSWORD.');
    }
    const { session, secureSession, cookies } = await loginToLearn(
      {
        username: this.config.username,
        password: this.config.password,
        initialCookies: this.config.authCookies,
        passcode,
        ntfyTopic: this.config.ntfyTopic
      },
      { onStatus, fetcher: this.fetcher }
    );
    this.config.session = session;
    this.config.secureSession = secureSession;
    if (cookies) {
      this.config.authCookies = typeof cookies === 'string' ? cookies : JSON.stringify(cookies);
    }
    await saveCookies(session, secureSession, this.config.file, this.config.authCookies);
    return { session, secureSession, cookies };
  }

  async request(path, { auth = true, text = false, isRetry = false } = {}) {
    const url = new URL(path, BASE);
    if (url.origin !== BASE || !url.pathname.startsWith('/d2l/') || url.username || url.password)
      throw new LearnError('INVALID_URL', 'Only Waterloo LEARN D2L URLs are allowed.');
    const headers = { Accept: text ? 'text/calendar' : 'application/json' };
    if (auth) {
      if (!this.hasSession()) {
        if (this.hasCredentials() && !isRetry) {
          await this.login();
        } else {
          throw new LearnError('AUTH_REQUIRED', 'Add d2lSessionVal and d2lSecureSessionVal or WATERLOO_USERNAME and WATERLOO_PASSWORD to ~/.learn_cookies.env, then retry.');
        }
      }
      for (const v of [this.config.session, this.config.secureSession])
        if (/[\r\n;]/.test(v)) throw new LearnError('INVALID_COOKIE', 'Supply cookie values only, without Cookie header syntax.');
      headers.Cookie = `d2lSessionVal=${this.config.session}; d2lSecureSessionVal=${this.config.secureSession}`;
    }
    let response;
    try { response = await this.fetcher(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(25000) }); }
    catch { throw new LearnError('NETWORK_ERROR', 'Could not reach LEARN within 25 seconds.'); }

    const isRedirect = (response.status >= 300 && response.status < 400) || response.status === 401;
    const isForbidden = response.status === 403;

    if ((isRedirect || isForbidden) && auth && this.hasCredentials() && !isRetry) {
      await this.login();
      return this.request(path, { auth, text, isRetry: true });
    }

    if (isRedirect)
      throw new LearnError('AUTH_REQUIRED', 'LEARN redirected to login or rejected the session. Refresh your LEARN credentials.');
    if (isForbidden)
      throw new LearnError('ACCESS_DENIED', 'LEARN denied access. Your session may have expired or your course role may not allow this API.');
    if (response.status === 429) throw new LearnError('RATE_LIMITED', 'LEARN rate limit reached. Wait before retrying.');
    if (!response.ok) throw new LearnError('HTTP_ERROR', `LEARN returned HTTP ${response.status}.`);
    const body = await response.text();
    if (/^\s*</.test(body)) {
      if (auth && this.hasCredentials() && !isRetry) {
        await this.login();
        return this.request(path, { auth, text, isRetry: true });
      }
      throw new LearnError('AUTH_REQUIRED', 'LEARN returned a login page instead of data. Refresh your session.');
    }
    if (text) return body;
    try { return JSON.parse(body); }
    catch { throw new LearnError('UNEXPECTED_RESPONSE', 'LEARN returned non-JSON data.'); }
  }

  async versions() {
    if (!this.versionCache) {
      const data = await this.request('/d2l/api/versions/', { auth: false });
      const result = {};
      for (const product of ['lp', 'le']) {
        const entry = data.find(p => p.ProductCode === product);
        const value = this.config[product] || entry?.LatestVersion;
        if (!/^\d+\.\d+$/.test(value || '') || !entry?.SupportedVersions.includes(value))
          throw new LearnError('API_VERSION', `No supported ${product} version found.`);
        result[product] = value;
      }
      this.versionCache = result;
    }
    return this.versionCache;
  }

  async path(product, suffix) { return `/d2l/api/${product}/${(await this.versions())[product]}/${suffix}`; }
  async get(product, suffix) { return this.request(await this.path(product, suffix)); }
  async list(product, suffix, params = {}) {
    let url = new URL(await this.path(product, suffix), BASE);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    const output = [], seen = new Set();
    for (let page = 0; page < 100; page++) {
      if (seen.has(url.href)) throw new LearnError('PAGINATION', 'LEARN repeated a page; results would be incomplete.');
      seen.add(url.href);
      const data = await this.request(url.href);
      output.push(...items(data));
      const next = data?.Next || data?.PagingInfo?.Next;
      if (typeof next === 'string' && next) { url = new URL(next, url); continue; }
      if (data?.PagingInfo?.HasMoreItems) {
        const bookmark = data.PagingInfo.Bookmark;
        if (!bookmark) throw new LearnError('PAGINATION', 'LEARN omitted its next-page bookmark.');
        url.searchParams.set('bookmark', bookmark); continue;
      }
      return output;
    }
    throw new LearnError('PAGINATION', 'More than 100 pages; narrow the request.');
  }

  whoami() { return this.get('lp', 'users/whoami'); }
  courses() { return this.list('lp', 'enrollments/myenrollments/', { orgUnitTypeId: 3 }); }
  folders(courseId) { return this.list('le', `${id(courseId)}/dropbox/folders/`); }
  async submissions(courseId, folderId) {
    const entities = await this.list('le', `${id(courseId)}/dropbox/folders/${id(folderId)}/submissions/mysubmissions/`);
    if (entities.some(e => !Array.isArray(e.Submissions)))
      throw new LearnError('UNEXPECTED_RESPONSE', 'Submission response cannot establish completion status.');
    return { submitted: entities.some(e => e.Submissions.length > 0 || e.CompletionDate), entities };
  }

  async assignments(courseId, includeSubmissionStatus = true) {
    const folders = await this.folders(courseId);
    if (!includeSubmissionStatus) return folders;
    const result = [];
    for (const folder of folders) {
      try { result.push({ ...folder, mySubmission: await this.submissions(courseId, folder.Id) }); }
      catch (e) { result.push({ ...folder, mySubmission: { submitted: null, error: publicError(e) } }); }
    }
    return result;
  }

  async calendar(start, end, courseIds) {
    const window = range(start, end);
    const ids = courseIds?.length ? courseIds.map(id) : (await this.courses())
      .filter(c => c.Access?.IsActive !== false).map(c => id(c.OrgUnit.Id));
    if (!ids.length) return [];
    return this.list('le', 'calendar/events/myEvents/', { ...window, orgUnitIdsCSV: ids.join(',') });
  }

  async feed() {
    if (!this.config.feed) throw new LearnError('FEED_REQUIRED', 'Set LEARN_ICAL_URL in ~/.learn_cookies.env to the LEARN Subscribe calendar URL.');
    let url;
    try { url = new URL(this.config.feed); } catch { throw new LearnError('INVALID_URL', 'The saved calendar feed URL is invalid.'); }
    if (!url.pathname.endsWith('/feed.ics')) throw new LearnError('INVALID_URL', 'Expected a LEARN calendar feed.ics URL.');
    const data = await this.request(url.href, { auth: false, text: true });
    if (!data.trimStart().startsWith('BEGIN:VCALENDAR')) throw new LearnError('INVALID_FEED', 'LEARN did not return an iCalendar feed.');
    return data;
  }

  async upcoming(start, end, excludeSubmitted = true) {
    range(start, end);
    let events, source = 'api', warning;
    try { events = await this.calendar(start, end); }
    catch (e) {
      if (!this.config.feed || !['AUTH_REQUIRED', 'ACCESS_DENIED'].includes(e.code)) throw e;
      events = parseFeed(await this.feed(), start, end); source = 'ical'; warning = publicError(e);
    }
    const result = [], cache = new Map();
    for (const event of events) {
      let submitted = null, submissionError;
      const entity = event.AssociatedEntity;
      if (source === 'api' && entity?.AssociatedEntityType === 'D2L.LE.Dropbox.Dropbox') {
        const key = `${event.OrgUnitId}/${entity.AssociatedEntityId}`;
        try {
          if (!cache.has(key)) cache.set(key, await this.submissions(event.OrgUnitId, entity.AssociatedEntityId));
          submitted = cache.get(key).submitted;
        } catch (e) { submissionError = publicError(e); }
      }
      if (excludeSubmitted && submitted === true) continue;
      result.push({ ...event, submitted, ...(submissionError ? { submissionError } : {}) });
    }
    return {
      source, ...(warning ? { warning } : {}), events: result,
      note: 'Includes calendar events, due dates, quizzes and exams only when published in LEARN. submitted:null means unknown; these events are retained.'
    };
  }
}

export function publicError(e) {
  return e instanceof LearnError ? { code: e.code, message: e.message } : { code: 'INTERNAL_ERROR', message: 'Unexpected connector error; no credentials or remote response bodies are included.' };
}

export function parseFeed(text, start, end) {
  const window = range(start, end), a = new Date(window.startDateTime), b = new Date(window.endDateTime);
  let root;
  try { root = new ICAL.Component(ICAL.parse(text)); }
  catch { throw new LearnError('INVALID_FEED', 'Could not parse the LEARN calendar feed.'); }
  for (const zone of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(zone);
  const components = root.getAllSubcomponents('vevent');
  const exceptions = components.filter(c => c.hasProperty('recurrence-id'));
  const result = [];
  for (const component of components.filter(c => !c.hasProperty('recurrence-id'))) {
    const event = new ICAL.Event(component);
    for (const c of exceptions) if (c.getFirstPropertyValue('uid') === event.uid) event.relateException(new ICAL.Event(c));
    const iterator = event.iterator();
    let steps = 0;
    for (; ;) {
      if (++steps > 20000) throw new LearnError('FEED_LIMIT', 'Calendar recurrence expansion exceeded 20,000 occurrences.');
      const next = iterator.next();
      if (!next || next.toJSDate() >= b) break;
      const occurrence = event.getOccurrenceDetails(next);
      if (occurrence.endDate.toJSDate() < a || occurrence.startDate.toJSDate() >= b) continue;
      result.push({
        CalendarEventId: event.uid, Title: occurrence.item.summary,
        Description: occurrence.item.description || '', StartDateTime: occurrence.startDate.toJSDate().toISOString(),
        EndDateTime: occurrence.endDate.toJSDate().toISOString(), IsAllDayEvent: occurrence.startDate.isDate,
        StartDay: occurrence.startDate.isDate ? occurrence.startDate.toString() : null,
        EndDay: occurrence.endDate.isDate ? occurrence.endDate.toString() : null
      });
      if (result.length > 5000) throw new LearnError('FEED_LIMIT', 'More than 5,000 calendar events; narrow the date range.');
    }
  }
  return result;
}

export function toICS(events) {
  const calendar = new ICAL.Component(['vcalendar', [], []]);
  calendar.updatePropertyWithValue('version', '2.0');
  calendar.updatePropertyWithValue('prodid', '-//Waterloo LEARN MCP//EN');
  for (const item of events) {
    const component = new ICAL.Component('vevent');
    const event = new ICAL.Event(component);
    const start = item.IsAllDayEvent ? item.StartDay?.slice(0, 10) : item.StartDateTime;
    const end = item.IsAllDayEvent ? item.EndDay?.slice(0, 10) : item.EndDateTime;
    if (!start) continue;
    event.uid = `${item.OrgUnitId || 'feed'}-${item.CalendarEventId}-${start}@learn-mcp.local`;
    event.summary = item.Title || 'LEARN event';
    event.description = item.Description || '';
    event.startDate = item.IsAllDayEvent ? ICAL.Time.fromDateString(start) : ICAL.Time.fromJSDate(new Date(start), true);
    if (end) event.endDate = item.IsAllDayEvent ? ICAL.Time.fromDateString(end) : ICAL.Time.fromJSDate(new Date(end), true);
    component.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
    calendar.addSubcomponent(component);
  }
  return calendar.toString() + '\r\n';
}

export async function exportCalendar(client, start, end, excludeSubmitted = true) {
  const data = await client.upcoming(start, end, excludeSubmitted);
  const dir = join(homedir(), '.local/share/d2l-mcp');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  for (const [name, body] of [['learn.ics', toICS(data.events)], ['events.json', JSON.stringify({ updatedAt: new Date().toISOString(), ...data }, null, 2) + '\n']]) {
    const target = join(dir, name), tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, body, { mode: 0o600 }); await rename(tmp, target);
  }
  return { source: data.source, events: data.events.length, calendar: join(dir, 'learn.ics'), data: join(dir, 'events.json'), warning: data.warning };
}
