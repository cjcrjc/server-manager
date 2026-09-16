import test from 'node:test';
import assert from 'node:assert/strict';
import { LearnClient, parseFeed, toICS, publicError, range, LearnError } from './learn.mjs';
import { CookieJar, extractForm, extractSAMLForm, extractDuoDetails } from './auth.mjs';
import ICAL from 'ical.js';

const versions = [{ ProductCode: 'lp', LatestVersion: '1.50', SupportedVersions: ['1.50'] }, { ProductCode: 'le', LatestVersion: '1.97', SupportedVersions: ['1.97'] }];

function client(handler, config = {}) {
  return new LearnClient({ session: 'secret-session', secureSession: 'secret-secure', ...config }, async (url, options) => {
    if (url.pathname === '/d2l/api/versions/') return Response.json(versions);
    return handler(url, options);
  });
}

test('course pagination uses LP and preserves filters', async () => {
  const urls = [];
  const c = client((url, options) => {
    urls.push(url);
    assert.equal(options.redirect, 'manual');
    assert.match(options.headers.Cookie, /d2lSessionVal=/);
    assert.match(url.pathname, /\/lp\/1.50\/enrollments\/myenrollments\//);
    assert.equal(url.searchParams.get('orgUnitTypeId'), '3');
    return Response.json(url.searchParams.has('bookmark') ? { Items: [{ OrgUnit: { Id: 2 } }], PagingInfo: { HasMoreItems: false } } : { Items: [{ OrgUnit: { Id: 1 } }], PagingInfo: { HasMoreItems: true, Bookmark: 'first' } });
  });
  assert.equal((await c.courses()).length, 2);
  assert.equal(urls.length, 2);
});

test('redirect is not followed; errors never expose cookies or response body', async () => {
  const c = client(() => new Response('secret-session', { status: 302, headers: { Location: 'https://outside.example/' } }));
  await assert.rejects(c.whoami(), e => e.code === 'AUTH_REQUIRED' && !JSON.stringify(publicError(e)).includes('secret-session'));
});

test('external next link cannot receive cookies', async () => {
  let calls = 0;
  const c = client(() => {
    calls++;
    return Response.json({ Items: [], Next: 'https://outside.example/d2l/api/foo' });
  });
  await assert.rejects(c.courses(), e => e.code === 'INVALID_URL');
  assert.equal(calls, 1);
});

test('HTML login and permission errors are distinguished without credentials', async () => {
  await assert.rejects(client(() => new Response('<html>login</html>')).whoami(), e => e.code === 'AUTH_REQUIRED');
  await assert.rejects(client(() => new Response('', { status: 403 })).whoami(), e => e.code === 'ACCESS_DENIED');
});

test('only own confirmed submissions suppress reminders; unknown stays visible', async () => {
  const c = client(url => {
    if (url.pathname.includes('calendar')) return Response.json({ Objects: [1, 2, 3].map(n => ({ OrgUnitId: 99, CalendarEventId: n, AssociatedEntity: { AssociatedEntityType: 'D2L.LE.Dropbox.Dropbox', AssociatedEntityId: n } })) });
    if (url.pathname.includes('enrollments')) return Response.json({ Items: [{ OrgUnit: { Id: 99 } }] });
    if (url.pathname.includes('/1/submissions/')) return Response.json([{ Submissions: [{ Id: 1 }] }]);
    if (url.pathname.includes('/2/submissions/')) return Response.json([{ Submissions: [] }]);
    return new Response('', { status: 403 });
  });
  const result = await c.upcoming('2026-09-12', '2026-09-19');
  assert.deepEqual(result.events.map(e => e.CalendarEventId), [2, 3]);
  assert.equal(result.events[0].submitted, false);
  assert.equal(result.events[1].submitted, null);
});

const feed = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\nBEGIN:VEVENT\r\nUID:assignment-1\r\nDTSTART:20260912T140000Z\r\nDTEND:20260912T150000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Exam\\, practice\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';

test('iCalendar recurrence expands and export roundtrips', () => {
  const events = parseFeed(feed, '2026-09-13', '2026-09-16');
  assert.equal(events.length, 2);
  const result = new ICAL.Component(ICAL.parse(toICS(events)));
  assert.equal(result.getAllSubcomponents('vevent').length, 2);
  assert.equal(result.getFirstSubcomponent('vevent').getFirstPropertyValue('summary'), 'Exam, practice');
});

test('feed fallback uses no cookies and explicitly reports unknown submission status', async () => {
  const c = client((url, opts) => {
    assert.equal(opts.headers.Cookie, undefined);
    return new Response(feed);
  }, { session: '', secureSession: '', feed: 'https://learn.uwaterloo.ca/d2l/le/calendar/feed.ics?token=secret' });
  const result = await c.upcoming('2026-09-12', '2026-09-16');
  assert.equal(result.source, 'ical');
  assert.equal(result.events.length, 3);
  assert.equal(result.events[0].submitted, null);
});

test('reject unbounded or reversed date ranges', () => {
  assert.throws(() => range('2026-10-01', '2026-09-01'));
  assert.throws(() => range('2026-01-01', '2029-01-01'));
});

test('CookieJar manages domains, expires cookies, and serializes to/from JSON correctly', () => {
  const jar = new CookieJar();
  jar.setCookie('d2lSessionVal=abc123; path=/; domain=learn.uwaterloo.ca', 'https://learn.uwaterloo.ca');
  jar.setCookie('d2lSecureSessionVal=def456; Secure; HttpOnly', 'https://learn.uwaterloo.ca/d2l/home');
  jar.setCookie('other=xyz; domain=.uwaterloo.ca', 'https://adfs.uwaterloo.ca');
  jar.setCookie('temp=123; Max-Age=0', 'https://learn.uwaterloo.ca');

  assert.equal(jar.get('learn.uwaterloo.ca', 'd2lSessionVal'), 'abc123');
  assert.equal(jar.get('learn.uwaterloo.ca', 'd2lSecureSessionVal'), 'def456');
  assert.equal(jar.get('adfs.uwaterloo.ca', 'other'), 'xyz');
  assert.equal(jar.get('learn.uwaterloo.ca', 'temp'), null);

  const cookieHeader = jar.getCookieHeader('https://learn.uwaterloo.ca/d2l/home');
  assert.match(cookieHeader, /d2lSessionVal=abc123/);
  assert.match(cookieHeader, /d2lSecureSessionVal=def456/);
  assert.match(cookieHeader, /other=xyz/);

  const json = jar.toJSON();
  const restoredJar = new CookieJar(json);
  assert.equal(restoredJar.get('learn.uwaterloo.ca', 'd2lSessionVal'), 'abc123');
  assert.equal(restoredJar.get('adfs.uwaterloo.ca', 'other'), 'xyz');
});

test('extractForm and extractSAMLForm parse form fields accurately', () => {
  const html = `
    <html>
      <form id="loginForm" method="post" action="/adfs/ls/?req=123">
        <input name="UserName" value="test@uwaterloo.ca" />
        <input name="AuthMethod" value="FormsAuthentication" />
      </form>
      <form method="post" action="https://learn.uwaterloo.ca/d2l/lp/auth/login/samlLogin.d2l">
        <input type="hidden" name="SAMLResponse" value="base64response" />
        <input type="hidden" name="RelayState" value="/d2l/home" />
      </form>
    </html>
  `;
  const form = extractForm(html, 'loginForm');
  assert.equal(form.action, '/adfs/ls/?req=123');
  assert.equal(form.method, 'POST');
  assert.equal(form.fields.UserName, 'test@uwaterloo.ca');
  assert.equal(form.fields.AuthMethod, 'FormsAuthentication');

  const saml = extractSAMLForm(html);
  assert.equal(saml.action, 'https://learn.uwaterloo.ca/d2l/lp/auth/login/samlLogin.d2l');
  assert.equal(saml.fields.SAMLResponse, 'base64response');
  assert.equal(saml.fields.RelayState, '/d2l/home');
});

test('extractDuoDetails extracts iframe data properties', () => {
  const html = '<iframe id="duo_iframe" data-host="api-12345.duosecurity.com" data-sig-request="TX123:APP456" data-post-action="/adfs/ls/callback"></iframe>';
  const duo = extractDuoDetails(html);
  assert.equal(duo.type, 'iframe');
  assert.equal(duo.host, 'api-12345.duosecurity.com');
  assert.equal(duo.sigRequest, 'TX123:APP456');
  assert.equal(duo.postAction, '/adfs/ls/callback');
});

test('ACCESS_DENIED triggers automatic login attempt when credentials are provided', async () => {
  let loginCalled = false;
  let requestsCount = 0;
  const c = client((url, options) => {
    requestsCount++;
    if (requestsCount === 1) {
      return new Response('', { status: 403 });
    }
    return Response.json({ UserId: 12345, UniqueName: 'testuser', FirstName: 'Test', LastName: 'User' });
  }, {
    session: 'old-session',
    secureSession: 'old-secure',
    username: 'testuser@uwaterloo.ca',
    password: 'testpassword'
  });

  c.login = async () => {
    loginCalled = true;
    c.config.session = 'new-session';
    c.config.secureSession = 'new-secure';
    return { session: 'new-session', secureSession: 'new-secure' };
  };

  const user = await c.whoami();
  assert.equal(loginCalled, true);
  assert.equal(user.UniqueName, 'testuser');
  assert.equal(requestsCount, 2);
});
