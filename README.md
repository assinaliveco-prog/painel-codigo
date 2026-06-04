# Painel de Codigo

Painel web que mostra, em tempo real, o **codigo de login (2FA)** de uma conta
Microsoft compartilhada com o time. O codigo chega no Gmail, um script do Google
le e envia pro painel, e a galera abre um link pra ver o codigo.

**So codigo de LOGIN passa.** Email de troca/recuperacao de senha e bloqueado e
NAO aparece no painel.

```
Microsoft manda codigo  ->  Gmail recebe  ->  Apps Script le  ->  Painel (VPS)  ->  Galera ve
```

---

## Peças

| Peça | Onde roda | O que faz |
|------|-----------|-----------|
| **Leitor** (`apps-script/Code.gs`) | Dentro do seu Gmail | A cada 1 min acha o codigo de login, ignora reset de senha, envia pro painel |
| **App** (`app/server.js`) | VPS (Docker) | Recebe o codigo e serve o painel num link secreto |
| **Caddy** | VPS (Docker) | HTTPS automatico no seu dominio |

---

## Pre-requisitos

- Uma **VPS Ubuntu/Debian** com **Docker** e **docker compose** instalados.
- Um **dominio** (ou subdominio) com registro **DNS tipo A** apontando pro **IP da VPS**.
  Ex: `codigos.seudominio.com  ->  203.0.113.10`
- Portas **80** e **443** abertas na VPS (firewall / security group).
- O **Gmail** ja configurado como email da conta Microsoft que recebe o codigo.

Instalar Docker na VPS (se ainda nao tiver):

```bash
curl -fsSL https://get.docker.com | sh
```

---

## Parte 1 — Subir o painel na VPS

1. **Mande a pasta `painel-codigo` pra VPS** (via `scp`, `git` ou o painel do provedor).

   Pelo Windows (PowerShell), por exemplo:
   ```powershell
   scp -r C:\Users\jvcom\painel-codigo  usuario@IP_DA_VPS:~/
   ```

2. **Na VPS, entre na pasta e crie o `.env`:**
   ```bash
   cd painel-codigo
   cp .env.example .env
   ```

3. **Gere os segredos** e cole no `.env`:
   ```bash
   echo "PANEL_SLUG=$(openssl rand -hex 16)"
   echo "INGEST_TOKEN=$(openssl rand -hex 24)"
   ```
   Edite o `.env` (`nano .env`) e preencha:
   - `DOMAIN` = seu dominio (ex: `codigos.seudominio.com`)
   - `PANEL_SLUG` = o valor gerado acima
   - `INGEST_TOKEN` = o valor gerado acima
   - `ACCOUNT_LABEL` = nome que aparece no painel

4. **Suba:**
   ```bash
   docker compose up -d --build
   ```

5. **Teste:**
   - `https://SEU_DOMINIO/health` deve responder `{"ok":true}`
   - O painel fica em: `https://SEU_DOMINIO/p/SEU_PANEL_SLUG`
     (esse e o link que voce passa pra galera — guarde com cuidado)

   Ver logs: `docker compose logs -f app`

> Na primeira vez o Caddy leva ~30s pra emitir o certificado HTTPS. Se der erro
> de certificado, confira que o DNS ja aponta pro IP e que as portas 80/443 estao abertas.

---

## Parte 2 — Configurar o leitor (Google Apps Script)

1. Abra **https://script.google.com** -> **Novo projeto**.
2. Apague o conteudo e **cole todo o `apps-script/Code.gs`**.
3. No topo do arquivo, preencha:
   - `INGEST_URL` = `https://SEU_DOMINIO/ingest`
   - `INGEST_TOKEN` = **o mesmo** `INGEST_TOKEN` do `.env`
4. Salve (Ctrl+S).
5. Rode a funcao **`instalarGatilho`** uma vez. O Google vai pedir **autorizacao**
   pra acessar seu Gmail -> aprove (a tela "app nao verificado" e normal por ser
   seu proprio script: avancado -> continuar).
6. Pra testar agora, rode **`verificarCodigos`** manualmente e veja os logs.

Pronto. A partir daqui o script roda sozinho a cada 1 minuto.

---

## Parte 3 — Teste de ponta a ponta

1. Tente **entrar na conta Microsoft** e peça o **codigo por email**.
2. Em ate ~1 minuto o codigo aparece no **painel**.
3. Faça um teste de **"esqueci a senha"** e confirme que esse codigo **NAO** aparece
   no painel (foi bloqueado).

---

## Seguranca e operacao

- **O link do painel = acesso ao codigo.** Quem tem o link pega o codigo e entra na
  conta. Trate o link como senha: nao jogue em grupo grande, nao poste print.
- **Trocar o link (revogar acesso):** gere um novo `PANEL_SLUG` no `.env` e rode
  `docker compose up -d`. O link antigo para de funcionar na hora.
- **Atualizar a conta na Microsoft:** o codigo precisa cair no Gmail configurado.
  Mantenha esse Gmail como metodo de "enviar codigo por email" da conta.
- **Logs do leitor:** no Apps Script, menu **Execucoes**.
- **Ajustar o filtro de senha:** edite a lista `BLOQUEIO` em `Code.gs`.
- **Outro remetente / idioma:** ajuste `REMETENTE` e o regex `extrairCodigo_` em `Code.gs`.

---

## Estrutura

```
painel-codigo/
├─ app/
│  ├─ server.js          # servidor HTTP (Node puro, sem deps)
│  ├─ package.json
│  └─ public/panel.html  # a pagina do painel
├─ apps-script/Code.gs   # leitor do Gmail (cola no script.google.com)
├─ Dockerfile
├─ docker-compose.yml
├─ Caddyfile             # HTTPS automatico
├─ .env.example          # copie pra .env e preencha
└─ README.md
```
