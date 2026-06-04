'use strict';

/**
 * Cliente minimo do Microsoft Graph (sem dependencias).
 * Le e-mails de uma conta Microsoft pessoal (outlook/hotmail) via OAuth2.
 * Fluxo de consentimento: device code (sem redirect URI, ideal pra VPS).
 */

const AUTHORITY = process.env.MS_AUTHORITY || 'https://login.microsoftonline.com/consumers';
const SCOPE = 'offline_access Mail.Read';

async function postForm(url, params) {
  const body = new URLSearchParams(params).toString();
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body,
  });
  const text = await r.text();
  let jsonBody;
  try { jsonBody = JSON.parse(text); } catch (e) { jsonBody = { raw: text }; }
  return { status: r.status, json: jsonBody };
}

// 1) inicia o device code (retorna user_code + verification_uri)
function startDeviceCode(clientId) {
  return postForm(AUTHORITY + '/oauth2/v2.0/devicecode', { client_id: clientId, scope: SCOPE });
}

// 2) troca o device_code por tokens (poll ate o usuario autorizar)
function pollToken(clientId, deviceCode) {
  return postForm(AUTHORITY + '/oauth2/v2.0/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: clientId,
    device_code: deviceCode,
  });
}

// 3) renova o access_token usando o refresh_token
async function refreshAccessToken(clientId, refreshToken) {
  const { status, json } = await postForm(AUTHORITY + '/oauth2/v2.0/token', {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    scope: SCOPE,
  });
  if (status !== 200 || !json.access_token) {
    throw new Error('refresh falhou: ' + JSON.stringify(json));
  }
  return json; // { access_token, refresh_token?, expires_in }
}

// 4) busca mensagens recentes (apos sinceIso)
async function getRecentMessages(accessToken, sinceIso) {
  const params = new URLSearchParams();
  params.set('$select', 'subject,bodyPreview,receivedDateTime,from');
  params.set('$top', '15');
  params.set('$orderby', 'receivedDateTime desc');
  if (sinceIso) params.set('$filter', 'receivedDateTime gt ' + sinceIso);

  const r = await fetch('https://graph.microsoft.com/v1.0/me/messages?' + params.toString(), {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  const j = await r.json();
  if (!r.ok) throw new Error('graph erro ' + r.status + ': ' + JSON.stringify(j));
  return j.value || [];
}

module.exports = { startDeviceCode, pollToken, refreshAccessToken, getRecentMessages, SCOPE, AUTHORITY };
