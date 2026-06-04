'use strict';

/**
 * Leitor do Hotmail/Outlook via Microsoft Graph.
 * A cada POLL_INTERVAL_MS: renova token, busca e-mails novos do remetente
 * de seguranca da Microsoft, e entrega cada um pro callback onCode().
 * A extracao do codigo + filtro de "troca de senha" ficam no server (ingest).
 *
 * Desligado automaticamente se MS_CLIENT_ID / MS_REFRESH_TOKEN nao existirem.
 */

const { refreshAccessToken, getRecentMessages } = require('./lib/msgraph');

const SENDER = (process.env.MS_SENDER || 'account-security-noreply@accountprotection.microsoft.com').toLowerCase();
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);

function startPoller(opts) {
  const clientId = process.env.MS_CLIENT_ID;
  let refreshToken = process.env.MS_REFRESH_TOKEN;
  const onCode = (opts && opts.onCode) || function () {};

  if (!clientId || !refreshToken) {
    console.log('[poller] MS_CLIENT_ID/MS_REFRESH_TOKEN ausentes -> leitor Graph DESLIGADO (ok se usa /ingest ou Apps Script).');
    return;
  }

  let accessToken = null;
  let tokenExp = 0;
  // no boot, olha so os ultimos 10 min pra nao despejar historico velho
  let since = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  async function ensureToken() {
    if (accessToken && Date.now() < tokenExp - 60000) return accessToken;
    const j = await refreshAccessToken(clientId, refreshToken);
    accessToken = j.access_token;
    tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
    if (j.refresh_token) refreshToken = j.refresh_token; // rotaciona em memoria
    return accessToken;
  }

  async function tick() {
    try {
      const at = await ensureToken();
      const msgs = await getRecentMessages(at, since);
      msgs.sort(function (a, b) { return new Date(a.receivedDateTime) - new Date(b.receivedDateTime); });
      for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        const fromAddr = ((m.from && m.from.emailAddress && m.from.emailAddress.address) || '').toLowerCase();
        if (SENDER && fromAddr && fromAddr !== SENDER) continue;
        onCode({ subject: m.subject || '', text: m.bodyPreview || '', receivedAt: m.receivedDateTime });
        const iso = new Date(m.receivedDateTime).toISOString();
        if (iso > since) since = new Date(new Date(m.receivedDateTime).getTime() + 1000).toISOString();
      }
    } catch (e) {
      console.error('[poller] erro:', e.message);
    }
  }

  tick();
  setInterval(tick, POLL_MS);
  console.log('[poller] leitor Graph LIGADO (intervalo ' + POLL_MS + 'ms, remetente ' + SENDER + ').');
}

module.exports = { startPoller };
