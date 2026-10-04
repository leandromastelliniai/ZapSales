#!/usr/bin/env node
/**
 * Dublê HTTP dos SaaS que o e2e não pode alcançar de verdade (Resend).
 * Issue #179.
 *
 * ── POR QUE UM SERVIDOR DE VERDADE, E NÃO UM MOCK EM PROCESSO ─────────────
 *
 * O produto fala com eles por HTTP, de dentro do processo do servidor
 * Next (`next start`), não de dentro do teste. Um `vi.mock()`/intercept de
 * `fetch` viveria no processo do PLAYWRIGHT e o servidor sob teste continuaria
 * batendo na internet: o teste passaria a medir o dublê, não o produto. A
 * doutrina de QA visual do CLAUDE.md pede a mesma coisa em outras palavras —
 * efeito colateral externo se prova com receptor real, não com mock em
 * processo.
 *
 * Por isso este arquivo é um servidor HTTP de verdade: sobe, escuta numa
 * porta, responde o que o SaaS responderia, e GUARDA o que recebeu para que o
 * teste possa afirmar depois ("o e-mail saiu?").
 *
 * ── O QUE ELE DUBLA ───────────────────────────────────────────────────────
 *
 * Resend (`https://api.resend.com`):
 *   POST /emails                    → 200 { id }
 *   GET  /emails/:id                → 200 { id, to, subject, last_event }
 *
 * Plano de controle (não existe no SaaS, existe para o teste):
 *   GET    /__duble/saude           → 200 { ok, resend, porta }
 *   GET    /__duble/recebidos       → 200 { total, requisicoes: [...] }
 *   DELETE /__duble/recebidos       → 204 (zera a caixa)
 *
 * ── COMO O APP CHEGA AQUI ────────────────────────────────────────────────
 *
 * Pela env, nunca por edição de código:
 *   RESEND_API_BASE_URL     (default do produto: https://api.resend.com)
 * O `.env.e2e` é quem carrega esse valor, e ele só é aceito em localhost —
 * a guarda está em `playwright.config.ts` e não foi tocada.
 *
 * Quando a env não é setada, os defaults do produto valem e este servidor não
 * é alcançado: é isso que mantém a produção fora do caminho.
 *
 * Zero dependências (só `node:http`/`node:url`): o passo do CI não pode
 * depender de `pnpm install` ter dado certo para conseguir subir o dublê.
 *
 * Uso:  node scripts/duble-saas-e2e.mjs [--porta 3997] [--host 127.0.0.1]
 */

import http from "node:http";
import { URL } from "node:url";

// ── Configuração ───────────────────────────────────────────────────────────

/**
 * Porta 3997: vizinha de 3998 (Redis HTTP) e 3999 (WAHA), que o
 * `scripts/gerar-env-e2e.sh` já fixa. As três cabem na mesma régua.
 */
const PORTA = Number(process.env.DUBLE_SAAS_PORTA ?? 3997);
const HOST = process.env.DUBLE_SAAS_HOST ?? "127.0.0.1";

/**
 * Teto da caixa de entrada. Um teste que dispara e-mail em laço não pode
 * derrubar o runner por memória; 500 é folgado para as specs do repo, que
 * mandam unidades por cenário.
 */
const TETO_RECEBIDOS = 500;

// ── Estado (em memória, por processo) ──────────────────────────────────────

/** @type {Array<{t: string, metodo: string, caminho: string, corpo: unknown}>} */
const recebidos = [];
/** @type {Map<string, {id: string, to: unknown, subject: string, html: string, last_event: string}>} */
const emails = new Map();
let seq = 0;

function registrar(metodo, caminho, corpo) {
  recebidos.push({ t: new Date().toISOString(), metodo, caminho, corpo });
  if (recebidos.length > TETO_RECEBIDOS) recebidos.shift();
}

function proximoId(prefixo) {
  seq += 1;
  return `${prefixo}_${Date.now().toString(36)}${seq.toString(36)}`;
}

// ── Utilidades HTTP ────────────────────────────────────────────────────────

