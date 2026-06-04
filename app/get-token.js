'use strict';

/**
 * Pega o refresh_token UMA vez (consentimento via device code).
 *
 * Uso (na VPS ou no PC, com Node 18+):
 *   MS_CLIENT_ID=<seu_client_id> node app/get-token.js
 *   (ou)  node app/get-token.js <seu_client_id>
 *
 * Faca login com a conta que recebe o codigo (platty764@hotmail.com) e aceite.
 * No fim ele imprime MS_CLIENT_ID e MS_REFRESH_TOKEN pra voce colar no .env / EasyPanel.
 */

const { startDeviceCode, pollToken } = require('./lib/msgraph');

(async function () {
  const clientId = process.env.MS_CLIENT_ID || process.argv[2];
  if (!clientId) {
    console.error('Falta o client id. Uso:  MS_CLIENT_ID=xxxx node app/get-token.js');
    process.exit(1);
  }

  const dc = await startDeviceCode(clientId);
  if (dc.status !== 200 || !dc.json.device_code) {
    console.error('Falha ao iniciar device code:', JSON.stringify(dc.json));
    process.exit(1);
  }
  const d = dc.json;

  console.log('\n=== AUTORIZE O ACESSO AO E-MAIL ===');
  console.log('1) Abra:  ' + d.verification_uri);
  console.log('2) Digite o codigo:  ' + d.user_code);
  console.log('3) Faca login com platty764@hotmail.com e aceite (Mail.Read).');
  console.log('\nAguardando autorizacao...\n');

  const intervalMs = (d.interval || 5) * 1000;
  const deadline = Date.now() + (d.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise(function (r) { setTimeout(r, intervalMs); });
    const t = await pollToken(clientId, d.device_code);
    if (t.status === 200 && t.json.refresh_token) {
      console.log('\n=== PRONTO! Cole no .env (ou no Environment do EasyPanel): ===\n');
      console.log('MS_CLIENT_ID=' + clientId);
      console.log('MS_REFRESH_TOKEN=' + t.json.refresh_token);
      console.log('');
      process.exit(0);
    }
    const err = t.json && t.json.error;
    if (err && err !== 'authorization_pending' && err !== 'slow_down') {
      console.error('Erro:', err, '-', (t.json.error_description || '').split('\n')[0]);
      process.exit(1);
    }
  }
  console.error('Tempo esgotado. Rode de novo.');
  process.exit(1);
})();
