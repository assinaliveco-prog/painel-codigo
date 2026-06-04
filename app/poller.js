'use strict';

/**
 * Leitor do Hotmail/Outlook via IMAP + OAuth2.
 * A cada POLL_INTERVAL_MS: renova o token, conecta no IMAP (XOAUTH2), pega
 * mensagens novas do remetente de seguranca da Microsoft, e entrega cada uma
 * pro callback onCode(). Extracao do codigo + filtro de senha ficam no server.
 *
 * Desligado automaticamente se MS_REFRESH_TOKEN / MS_USER nao existirem.
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { refreshAccessToken } = require('./lib/msoauth');

const USER = process.env.MS_USER || '';
const HOST = process.env.IMAP_HOST || 'outlook.office365.com';
const SENDER = (process.env.MS_SENDER || 'account-security-noreply@accountprotection.microsoft.com').toLowerCase();
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || '60000', 10);

function startPoller(opts) {
  const onCode = (opts && opts.onCode) || function () {};
  const refreshToken = process.env.MS_REFRESH_TOKEN;

  if (!refreshToken || !USER) {
    console.log('[poller] sem MS_REFRESH_TOKEN/MS_USER -> leitor IMAP DESLIGADO (ok se usa /ingest).');
    return;
  }

  let lastUid = 0;
  let primed = false;
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    let client;
    try {
      const tok = await refreshAccessToken(refreshToken);
      client = new ImapFlow({
        host: HOST,
        port: 993,
        secure: true,
        auth: { user: USER, accessToken: tok.access_token },
        logger: false,
        emitLogs: false,
      });
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        if (!primed) {
          // no boot: marca o topo da caixa e NAO despeja historico antigo
          const st = await client.status('INBOX', { uidNext: true });
          lastUid = Math.max(0, (st.uidNext || 1) - 1);
          primed = true;
        } else {
          for await (const msg of client.fetch({ uid: (lastUid + 1) + ':*' }, { uid: true, source: true })) {
            if (msg.uid <= lastUid) continue; // ignora o re-retorno do topo (quirk N:*)
            lastUid = msg.uid;
            try {
              const mail = await simpleParser(msg.source);
              const from = ((mail.from && mail.from.value && mail.from.value[0] && mail.from.value[0].address) || '').toLowerCase();
              if (SENDER && from && from !== SENDER) continue;
              onCode({
                subject: mail.subject || '',
                text: mail.text || '',
                html: mail.html || '',
                receivedAt: (mail.date ? mail.date.toISOString() : undefined),
              });
            } catch (e) {
              console.error('[poller] parse erro:', e.message);
            }
          }
        }
      } finally {
        lock.release();
      }
    } catch (e) {
      console.error('[poller] erro:', e.message);
    } finally {
      if (client) { try { await client.logout(); } catch (e) {} }
      running = false;
    }
  }

  tick();
  setInterval(tick, POLL_MS);
  console.log('[poller] leitor IMAP do Hotmail LIGADO (a cada ' + POLL_MS + 'ms, conta ' + USER + ').');
}

module.exports = { startPoller };
