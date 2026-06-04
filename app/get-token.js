'use strict';

/**
 * Pega o MS_REFRESH_TOKEN uma vez, via device code (consentimento do dono da caixa).
 *
 * Uso (na VPS ou no PC, com Node 18+), na pasta do projeto:
 *   node app/get-token.js
 *
 * Abra o link mostrado, digite o codigo, faca login na conta que recebe o codigo
 * (ex: platty764@hotmail.com) e aceite o acesso IMAP. No fim imprime os valores
 * pra colar no Environment do EasyPanel.
 */

const { startDeviceCode, pollToken, CLIENT_ID } = require('./lib/msoauth');

(async function () {
  const dc = await startDeviceCode();
  if (dc.status !== 200 || !dc.json.device_code) {
    console.error('Falha ao iniciar device code:', JSON.stringify(dc.json));
    process.exit(1);
  }
  const d = dc.json;

  console.log('\n=== AUTORIZE O ACESSO AO E-MAIL ===');
  console.log('1) Abra:  ' + d.verification_uri);
  console.log('2) Digite o codigo:  ' + d.user_code);
  console.log('3) Faca login na conta que recebe o codigo e aceite o acesso IMAP.');
  console.log('\n(client_id usado: ' + CLIENT_ID + ')');
  console.log('\nAguardando autorizacao...\n');

  const intervalMs = (d.interval || 5) * 1000;
  const deadline = Date.now() + (d.expires_in || 900) * 1000;

  while (Date.now() < deadline) {
    await new Promise(function (r) { setTimeout(r, intervalMs); });
    const t = await pollToken(d.device_code);
    if (t.status === 200 && t.json.refresh_token) {
      console.log('\n=== PRONTO! Cole no Environment do EasyPanel: ===\n');
      console.log('MS_REFRESH_TOKEN=' + t.json.refresh_token);
      console.log('\n(e confirme que MS_USER esta com o e-mail certo)\n');
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
