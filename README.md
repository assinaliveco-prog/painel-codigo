# Painel de Codigo

Painel web que mostra, em tempo real, o **codigo de login (2FA)** de uma conta
Microsoft compartilhada com o time. Um leitor le a caixa de e-mail e joga o
codigo no painel; a galera abre um link e ve o codigo.

**So codigo de LOGIN passa.** E-mail de troca/recuperacao de senha e bloqueado.

```
Microsoft envia codigo  ->  caixa Hotmail/Outlook  ->  leitor IMAP (na VPS)  ->  Painel  ->  Galera ve
```

## Como o leitor le o Hotmail

A Microsoft desligou senha basica (IMAP) e bloqueia registrar app (Graph) em
contas pessoais sem diretorio. Entao o leitor usa **IMAP + OAuth2 com device-code**,
autenticando por um **client_id publico de cliente de e-mail** (o do Thunderbird) -
o mesmo metodo de Thunderbird/DavMail. O dono da caixa autoriza uma vez; o leitor
roda na VPS (PC desligado, ok).

> E um workaround. Funciona hoje; se a Microsoft mudar a politica, basta trocar
> para o caminho de reencaminho (Outlook -> outra caixa) descrito no fim.

Tudo termina chamando `ingest()` no servidor, que extrai o codigo e filtra os
e-mails de senha. O `POST /ingest` continua disponivel para outras fontes.

---

## Pre-requisitos

- VPS com EasyPanel (recomendado; faz HTTPS sozinho) ou Docker.
- A conta Microsoft que recebe o codigo (ex: `xxxx@hotmail.com`) e a senha dela
  (para o login de consentimento, feito por VOCE).

---

## Parte 1 — Subir o app

### EasyPanel
1. Projeto -> Create App -> Source: este repo (GitHub) -> Build: **Dockerfile**.
2. **Environment:** copie do `.env.example` (PANEL_SLUG, INGEST_TOKEN, ACCOUNT_LABEL,
   PORT=8080, DATA_DIR=/data) e os `MS_*` da Parte 2.
3. **Volume:** monte em `/data`.
4. **Domains:** adicione o dominio (ou use o `*.easypanel.host` gerado) na porta `8080`.
5. Teste: `https://SEU_DOMINIO/health` -> `{"ok":true}`.

### Docker Compose (sem EasyPanel)
`cp .env.example .env`, preencha, `docker compose up -d --build`.

---

## Parte 2 — Ligar o leitor IMAP

1. **Pegar o refresh token** (uma vez). Na VPS ou no PC (Node 18+), na pasta do projeto:
   ```bash
   npm install --prefix app
   node app/get-token.js
   ```
   Abra o link mostrado, digite o codigo, faca login na conta do e-mail e aceite o
   acesso IMAP. Ele imprime o `MS_REFRESH_TOKEN`.

2. **Configurar** no Environment (EasyPanel) ou no `.env`:
   ```
   MS_USER=xxxx@hotmail.com
   MS_REFRESH_TOKEN=...
   ```
   (`MS_CLIENT_ID`, `MS_AUTHORITY`, `IMAP_HOST` tem defaults corretos.)

3. **Redeploy.** No log deve aparecer `[poller] leitor IMAP do Hotmail LIGADO`.

---

## Parte 3 — Teste de ponta a ponta

1. Faca login na conta Microsoft e peca "codigo por e-mail".
2. Em ~1 min o codigo aparece em `https://SEU_DOMINIO/p/<PANEL_SLUG>`.
3. Faca "esqueci a senha" e confirme que esse codigo **NAO** aparece (filtrado).

---

## Seguranca e operacao

- **O link do painel = acesso ao codigo.** Trate como senha. Nao poste em grupo grande.
- **Revogar o link:** troque `PANEL_SLUG` e redeploy.
- **Revogar o leitor:** em https://account.microsoft.com -> apps e dispositivos
  conectados, remova o acesso; ou apague `MS_REFRESH_TOKEN`.
- **Logs:** procure `[poller]`.
- **Ajustar filtro de senha / remetente:** `RESET_TERMS` no `app/server.js`, `MS_SENDER` no env.

### Plano B (se o IMAP/OAuth parar de funcionar)
Crie uma regra no Outlook.com que reencaminha os e-mails de
`account-security-noreply@accountprotection.microsoft.com` para um Gmail, e use o
`apps-script/Code.gs` (cole no script.google.com) para ler esse Gmail e chamar
`POST /ingest`.

---

## Estrutura

```
painel-codigo/
├─ app/
│  ├─ server.js          # servidor HTTP + ingest() (extrai codigo, filtra senha)
│  ├─ poller.js          # leitor IMAP+OAuth do Hotmail
│  ├─ get-token.js       # pega o refresh token (device code), 1 vez
│  ├─ lib/msoauth.js     # OAuth2 device-code/refresh (client publico)
│  ├─ package.json       # deps: imapflow, mailparser
│  └─ public/panel.html  # a pagina do painel
├─ apps-script/Code.gs   # leitor alternativo (Plano B, via Gmail)
├─ Dockerfile
└─ .env.example
```
