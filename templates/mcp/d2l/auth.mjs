import { LearnError } from './learn-error.mjs';

export class CookieJar {
  constructor(initialData = null) {
    this.cookies = new Map(); // domain -> Map(name -> value)
    if (initialData) {
      this.fromJSON(initialData);
    }
  }

  setCookie(header, currentUrl) {
    if (!header || typeof header !== 'string') return;
    const parts = header.split(';').map(p => p.trim());
    const [nameVal, ...attrs] = parts;
    const eqIdx = nameVal.indexOf('=');
    if (eqIdx === -1) return;
    const name = nameVal.slice(0, eqIdx).trim();
    const value = nameVal.slice(eqIdx + 1).trim();

    let domain = new URL(currentUrl).hostname;
    let isExpired = false;
    for (const attr of attrs) {
      const [k, v] = attr.split('=').map(s => s.trim());
      if (k && k.toLowerCase() === 'domain' && v) {
        domain = v.startsWith('.') ? v.slice(1) : v;
      }
      if (k && k.toLowerCase() === 'max-age' && v === '0') {
        isExpired = true;
      }
      if (k && k.toLowerCase() === 'expires' && v) {
        const exp = new Date(v).getTime();
        if (!isNaN(exp) && exp <= Date.now()) {
          isExpired = true;
        }
      }
    }
    if (!this.cookies.has(domain)) this.cookies.set(domain, new Map());
    if (isExpired) {
      this.cookies.get(domain).delete(name);
    } else {
      this.cookies.get(domain).set(name, value);
    }
  }

  processResponse(response, currentUrl) {
    if (!response || !response.headers) return;
    let list = [];
    if (typeof response.headers.getSetCookie === 'function') {
      list = response.headers.getSetCookie() || [];
    }
    if (list.length === 0 && response.headers.get) {
      const raw = response.headers.get('set-cookie');
      if (raw) list = [raw];
    }
    for (const h of list) {
      this.setCookie(h, currentUrl);
    }
  }

  getCookieHeader(targetUrl) {
    const targetHost = new URL(targetUrl).hostname;
    const matched = [];
    for (const [domain, map] of this.cookies.entries()) {
      if (targetHost === domain || targetHost.endsWith('.' + domain)) {
        for (const [k, v] of map.entries()) {
          matched.push(`${k}=${v}`);
        }
      }
    }
    return matched.join('; ');
  }

  get(domain, name) {
    for (const [d, map] of this.cookies.entries()) {
      if (domain === d || domain.endsWith('.' + d)) {
        if (map.has(name)) return map.get(name);
      }
    }
    return null;
  }

  findCookie(name) {
    for (const [domain, map] of this.cookies.entries()) {
      if (map.has(name)) return map.get(name);
    }
    return null;
  }

  toJSON() {
    const obj = {};
    for (const [domain, map] of this.cookies.entries()) {
      if (map.size > 0) {
        obj[domain] = Object.fromEntries(map.entries());
      }
    }
    return obj;
  }

  fromJSON(data) {
    if (!data) return;
    let obj = data;
    if (typeof data === 'string') {
      try {
        obj = JSON.parse(data);
      } catch {
        return;
      }
    }
    if (typeof obj !== 'object' || obj === null) return;
    for (const [domain, cookies] of Object.entries(obj)) {
      if (!this.cookies.has(domain)) this.cookies.set(domain, new Map());
      const map = this.cookies.get(domain);
      if (typeof cookies === 'object' && cookies !== null) {
        for (const [k, v] of Object.entries(cookies)) {
          if (typeof v === 'string') {
            map.set(k, v);
          }
        }
      }
    }
  }
}

