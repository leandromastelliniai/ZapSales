"use client";
import Link from "next/link";

import { AvatarDoAgente } from "@/components/ai/AvatarDoAgente";
import { Button } from "@/components/ui/button";
import { Selo } from "@/components/ui/selo";
import { Brain, WhatsappLogo } from "@/lib/ui/icons";
import { iconeDoAgente } from "@/lib/ai/agents/icone-do-agente";
import { useT } from "@/hooks/i18n/useT";
import type { AgentRow } from "@/hooks/ai/useAgent";
import { AgentStatusBadge, deriveAgentStatus } from "./AgentStatusBadge";
import { AgentRowMenu } from "./AgentRowMenu";
import { ModoDoAgente } from "./ModoDoAgente";

interface Props {
  agent: AgentRow;
  canWrite: boolean;
  /** id do número conectado → nome na tela. */
  nomesDosNumeros?: Record<string, string>;
}

/**
 * A linha do modelo, dizendo o que está EM VIGOR.
 *
 * Três casos, e cada um existe por um motivo medido:
 *
 *  1. versão publicada → é ela que o runtime lê (`agent-config.ts`), então é ela
 *     que a lista mostra. `ai_agents.model` não é sincronizado ao publicar.
 *  2. `provedor/modelo` → o formato do `rag_bot` legado, onde a coluna É a fonte.
 *  3. id nu → como todo `mcp_agent` nasce (`createMcpAgentAction` grava o id do
 *     catálogo). Antes, o `split("/")[0]` devolvia o próprio modelo e a lista
 *     renderizava "claude-sonnet-4-6 · claude-sonnet-4-6".
 */
/**
 * De ONDE saiu a linha acima — para a tela poder dizer isso a quem olha.
 *
 * Enxertado do PR #267 (@Lucas-BritoDev), que trazia a mesma informação num
 * módulo próprio. A regra ficou a desta função (é a que está em vigor e trata o
 * id nu do `mcp_agent` recém-criado); o que veio de lá é a EXPLICAÇÃO, que aqui
 * não existia: "anthropic · claude-sonnet-5" sozinho não diz se é o que atende
 * o cliente ou o que ficou no rascunho — e essa é exatamente a confusão que
 * custou uma depuração no modelo errado.
 */
export function origemDoModelo(agent: AgentRow): "versao_publicada" | "cadastro" {
  return agent.versao_publicada?.model ? "versao_publicada" : "cadastro";
}

export function modeloEmVigor(agent: AgentRow): string {
  const publicada = agent.versao_publicada;
  if (publicada?.model) {
    return publicada.provider ? `${publicada.provider} · ${publicada.model}` : publicada.model;
  }
  const cadastro = agent.model?.trim() ?? "";
  if (cadastro === "") return "—";
  if (!cadastro.includes("/")) return cadastro;
  const [provedor, ...resto] = cadastro.split("/");
  return `${provedor} · ${resto.join("/")}`;
}

/**
 * Uma linha da lista de agentes: QUEM é (ícone, nome, descrição), SE está no ar,
 * POR ONDE atende e COMO atende. São as quatro perguntas que o dono faz ao abrir
 * a tela; o cartão antigo respondia "Tipo: mcp_agent" e "Prioridade: 10".
 *
 * A linha inteira leva ao editor (link esticado no nome); o menu de ações fica
 * acima do link, para continuar clicável.
 */
export function AgentCard({ agent, canWrite, nomesDosNumeros = {} }: Props) {
  const t = useT();
  const status = deriveAgentStatus(agent);
  const numeroId = agent.versao_publicada?.channel_session_id ?? null;
  const numero = numeroId ? nomesDosNumeros[numeroId] ?? t("Número conectado") : null;

  return (
    <div
      data-testid="linha-do-agente"
      className="group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-surface-elevated/60 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,17rem)_12.5rem]"
    >
      <AvatarDoAgente
        icone={iconeDoAgente(agent)}
        ponto={status === "published" ? "no_ar" : status === "paused" ? "pausado" : null}
        className={status === "archived" ? "opacity-50" : undefined}
      />

      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 md:flex-nowrap">
          <Link
            href={`/app/ai/agents/${agent.id}`}
            title={agent.name}
            className="min-w-0 font-semibold break-words md:truncate tracking-tight outline-hidden after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {agent.name}
          </Link>
          {agent.is_default && (
            <Selo className="shrink-0" title={t("O agente padrão da organização não pode ser arquivado.")}>
              {t("Padrão")}
            </Selo>
          )}
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground md:line-clamp-none md:truncate">
          {agent.description?.trim() ? agent.description : t("Sem descrição")}
        </p>
      </div>

      <dl className="col-start-2 col-end-4 row-start-2 grid min-w-0 gap-1 text-sm md:col-start-auto md:col-end-auto md:row-start-auto">
        {/* No celular o selo desce para cá: na linha do nome, ele espremia o nome a "A…". */}
        <div className="md:hidden">
          <dt className="sr-only">{t("Estado")}</dt>
          <dd>
            <AgentStatusBadge status={status} />
          </dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <dt className="sr-only">{t("Número")}</dt>
          <WhatsappLogo size={16} aria-hidden className="shrink-0 text-muted-foreground" />
          <dd className={numero ? "truncate" : "truncate text-muted-foreground"} title={numero ?? undefined}>
            {numero ?? t("Nenhum número no ar")}
          </dd>
        </div>
        {status !== "archived" ? (
          <div className="flex min-w-0 items-center gap-2">
            <dt className="sr-only">{t("Como atende")}</dt>
            <dd className="min-w-0">
              <ModoDoAgente agent={agent} />
            </dd>
          </div>
        ) : null}
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <dt className="sr-only">{t("Modelo")}</dt>
          <Brain size={14} aria-hidden className="shrink-0" />
          <dd
            className="truncate"
            title={
              origemDoModelo(agent) === "versao_publicada"
                ? t("Modelo da versão publicada — é o que atende o cliente.")
                : t("Modelo do cadastro; nenhuma versão publicada ainda.")
            }
          >
            {modeloEmVigor(agent)}
          </dd>
        </div>
      </dl>

      <div className="relative z-10 flex items-center justify-end gap-1.5">
        <span className="hidden md:inline-flex">
          <AgentStatusBadge status={status} />
        </span>
        <Button asChild variant="outline" size="sm" className="hidden lg:inline-flex">
          <Link href={`/app/ai/agents/${agent.id}`} tabIndex={-1}>
            {canWrite ? t("Editar") : t("Visualizar")}
          </Link>
        </Button>
        {canWrite && <AgentRowMenu agent={agent} />}
      </div>
    </div>
  );
}