async function lerCorpo(req) {
  const pedacos = [];
  for await (const p of req) pedacos.push(p);
  const cru = Buffer.concat(pedacos).toString("utf8");
  if (!cru) return undefined;
  try {
    return JSON.parse(cru);
  } catch {
    // Corpo não-JSON é guardado como está: é sinal de que o produto mudou o
    // formato, e o teste merece ver isso em vez de um `undefined` silencioso.
    return cru;
  }
}

function responder(res, status, corpo, extras = {}) {
  const cabecalhos = { "content-type": "application/json", ...extras };
  const texto = corpo === undefined ? "" : JSON.stringify(corpo);
  res.writeHead(status, cabecalhos);
  res.end(texto);
}

/** O `Bearer` que o Resend usa. Sem chave, o SaaS real devolve 401. */
function autorizadoResend(req) {
  const cabecalho = req.headers.authorization ?? "";
  return /^Bearer\s+\S+/i.test(cabecalho);
}

// ── Rotas: Resend ──────────────────────────────────────────────────────────

function resendCriarEmail(req, corpo, res) {
  if (!autorizadoResend(req)) {
    // 401 de verdade: um dublê permissivo esconderia do teste que o produto
    // parou de mandar a chave.
    return responder(res, 401, { statusCode: 401, name: "missing_api_key", message: "Missing API key" });
  }
  const id = proximoId("email");
  const registro = {
    id,
    to: corpo?.to ?? null,
    subject: corpo?.subject ?? "",
    html: corpo?.html ?? "",
    last_event: "delivered",
  };
  emails.set(id, registro);
  return responder(res, 200, { id });
}

// ── Roteador ───────────────────────────────────────────────────────────────

async function rotear(req, res) {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORTA}`);
  const metodo = req.method ?? "GET";
  const partes = url.pathname.split("/").filter(Boolean);
  const corpo = ["POST", "PUT", "PATCH"].includes(metodo) ? await lerCorpo(req) : undefined;

  if (!partes[0]?.startsWith("__duble")) {
    registrar(metodo, url.pathname + url.search, corpo);
  }

  // ── Plano de controle ──
  if (partes[0] === "__duble") {
    if (partes[1] === "saude") {
      return responder(res, 200, {
        ok: true,
        porta: PORTA,
        recebidos: recebidos.length,
        emails: emails.size,
        resend: "POST /emails · GET /emails/:id",
      });
    }
    if (partes[1] === "recebidos") {
      if (metodo === "DELETE") {
        recebidos.length = 0;
        return responder(res, 204, undefined);
      }
      return responder(res, 200, { total: recebidos.length, requisicoes: recebidos });
    }
    return responder(res, 404, { error: "rota_de_controle_desconhecida" });
  }

  // ── Resend ──
  if (partes[0] === "emails") {
    // `req` vai junto: `autorizadoResend` lê o `Authorization` do cabeçalho, e
    // sem ele o 401 de verdade (chave ausente) virava 500 — o dublê escondia do
    // teste justamente o que ele existe para mostrar.
    if (metodo === "POST") return resendCriarEmail(req, corpo, res);
    if (metodo === "GET" && partes[1]) {
      const email = emails.get(partes[1]);
      if (!email) return responder(res, 404, { statusCode: 404, name: "not_found", message: "Email not found" });
      return responder(res, 200, email);
    }
    return responder(res, 405, { error: "method_not_allowed" });
  }

  return responder(res, 404, { error: "rota_desconhecida", caminho: url.pathname });
}

const servidor = http.createServer((req, res) => {
  // `res.req` é usado por `autorizadoResend`; em node >= 18 já existe, mas
  // fixar aqui deixa a dependência explícita em vez de implícita.
  res.req = req;
  rotear(req, res).catch((erro) => {
    responder(res, 500, { error: "erro_no_duble", detalhe: String(erro?.message ?? erro) });
  });
});

servidor.listen(PORTA, HOST, () => {
  const base = `http://${HOST}:${PORTA}`;
  console.log(`[duble-saas] ouvindo em ${base}`);
  console.log(`[duble-saas] resend     → RESEND_API_BASE_URL=${base}`);
  console.log(`[duble-saas] saúde      → ${base}/__duble/saude`);
});

for (const sinal of ["SIGINT", "SIGTERM"]) {
  process.on(sinal, () => {
    servidor.close(() => process.exit(0));
  });
}