export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#x2f;/gi, '/')
    .replace(/&#x3f;/gi, '?')
    .replace(/&#x3d;/gi, '=')
    .replace(/&#x25;/gi, '%')
    .replace(/&#x3a;/gi, ':')
    .replace(/&#x23;/gi, '#')
    .replace(/&#x2b;/gi, '+')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

export function extractAllInputs(html) {
  const fields = {};
  const inputRegex = /<input\b[^>]*>/gi;
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    const tag = match[0];
    const nameMatch = tag.match(/name=[\"\x27]([^\"\x27]+)[\"\x27]/i) || tag.match(/name=([^\s>]+)/i);
    if (!nameMatch) continue;
    const name = nameMatch[1].replace(/[\"\x27]/g, '');

    let val = '';
    const valMatch = tag.match(/value=[\"\x27]([\s\S]*?)[\"\x27]/i) || tag.match(/value=([^\s>]+)/i);
    if (valMatch) {
      val = decodeHtmlEntities(valMatch[1]);
    }
    fields[name] = val;
  }
  return fields;
}

export function extractForm(html, formId) {
  const formRegex = formId
    ? new RegExp('<form[^>]*id=[\"\x27]' + formId + '[\"\x27][^>]*>([\\s\\S]*?)</form>', 'i')
    : /<form[^>]*>([\s\S]*?)<\/form>/i;
  const formMatch = html.match(formRegex);
  if (!formMatch) return null;
  const formTag = formMatch[0].match(/<form[^>]*>/i)[0];
  const actionMatch = formTag.match(/action=[\"\x27]([^\"\x27]*)[\"\x27]/i) || formTag.match(/action=([^\s>]+)/i);
  const methodMatch = formTag.match(/method=[\"\x27]([^\"\x27]*)[\"\x27]/i) || formTag.match(/method=([^\s>]+)/i);
  const action = actionMatch ? decodeHtmlEntities(actionMatch[1]) : '';
  const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
  const fields = extractAllInputs(formMatch[1]);
  return { action, method, fields };
}

export function extractSAMLForm(html) {
  if (!html) return null;
  const forms = html.match(/<form[\s\S]*?<\/form>/gi) || [];
  for (const formHtml of forms) {
    if (formHtml.includes('SAMLResponse') || formHtml.includes('samlLogin') || formHtml.includes('saml2/sp')) {
      const formTag = formHtml.match(/<form[^>]*>/i)[0];
      const actionMatch = formTag.match(/action=[\"\x27]([^\"\x27]*)[\"\x27]/i) || formTag.match(/action=([^\s>]+)/i);
      const methodMatch = formTag.match(/method=[\"\x27]([^\"\x27]*)[\"\x27]/i) || formTag.match(/method=([^\s>]+)/i);
      const action = actionMatch ? decodeHtmlEntities(actionMatch[1]) : '';
      const method = methodMatch ? methodMatch[1].toUpperCase() : 'POST';
      const fields = extractAllInputs(formHtml);
      return { action, method, fields };
    }
  }
  return null;
}

export function extractDuoDetails(html) {
  // Check for classic Duo iframe
  const iframeMatch = html.match(/<iframe[^>]*id=[\"\x27]duo_iframe[\"\x27][^>]*>/i) || html.match(/<iframe[^>]*data-sig-request=[\"\x27][^\"\x27]+[\"\x27][^>]*>/i);
  if (iframeMatch) {
    const tag = iframeMatch[0];
    const hostM = tag.match(/data-host=[\"\x27]([^\"\x27]+)[\"\x27]/i);
    const sigM = tag.match(/data-sig-request=[\"\x27]([^\"\x27]+)[\"\x27]/i);
    const postM = tag.match(/data-post-action=[\"\x27]([^\"\x27]+)[\"\x27]/i);
    if (hostM && sigM) {
      return {
        type: 'iframe',
        host: hostM[1],
        sigRequest: sigM[1],
        postAction: postM ? decodeHtmlEntities(postM[1]) : ''
      };
    }
  }

  // Check for Duo Universal Prompt script / URL
  const duoV4Match = html.match(/https:\/\/([a-zA-Z0-9.-]+\.duosecurity\.com)\/frame\/v4\/auth\/prompt\?([^\"]+)/i);
  if (duoV4Match) {
    return {
      type: 'v4',
      host: duoV4Match[1],
      query: duoV4Match[2],
      promptUrl: duoV4Match[0]
    };
  }

  return null;
}

const DUO_BROWSER_FEATURES = encodeURIComponent(JSON.stringify({
  touch_supported: false,
  platform_authenticator_status: 'unavailable',
  webauthn_supported: false,
  screen_resolution_height: 1080,
  screen_resolution_width: 1920,
  screen_color_depth: 24
}));

export async function loginToLearn({ username, password, initialCookies = null, passcode = null, ntfyTopic = null }, { onStatus = () => {}, fetcher = fetch, timeoutMs = 120000 } = {}) {
  if (!username || !password) {
    throw new LearnError('AUTH_REQUIRED', 'Waterloo username and password are required for automatic login. Run configure.py or set WATERLOO_USERNAME and WATERLOO_PASSWORD.');
  }

  const user = username.includes('@') ? username : `${username}@uwaterloo.ca`;
  const jar = new CookieJar(initialCookies);
  const startTime = Date.now();

  async function fetchWithJar(url, options = {}) {
    if (Date.now() - startTime > timeoutMs) {
      throw new LearnError('TIMEOUT', 'Login process timed out.');
    }
    const headers = { ...(options.headers || {}) };
    const cookie = jar.getCookieHeader(url);
    if (cookie) headers['Cookie'] = cookie;
    if (!headers['User-Agent']) {
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    }

    const res = await fetcher(url, { ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(Math.max(1, timeoutMs - (Date.now() - startTime))) });
    jar.processResponse(res, url);
    return res;
  }

  async function followRedirects(initialRes, initialUrl) {
    let res = initialRes;
    let url = initialUrl;
    while (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const loc = decodeHtmlEntities(res.headers.get('location'));
      url = new URL(loc, url).href;
      res = await fetchWithJar(url);
    }
    return { res, url };
  }

  onStatus('Initiating Waterloo SAML authentication...');
  const initUrl = 'https://learn.uwaterloo.ca/d2l/lp/auth/saml/initiate-login?entityId=' +
    encodeURIComponent('https://sso-4ccc589b.sso.duosecurity.com/saml2/sp/DIQVOPC5SS7M2W0Z0AJU/metadata') +
    '&target=' + encodeURIComponent('/d2l/home');

  let currentUrl = initUrl;
  let res = await fetchWithJar(currentUrl);
  let reachedAdfs = false;
  let adfsHtml = '';
  let nextUrl = '';
  let pageText = '';

  // Step 1: Follow redirects to ADFS / Duo / D2L
  for (let i = 0; i < 15; i++) {
    const redir = await followRedirects(res, currentUrl);
    res = redir.res;
    currentUrl = redir.url;

    const s1 = jar.findCookie('d2lSessionVal');
    const s2 = jar.findCookie('d2lSecureSessionVal');
    if (s1 && s2 && currentUrl.includes('learn.uwaterloo.ca')) {
      onStatus('Successfully authenticated with active SSO session!');
      return { session: s1, secureSession: s2, cookies: jar.toJSON() };
    }

    const text = await res.text();
    const ssoMatch = text.match(/href=[\"\x27]([^\"\x27]*sso_complete[^\"\x27]*)[\"\x27]/i);
    if (ssoMatch) {
      const rel = decodeHtmlEntities(ssoMatch[1]);
      currentUrl = new URL(rel, currentUrl).href;
      res = await fetchWithJar(currentUrl);
      continue;
    }

    if (currentUrl.includes('adfs.uwaterloo.ca') && (text.includes('loginForm') || text.includes('FormsAuthentication'))) {
      reachedAdfs = true;
      adfsHtml = text;
      break;
    }

    if (currentUrl.includes('/prompt/') || text.includes('pwl-prompt-root') || currentUrl.includes('duosecurity.com/prompt')) {
      nextUrl = currentUrl;
      pageText = text;
      break;
    }

    const saml = extractSAMLForm(text);
    if (saml) {
      const samlAction = new URL(saml.action, currentUrl).href;
      res = await fetchWithJar(samlAction, {
        method: saml.method || 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(saml.fields).toString()
      });
      continue;
    }

    res = await fetchWithJar(currentUrl);
  }

  // Step 2: Submit username & password to ADFS if form displayed
  if (reachedAdfs && adfsHtml) {
    onStatus('Submitting credentials to Waterloo ADFS...');
    const adfsForm = extractForm(adfsHtml, 'loginForm') || extractForm(adfsHtml);
    if (!adfsForm) {
      throw new LearnError('LOGIN_FAILED', 'Could not parse ADFS login form.');
    }

    const postUrl = new URL(adfsForm.action || '', currentUrl).href;
    const postBody = new URLSearchParams({
      ...(adfsForm.fields || {}),
      UserName: user,
      Password: password,
      AuthMethod: 'FormsAuthentication',
      Kmsi: 'true'
    });

    res = await fetchWithJar(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: postBody.toString()
    });

    let redir = await followRedirects(res, postUrl);
    res = redir.res;
    nextUrl = redir.url;
    pageText = await res.text();

    // Check for login error
    const errMatch = pageText.match(/id=[\"\x27]errorText[\"\x27][^>]*>([^<]+)</i);
    if (errMatch && errMatch[1].trim()) {
      throw new LearnError('INVALID_CREDENTIALS', `Waterloo ADFS error: ${errMatch[1].trim()}`);
    }

    // If ADFS returns a SAML assertion form (posting to Duo SSO), submit it
    const adfsSaml = extractSAMLForm(pageText) || extractForm(pageText);
    if (adfsSaml && (adfsSaml.fields.SAMLResponse || adfsSaml.action.includes('duosecurity') || adfsSaml.action.includes('saml2/idp'))) {
      const samlUrl = new URL(adfsSaml.action, nextUrl).href;
      onStatus('Submitting authentication assertion to Duo SSO...');
      res = await fetchWithJar(samlUrl, {
        method: adfsSaml.method || 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(adfsSaml.fields).toString()
      });
      const sRedir = await followRedirects(res, samlUrl);
      res = sRedir.res;
      nextUrl = sRedir.url;
      pageText = await res.text();
    }
  }

  // Step 3: Handle Duo Universal Prompt or Classic Iframe
  const isUniversalPrompt = nextUrl.includes('/prompt/') || pageText.includes('pwl-prompt-root') || nextUrl.includes('duosecurity.com/prompt');

  if (isUniversalPrompt) {
    const promptUrlObj = new URL(nextUrl);
    const host = promptUrlObj.hostname;
    const akeyMatch = promptUrlObj.pathname.match(/\/prompt\/([^\/]+)/);
    const akey = akeyMatch ? akeyMatch[1] : '';
    const authkey = promptUrlObj.searchParams.get('authkey') || '';
    const reqTraceGroup = promptUrlObj.searchParams.get('req_trace_group') || '';

    if (!akey || !authkey) {
      throw new LearnError('MFA_FAILED', 'Could not parse Duo Universal Prompt parameters.');
    }

    onStatus('Initializing Duo 2FA session...');
    // Bootstrap Auth
    const bootstrapUrl = `https://${host}/prompt/${akey}/auth/payload?authkey=${encodeURIComponent(authkey)}&browser_features=${DUO_BROWSER_FEATURES}`;
    const bootRes = await fetchWithJar(bootstrapUrl, {
      method: 'GET',
      headers: {
        'X-Duo-Req-Trace-Group': reqTraceGroup,
        'Referer': nextUrl,
        'Accept': 'application/json, text/plain, */*'
      }
    });
    const bootData = await bootRes.json().catch(() => ({}));
    onStatus(`Bootstrap response: ${JSON.stringify(bootData)}`);

    // Evaluate Pre-Auth to discover factors & check trusted device status
    const preUrl = `https://${host}/prompt/${akey}/pre_authn/evaluation?authkey=${encodeURIComponent(authkey)}&browser_features=${DUO_BROWSER_FEATURES}&local_trust_choice=undecided`;
    const preRes = await fetchWithJar(preUrl, {
      method: 'GET',
      headers: {
        'X-Duo-Req-Trace-Group': reqTraceGroup,
        'Referer': nextUrl,
        'Accept': 'application/json, text/plain, */*'
      }
    });
    const preData = await preRes.json().catch(() => ({}));
    onStatus(`Pre-Auth response: ${JSON.stringify(preData)}`);

    let needsPush = true;
    if (preData.response?.result?.status === 'success' || preData.response?.result?.auth_result?.authn_evaluation?.is_allowed === true) {
      onStatus('Device trust recognized! Bypassing 2FA push...');
      needsPush = false;
    }

    if (needsPush) {
      const factors = preData.response?.auth_factors_context?.available_unified_auth_factors?.factors || [];
      onStatus(`Available MFA factors: ${factors.map(f => f.factor_type).join(', ')}`);
      const pushFactor = factors.find(f => f.factor_type === 'push') || factors[0];
      const pkey = pushFactor?.device_info?.pkey || pushFactor?.pkey;
      const deviceName = pushFactor?.device_info?.name || pushFactor?.name || 'phone';

      if (passcode) {
        onStatus(`Submitting Duo passcode...`);
      } else {
        onStatus(`Sending Duo Push notification to ${deviceName}...`);
      }

      const initPushUrl = `https://${host}/prompt/${akey}/auth/factors/push/auth`;
      const initPushRes = await fetchWithJar(initPushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Duo-Req-Trace-Group': reqTraceGroup,
          'Referer': nextUrl,
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify({
          authkey,
          pkey,
          otp_code: passcode || ''
        })
      });
      const initPushData = await initPushRes.json().catch(() => ({}));
      const pushTxid = initPushData.response?.push_txid || initPushData.response?.inline_auth_txid || preData.response?.inline_auth_txid;
      const stepUpCode = initPushData.response?.step_up_code;

      if (initPushData.stat !== 'OK' && !pushTxid) {
        throw new LearnError('MFA_FAILED', initPushData.message || initPushData.response?.message || `Failed to authenticate Duo MFA: ${JSON.stringify(initPushData)}`);
      }

      if (stepUpCode) {
        onStatus(`Duo Push sent! Please approve the notification on your phone (verification code: ${stepUpCode})...`);
      } else {
        onStatus('Duo Push sent! Please approve the notification on your phone (tap Approve / Check)...');
      }
      const topic = ntfyTopic || process.env.NTFY_TOPIC;
      if (topic) {
        const ntfyUrl = topic.startsWith('http') ? topic : `https://ntfy.sh/${topic}`;
        try {
          const notification = await fetcher(ntfyUrl, {
            method: 'POST',
            body: stepUpCode ? `Duo 2FA Code: ${stepUpCode}` : 'Approve the Waterloo LEARN sign-in in Duo Mobile.',
            headers: { 'Title': 'Waterloo Duo approval needed', 'Priority': 'urgent', 'Tags': 'key,lock' },
            signal: AbortSignal.timeout(5000)
          });
          if (!notification.ok) onStatus(`ntfy notification failed: HTTP ${notification.status}. Check Duo Mobile directly.`);
        } catch {
          onStatus('ntfy notification failed. Check Duo Mobile directly.');
        }
      }

      // Poll push status
      const statusBase = `https://${host}/prompt/${akey}/auth/factors/push/status`;
      let approved = false;
      while (Date.now() - startTime < timeoutMs) {
        await new Promise(r => setTimeout(r, 1500));
        const statusUrl = `${statusBase}?authkey=${encodeURIComponent(authkey)}&push_txid=${encodeURIComponent(pushTxid)}&saw_good_news=false`;
        const statusRes = await fetchWithJar(statusUrl, {
          method: 'GET',
          headers: {
            'X-Duo-Req-Trace-Group': reqTraceGroup,
            'Referer': nextUrl,
            'Accept': 'application/json, text/plain, */*'
          }
        });
        const statusData = await statusRes.json().catch(() => ({}));
        const result = statusData.response?.result;

        if (result) {
          const status = (result.status || result.result || '').toLowerCase();
          const authn = result.auth_result?.authn_evaluation;

          if (status === 'success' || (authn && authn.is_allowed === true)) {
            onStatus('Duo Push approved! Saving trusted device session...');
            approved = true;
            break;
          }

          if (status === 'deny' || status === 'fraud' || status === 'failure' || status === 'error') {
            throw new LearnError('MFA_DENIED', result.message || 'Duo Push was denied or verification failed.');
          }

          if (authn && authn.status_enum === 64) {
            throw new LearnError('MFA_DENIED', 'Incorrect verification code entered in Duo Mobile.');
          }
        }
      }

      if (!approved) {
        throw new LearnError('TIMEOUT', 'Duo Push approval timed out waiting for phone response.');
      }
    }

    // Call remember_me to establish device trust and set persistent cookies
    try {
      const remUrl = `https://${host}/prompt/${akey}/auth/remember_me`;
      await fetchWithJar(remUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Duo-Req-Trace-Group': reqTraceGroup,
          'Referer': nextUrl,
          'Accept': 'application/json, text/plain, */*'
        },
        body: JSON.stringify({ authkey, remember_me: true })
      });
    } catch (_) {}

    // Finalize Auth
    const finalizeUrl = `https://${host}/prompt/${akey}/auth/finalize_auth?authkey=${encodeURIComponent(authkey)}`;
    const finalRes = await fetchWithJar(finalizeUrl, {
      method: 'GET',
      headers: {
        'X-Duo-Req-Trace-Group': reqTraceGroup,
        'Referer': nextUrl,
        'Accept': 'application/json, text/plain, */*'
      }
    });

    let redirectUrl = null;
    if (finalRes.status >= 300 && finalRes.status < 400 && finalRes.headers.get('location')) {
      redirectUrl = decodeHtmlEntities(finalRes.headers.get('location'));
    } else {
      const finalData = await finalRes.json().catch(() => ({}));
      redirectUrl = finalData.response?.url || finalData.response?.redirect_url || finalData.url;
    }

    if (redirectUrl) {
      redirectUrl = new URL(redirectUrl, finalizeUrl).href;
      onStatus('Forwarding authentication callback to Waterloo LEARN...');
      res = await fetchWithJar(redirectUrl);
      const cbRedir = await followRedirects(res, redirectUrl);
      res = cbRedir.res;
      nextUrl = cbRedir.url;
      pageText = await res.text();
    } else {
      const finalTxt = await finalRes.text().catch(() => '');
      const finalSaml = extractSAMLForm(finalTxt);
      if (finalSaml) {
        pageText = finalTxt;
        nextUrl = finalizeUrl;
      } else {
        throw new LearnError('LOGIN_FAILED', `Failed to retrieve redirect URL after Duo MFA approval (HTTP ${finalRes.status}).`);
      }
    }
  } else {
    // Check classic Duo iframe
    const duo = extractDuoDetails(pageText);
    if (duo && duo.type === 'iframe') {
      onStatus('Sending Duo Push notification to your phone...');
      const delim = duo.sigRequest.includes(':') ? ':' : '|';
      const parts = duo.sigRequest.split(delim);
      const tx = parts[0];
      const app = parts[1];

      const duoAuthUrl = `https://${duo.host}/frame/web/v1/auth`;
      const authParams = new URLSearchParams({
        parent: nextUrl,
        java_version: '',
        flash_version: '',
        screen_resolution_width: '1920',
        screen_resolution_height: '1080',
        color_depth: '24',
        tx
      });

      const duoAuthRes = await fetchWithJar(duoAuthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: authParams.toString()
      });
      const duoAuthHtml = await duoAuthRes.text();
      let sid = jar.get(duo.host, 'sid');
      if (!sid) {
        const sidMatch = duoAuthHtml.match(/name=[\"\x27]sid[\"\x27]\s+value=[\"\x27]([^\"\x27]+)[\"\x27]/i) || duoAuthHtml.match(/\"sid\":\s*\"([^\"]+)\"/);
        if (sidMatch) sid = sidMatch[1];
      }
      if (!sid) {
        throw new LearnError('MFA_FAILED', 'Could not establish Duo session ID.');
      }

      const duoPromptUrl = `https://${duo.host}/frame/prompt`;
      const promptParams = new URLSearchParams({
        sid,
        factor: 'auto',
        device: 'phone1',
        out_of_date: 'false'
      });
      const promptRes = await fetchWithJar(duoPromptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: promptParams.toString()
      });
      const promptData = await promptRes.json().catch(() => ({}));
      if (promptData.stat !== 'OK' || !promptData.response?.txid) {
        throw new LearnError('MFA_FAILED', promptData.message || 'Failed to trigger Duo Push prompt.');
      }

      const txid = promptData.response.txid;
      onStatus('Duo Push sent! Please approve the notification on your phone (tap Approve / Check)...');
      // ponytail: ntfy for classic iframe path mirrors universal prompt path
      const topic = ntfyTopic || process.env.NTFY_TOPIC;
      if (topic) {
        const ntfyUrl = topic.startsWith('http') ? topic : `https://ntfy.sh/${topic}`;
        fetcher(ntfyUrl, {
          method: 'POST',
          body: 'Approve the Waterloo LEARN sign-in in Duo Mobile.',
          headers: { 'Title': 'Waterloo Duo approval needed', 'Priority': 'urgent', 'Tags': 'key,lock' },
          signal: AbortSignal.timeout(5000)
        }).catch(() => {});
      }

      const statusUrl = `https://${duo.host}/frame/status`;
      let approvedCookie = null;
      while (Date.now() - startTime < timeoutMs) {
        await new Promise(r => setTimeout(r, 1500));
        const statusRes = await fetchWithJar(statusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ sid, txid }).toString()
        });
        const statusData = await statusRes.json().catch(() => ({}));
        if (statusData.stat === 'OK') {
          if (statusData.response?.result === 'SUCCESS') {
            approvedCookie = statusData.response.cookie;
            onStatus('Duo Push approved! Submitting authentication callback to ADFS...');
            break;
          } else if (statusData.response?.result === 'FAILURE') {
            throw new LearnError('MFA_DENIED', statusData.response.message || 'Duo Push was denied.');
          }
        }
      }

      if (!approvedCookie) {
        throw new LearnError('TIMEOUT', 'Duo Push approval timed out waiting for phone response.');
      }

      const sigResponse = `${approvedCookie}${delim}${app}`;
      const postActionUrl = new URL(duo.postAction || adfsForm.action, nextUrl).href;
      const existingInputs = extractAllInputs(pageText);

      const duoCallbackRes = await fetchWithJar(postActionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          ...existingInputs,
          AuthMethod: 'DuoSecurityAdapter',
          sig_response: sigResponse
        }).toString()
      });

      const cbRedir = await followRedirects(duoCallbackRes, postActionUrl);
      res = cbRedir.res;
      nextUrl = cbRedir.url;
      pageText = await res.text();
    }
  }

  // Step 4: Follow SAML forms and redirects back to D2L
  for (let i = 0; i < 10; i++) {
    const s1 = jar.findCookie('d2lSessionVal');
    const s2 = jar.findCookie('d2lSecureSessionVal');
    if (s1 && s2) {
      onStatus('Successfully received D2L session cookies!');
      return { session: s1, secureSession: s2, cookies: jar.toJSON() };
    }

    const samlForm = extractSAMLForm(pageText) || extractForm(pageText);
    if (samlForm && (samlForm.fields.SAMLResponse || samlForm.action.includes('saml') || samlForm.action.includes('d2l'))) {
      const samlAction = new URL(samlForm.action, nextUrl).href;
      onStatus(`Forwarding SAML assertion to ${new URL(samlAction).hostname}...`);
      res = await fetchWithJar(samlAction, {
        method: samlForm.method || 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(samlForm.fields).toString()
      });

      const sRedir = await followRedirects(res, samlAction);
      res = sRedir.res;
      nextUrl = sRedir.url;
      pageText = await res.text();
      continue;
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const r = await followRedirects(res, nextUrl);
      res = r.res;
      nextUrl = r.url;
      pageText = await res.text();
      continue;
    }

    break;
  }

  const session = jar.findCookie('d2lSessionVal');
  const secureSession = jar.findCookie('d2lSecureSessionVal');
  if (!session || !secureSession) {
    throw new LearnError('LOGIN_FAILED', `Authentication finished at ${nextUrl} but D2L session cookies were not captured.`);
  }

  onStatus('Successfully captured D2L session cookies!');
  return { session, secureSession, cookies: jar.toJSON() };
}

