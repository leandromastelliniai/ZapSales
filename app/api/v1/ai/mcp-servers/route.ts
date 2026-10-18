import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * OS SERVIDORES MCP DE TERCEIROS da organização (Ferramentas externas › Servidores MCP) — issue #96.
 *
 *   GET  — a lista, sem nenhuma credencial (só os 4 últimos caracteres). Admin.
 *   POST — cadastra um servidor (nome, endereço HTTPS, credencial opcional e o cabeçalho que a leva)
 *          e já testa a conexão: a resposta traz o servidor e `conexao`, com a causa em português
 *          se não deu certo. O servidor é gravado mesmo assim — o administrador corrige e testa de novo.
 *          Admin, e só com o recurso LIGADO na organização.
 *
 * A credencial é cifrada e NUNCA volta, nem nesta resposta. O endereço passa pela rede segura única
 * ANTES de gravar (HTTPS, público, nunca da rede interna) e de novo a cada chamada. A organização vem
 * da sessão, nunca do corpo (o schema é `strict`). `Idempotency-Key` (uuid, TTL 24h) é aceito.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { chaveDaRequisicao, comIdempotencia } from "@/lib/api/idempotency";
import { fail, ok } from "@/lib/api/wrappers";
import { conectarAoServidor } from "@/lib/ai/ferramentas-externas/mcp/conexao";
import { criarServidorSchema } from "@/lib/ai/ferramentas-externas/mcp/esquema-api";
import { buscarServidor, criarServidor, listarServidores, type ServidorCadastrado } from "@/lib/ai/ferramentas-externas/mcp/repositorio";
import { recusaSeMcpDesligado } from "@/lib/ai/ferramentas-externas/mcp/rotas";
import { fraseDaRecusaDeEndereco } from "@/lib/ai/ferramentas-externas/tipos";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ENDPOINT = "POST /api/v1/ai/mcp-servers";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_mcp_servers" });
  if (!authz.ok) return authz.response;
  try {
    return ok(await listarServidores(createAdminClient(), authz.org.orgId), { requestId });
  } catch {
    return fail("internal_error", traduzir("Não consegui ler os servidores MCP.", authz.user.idioma), 500, { requestId });
  }
}

/** A recusa atravessa o `comIdempotencia` como exceção — assim ela não vira recibo. */
class CadastroRecusado extends Error {
  constructor(
    readonly codigo: string,
    readonly texto: string,
    readonly status: number,
  ) {
    super(texto);
  }
}

type ServidorComConexao = ServidorCadastrado & {
  conexao:
    | { ok: true; ferramentas_oferecidas: number; lista_incompleta: boolean }
    | { ok: false; motivo: string; http_status: number | null; message: string };
};

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "ai_mcp_servers" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = criarServidorSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os campos do servidor: algum valor está fora do permitido."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const dados = parsed.data;

  const chave = chaveDaRequisicao(req);
  if (chave !== null && !z.string().uuid().safeParse(chave).success) {
    return fail("validation_failed", "Idempotency-Key deve ser UUID", 400, { requestId });
  }

  const admin = createAdminClient();
  try {
    const desligado = await recusaSeMcpDesligado(admin, org.orgId, t, requestId);
    if (desligado) return desligado;
  } catch {
    return fail("internal_error", t("Não foi possível cadastrar o servidor."), 500, { requestId });
  }

  // O endereço de um servidor é escolhido por uma ORGANIZAÇÃO: a régua de destino de organização
  // recusa a rede interna, privada e local ANTES de gravar.
  const recusa = await motivoDaRecusaDeDestino(dados.url, "organizacao");
  if (recusa) {
    return fail("validation_failed", t(fraseDaRecusaDeEndereco(recusa)), 422, { requestId, details: { url: recusa } });
  }

  async function criar(): Promise<ServidorComConexao> {
    const criado = await criarServidor(admin, { organizationId: org.orgId, atorId: user.id, dados });
    if (!criado.ok) {
      if (criado.erro === "cifra_indisponivel") {
        throw new CadastroRecusado(
          "encryption_unavailable",
          t("Não consigo guardar a credencial com segurança: a cifra do servidor não está configurada. Peça a quem instalou o sistema para conferir."),
          422,
        );
      }
      if (criado.erro === "nome_em_uso") {
        throw new CadastroRecusado("name_in_use", t("Já existe um servidor com este nome. Escolha outro."), 409);
      }
      throw new CadastroRecusado("internal_error", t("Não foi possível cadastrar o servidor."), 500);
    }
    // Sem a credencial e sem o endereço inteiro: a auditoria guarda o fato.
    void audit({
      action: "ai.mcp_server_created",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "mcp_server",
      resourceId: criado.servidor.id,
      requestId,
      metadata: {
        host: new URL(criado.servidor.url).host,
        has_credential: criado.servidor.has_credential,
        auth_header: criado.servidor.auth_header,
      },
    });

    // O teste de conexão acompanha o cadastro: o administrador sabe NA HORA se o servidor responde.
    const conexao = await conectarAoServidor(admin, org.orgId, criado.servidor.id);
    void audit({
      action: "ai.mcp_server_tested",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "mcp_server",
      resourceId: criado.servidor.id,
      requestId,
      metadata: conexao.ok
        ? { ok: true, tools_offered: conexao.ferramentas.length, phase: "create" }
        : { ok: false, reason: conexao.motivo, http_status: conexao.httpStatus, phase: "create" },
    });
    const atualizado = (await buscarServidor(admin, org.orgId, criado.servidor.id)) ?? criado.servidor;
    return {
      ...atualizado,
      conexao: conexao.ok
        ? { ok: true, ferramentas_oferecidas: conexao.ferramentas.length, lista_incompleta: conexao.listaIncompleta }
        : { ok: false, motivo: conexao.motivo, http_status: conexao.httpStatus, message: t(conexao.frase) },
    };
  }

  try {
    if (chave === null) {
      return ok(await criar(), { requestId, status: 201 });
    }
    const desfecho = await comIdempotencia({
      db: await createClient(),
      organizationId: org.orgId,
      endpoint: ENDPOINT,
      chave,
      // A credencial entra no hash do corpo (detecta reuso da chave com outro conteúdo) e NUNCA no recibo.
      corpo: dados,
      executar: async () => ({ resposta: await criar(), status: 201 }),
    });
    if (desfecho.tipo === "conflito") {
      return fail("idempotency_conflict", "Esta chave de idempotência já foi usada com outro conteúdo.", 409, { requestId });
    }
    if (desfecho.tipo === "em_curso") {
      return fail("idempotency_in_progress", "A mesma requisição ainda está em curso. Tente de novo em instantes.", 409, {
        requestId,
      });
    }
    return ok(desfecho.resposta, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof CadastroRecusado) return fail(err.codigo, err.texto, err.status, { requestId });
    return fail("internal_error", t("Não foi possível cadastrar o servidor."), 500, { requestId });
  }
}
