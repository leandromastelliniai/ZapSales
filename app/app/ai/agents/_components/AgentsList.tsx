"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

import { AvatarDoAgente } from "@/components/ai/AvatarDoAgente";
import { Button } from "@/components/ui/button";
import { Painel } from "@/components/ui/painel";
import { Plus } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { useAgentsList } from "@/hooks/ai/useAgents";
import type { AgentRow } from "@/hooks/ai/useAgent";
import { AgentCard } from "./AgentCard";
import { AgentsListFilters, type StatusFilter } from "./AgentsListFilters";
import { deriveAgentStatus } from "./AgentStatusBadge";

interface Props {
  initialData: AgentRow[];
  canWrite: boolean;
  /** id do número conectado → como a tela o chama ("Loja · +55 11 …"). */
  nomesDosNumeros?: Record<string, string>;
}

export function AgentsList({ initialData, canWrite, nomesDosNumeros = {} }: Props) {
  const t = useT();
  const { data, isLoading } = useAgentsList({ initialData });
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const agents = data ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      const s = deriveAgentStatus(a);
      if (!showArchived && s === "archived") return false;
      if (status !== "all" && s !== status) return false;
      if (q && !a.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [agents, status, query, showArchived]);

  const noAr = agents.filter((a) => deriveAgentStatus(a) === "published").length;
  const ativos = agents.filter((a) => deriveAgentStatus(a) !== "archived").length;

  if (!isLoading && agents.length === 0) {
    return (
      <Painel>
        <div className="flex flex-col items-center gap-4 px-4 py-10 text-center">
          <AvatarDoAgente icone="assistente" tamanho="lg" />
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold tracking-tight">{t("Nenhum agente ainda")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {t(
                "Um agente responde às conversas do WhatsApp por você. Você define como ele fala, o que ele sabe e o que pode fazer — e decide se ele responde sozinho ou só sugere.",
              )}
            </p>
          </div>
          {canWrite && (
            <Button asChild>
              <Link href="/app/ai/agents/new">
                <Plus size={16} aria-hidden /> {t("Novo agente")}
              </Link>
            </Button>
          )}
        </div>
      </Painel>
    );
  }

  return (
    <Painel semRecuo>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <AgentsListFilters
          status={status}
          onStatusChange={setStatus}
          query={query}
          onQueryChange={setQuery}
          showArchived={showArchived}
          onShowArchivedChange={setShowArchived}
        />
        <p className="text-sm text-muted-foreground" data-testid="agentes-no-ar">
          <span className="font-medium text-foreground tabular-nums">{noAr}</span> {t("de")}{" "}
          <span className="tabular-nums">{ativos}</span> {t("no ar")}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          {t("Nenhum agente corresponde aos filtros atuais.")}
        </p>
      ) : (
        <ul className="divide-y divide-border" aria-label={t("Agentes de IA")}>
          {filtered.map((agent) => (
            <li key={agent.id}>
              <AgentCard agent={agent} canWrite={canWrite} nomesDosNumeros={nomesDosNumeros} />
            </li>
          ))}
        </ul>
      )}
    </Painel>
  );
}
