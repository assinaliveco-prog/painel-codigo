/**
 * LEITOR DE CODIGO - Google Apps Script
 * -------------------------------------
 * Roda dentro da conta do Gmail que recebe os codigos da Microsoft.
 * A cada 1 minuto: procura emails de codigo de LOGIN, extrai o codigo,
 * IGNORA emails de troca/recuperacao de senha, e envia pro painel.
 *
 * COMO INSTALAR:
 *   1. Abra  https://script.google.com  -> Novo projeto.
 *   2. Apague o conteudo e cole TODO este arquivo.
 *   3. Preencha INGEST_URL e INGEST_TOKEN abaixo.
 *   4. Salve. Rode a funcao  instalarGatilho  uma vez (vai pedir autorizacao
 *      do Gmail -> aprove). Pronto: roda sozinho de 1 em 1 minuto.
 *   5. Pra testar agora, rode a funcao  verificarCodigos  manualmente.
 */

// ============== CONFIG (preencha) ==============
var INGEST_URL = 'https://agentflop-painel.u0pugl.easypanel.host/ingest'; // /ingest do painel
var INGEST_TOKEN = 'COLE_AQUI_O_MESMO_INGEST_TOKEN_DO_ENV'; // igual ao INGEST_TOKEN do .env
// ===============================================

// Como o script ACHA os e-mails do codigo:
//  - Se o codigo chega DIRETO neste Gmail  -> deixe o remetente da Microsoft (padrao abaixo).
//  - Se voce REENCAMINHA do Outlook pra ca -> troque por o destino, ex:
//       var BUSCA = 'to:seuemail+mscode@gmail.com';
var BUSCA = 'from:account-security-noreply@accountprotection.microsoft.com';

// Rotulo usado pra marcar emails ja processados (evita enviar 2x).
var PROCESSED_LABEL = 'PainelCodigoProcessado';

// Palavras que indicam TROCA/RECUPERACAO de senha -> esses NAO passam.
var BLOQUEIO = [
  'redefin', 'recuper', 'reset your password', 'password reset',
  'alterar a senha', 'alterar sua senha', 'change your password'
];

function verificarCodigos() {
  var label = getOrCreateLabel_(PROCESSED_LABEL);
  var query = BUSCA + ' newer_than:1d -label:' + PROCESSED_LABEL;
  var threads = GmailApp.search(query, 0, 20);

  for (var i = 0; i < threads.length; i++) {
    var msgs = threads[i].getMessages();
    for (var j = 0; j < msgs.length; j++) {
      try {
        processarMensagem_(msgs[j]);
      } catch (e) {
        Logger.log('erro na mensagem: ' + e);
      }
    }
    threads[i].addLabel(label); // marca como processado
  }
}

function processarMensagem_(msg) {
  var subject = msg.getSubject() || '';
  var body = msg.getPlainBody() || '';
  var texto = subject + '\n' + body;
  var low = texto.toLowerCase();

  // FILTRO: so codigo de LOGIN. Bloqueia troca de senha.
  for (var b = 0; b < BLOQUEIO.length; b++) {
    if (low.indexOf(BLOQUEIO[b]) !== -1) {
      Logger.log('ignorado (parece senha): ' + subject);
      return;
    }
  }

  var code = extrairCodigo_(texto);
  if (!code) {
    Logger.log('sem codigo legivel: ' + subject);
    return;
  }

  enviarCodigo_(code, msg.getDate(), subject);
}

function extrairCodigo_(texto) {
  // 1) tenta achar o codigo rotulado: "Codigo de seguranca: 1234567"
  var m = texto.match(/(?:c[oó]digo de seguran[cç]a|security code|c[oó]digo|code)[:\s]*([0-9]{4,8})/i);
  if (m) return m[1];
  // 2) fallback: primeiro numero isolado de 6-7 digitos
  m = texto.match(/\b([0-9]{6,7})\b/);
  if (m) return m[1];
  return null;
}

function enviarCodigo_(code, date, subject) {
  var payload = {
    code: code,
    receivedAt: (date ? date.toISOString() : new Date().toISOString()),
    subject: subject
  };
  var resp = UrlFetchApp.fetch(INGEST_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + INGEST_TOKEN },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  Logger.log('enviado codigo ' + code + ' -> HTTP ' + resp.getResponseCode());
}

function getOrCreateLabel_(name) {
  var label = GmailApp.getUserLabelByName(name);
  if (!label) label = GmailApp.createLabel(name);
  return label;
}

/** Rode UMA vez pra criar o gatilho que executa a cada 1 minuto. */
function instalarGatilho() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'verificarCodigos') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('verificarCodigos').timeBased().everyMinutes(1).create();
  Logger.log('gatilho instalado: verificarCodigos a cada 1 min');
}
