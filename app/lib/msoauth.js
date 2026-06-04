'use strict';

/**
 * OAuth2 device-code + refresh para acessar IMAP de uma conta Microsoft pessoal
 * (outlook/hotmail).
 *
 * Usa um client_id PUBLICO de cliente de e-mail (Thunderbird) porque a Microsoft
 * bloqueia o registro de app para contas pessoais sem diretorio. O dono da conta
 * consente via device code (login dele). E o mesmo metodo usado por Thunderbird /
 * DavMail / mutt_oauth2. Funciona para uso pessoal na propria caixa.
 */

const CLIENT_ID = process.env.MS_CLIENT_ID || '9e5f94bc-e8a4-4e73-b8be-63364c29d753'; // Thunderbird (publico)
const AUTHORITY = process.env.MS_AUTHORITY || 'https://login.microsoftonline.com/common';
const SCOPE = process.env.MS_SCOPE || 'https://outlook.office.com/IMAP.AccessAsUser.All offline_access';

async function postForm(url, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  return { status: r.status, json: json };
}

function startDeviceCode() {
  return postForm(AUTHORITY + '/oauth2/v2.0/devicecode', { client_id: CLIENT_ID, scope: SCOPE });
}

function pollToken(deviceCode) {
  return postForm(AUTHORITY + '/oauth2/v2.0/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: CLIENT_ID,
    device_code: deviceCode,
  });
}

async function refreshAccessToken(refreshToken) {
  const { status, json } = await postForm(AUTHORITY + '/oauth2/v2.0/token', {
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
    scope: SCOPE,
  });
  if (status !== 200 || !json.access_token) {
    throw new Error('refresh falhou: ' + JSON.stringify(json));
  }
  return json; // { access_token, refresh_token?, expires_in }
}

module.exports = { startDeviceCode, pollToken, refreshAccessToken, CLIENT_ID, SCOPE, AUTHORITY };
