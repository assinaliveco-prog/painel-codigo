# Painel de Codigo

Painel web que mostra, em tempo real, o **codigo de login (2FA)** de uma conta
Microsoft compartilhada com o time. Um leitor le a caixa de e-mail e joga o
codigo no painel; a galera abre um link e ve o codigo.

**So codigo de LOGIN passa.** E-mail de troca/recuperacao de senha e bloqueado.

```
Microsoft envia codigo  ->  caixa de e-mail  ->  leitor  ->  Painel (VPS)  ->  Galera ve
```

## Como o leitor le a caixa

Duas opcoes (escolha uma):

- **A) Microsoft Graph (recomendado p/ Hotmail/Outlook):** o proprio painel le a
  conta Microsoft direto, via OAuth. Sem reencaminho, sem Gmail. Roda na VPS
  (PC desligado ok). E o caminho certo porque a Microsoft desligou IMAP/senha
  basica em contas pessoais.
- **B) Google Apps Script (alternativa):** se o codigo chega/ e reencaminhado pra
  um **Gmail**, um script no Gmail le e faz `POST /ingest`. Ver `apps-script/Code.gs`.

Ambos terminam chamando o mesmo `ingest()` no servidor, que extrai o codigo e
filtra os e-mails de senha.

---

## Pre-requisitos

- VPS (Ubuntu) com Docker — ou EasyPanel (recomendado; faz HTTPS sozinho).
- Um dominio/subdominio apontando pra VPS (ex: `codigos.seudominio.com`).
- A conta Microsoft que recebe o codigo (ex: `xxxx@hotmail.com`).

---

## Parte 1 — Subir o app

### Com EasyPanel (recomendado)
1. Coloque este projeto num repo Git (pode ser privado).
2. EasyPanel -> **Create -> App** -> Source: seu repo -> Build: **Dockerfile**.
3. **Environment:** copie do `.env.example` (DOMAIN, PANEL_SLUG, INGEST_TOKEN,
   ACCOUNT_LABEL, PORT=8080, e os `MS_*` da Parte 2).
4. **Volume:** monte em `/data` (historico de codigos).
5. **Domains:** adicione seu dominio na porta `8080` (HTTPS automatico).
6. Teste: `https://SEU_DOMINIO/health` -> `{"ok":true}`.

### Com Docker Compose (sem EasyPanel)
`cp .env.example .env`, preencha, e `docker compose up -d --build`
(usa o Caddy do projeto pra HTTPS). Nesse caso o painel fica em
`https://SEU_DOMINIO/p/<PANEL_SLUG>`.

---

## Parte 2 — Leitor via Microsoft Graph (le o Hotmail direto)

### 2.1 Registrar um app no Azure (uma vez, gratis)
1. Acesse **https://entra.microsoft.com** (ou portal.azure.com) logado **com a
   conta que recebe o codigo**.
2. **App registrations -> New registration**.
   - Nome: `painel-leitor`
   - Supported account types: **Personal Microsoft accounts only**
   - Register.
3. Copie o **Application (client) ID**.
4. **Authentication -> Advanced settings -> Allow public client flows = Yes** -> Save.
5. **API permissions -> Add -> Microsoft Graph -> Delegated**: adicione
   **Mail.Read** e **offline_access**. (Conta pessoal nao precisa de admin consent.)

### 2.2 Pegar o refresh token (uma vez)
Na VPS ou no PC (Node 18+), dentro da pasta do projeto:

```bash
MS_CLIENT_ID=<seu_client_id> node app/get-token.js
```

Abra o link mostrado, digite o codigo, faca login na conta do codigo e aceite.
No fim ele imprime `MS_CLIENT_ID` e `MS_REFRESH_TOKEN`.

### 2.3 Configurar e religar
Coloque no Environment (EasyPanel) ou no `.env`:

```
MS_CLIENT_ID=...
MS_REFRESH_TOKEN=...
```

Redeploy. No log deve aparecer `[poller] leitor Graph LIGADO`. Pronto: o painel
le a caixa a cada 1 minuto.

> **Alternativa (Apps Script / Gmail):** deixe os `MS_*` vazios e siga o
> `apps-script/Code.gs` (cole no script.google.com, ajuste `BUSCA` e
> `INGEST_TOKEN`, rode `instalarGatilho`). Util se o codigo chega num Gmail.

---

## Parte 3 — Teste de ponta a ponta

1. Faca login na conta Microsoft e peca "codigo por e-mail".
2. Em ~1 min o codigo aparece em `https://SEU_DOMINIO/p/<PANEL_SLUG>`.
3. Faca "esqueci a senha" e confirme que esse codigo **NAO** aparece (filtrado).

---

## Seguranca e operacao

- **O link do painel = acesso ao codigo.** Trate como senha. Nao poste em grupo grande.
- **Revogar o link:** troque `PANEL_SLUG` e redeploy. O link antigo morre na hora.
- **Revogar o leitor:** apague o app no Azure (ou tire `MS_REFRESH_TOKEN`).
- **Logs:** EasyPanel -> Logs (procure `[poller]`).
- **Ajustar filtro de senha / remetente:** `RESET_TERMS` no `app/server.js`,
  `MS_SENDER` no `.env`.

---

## Estrutura

```
painel-codigo/
├─ app/
│  ├─ server.js          # servidor HTTP + ingest() (extrai codigo, filtra senha)
│  ├─ poller.js          # leitor do Hotmail via Microsoft Graph
│  ├─ get-token.js       # pega o refresh token (device code), 1 vez
│  ├─ lib/msgraph.js     # cliente Graph (sem deps)
│  └─ public/panel.html  # a pagina do painel
├─ apps-script/Code.gs   # leitor alternativo (Gmail)
├─ Dockerfile
├─ docker-compose.yml    # so se NAO usar EasyPanel
├─ Caddyfile             # so se NAO usar EasyPanel
└─ .env.example
```
