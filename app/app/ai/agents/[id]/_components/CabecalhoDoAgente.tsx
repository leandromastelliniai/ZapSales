"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { ArrowLeft, WhatsappLogo } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { iconeDoAgente, type IconeDoAgente } from "@/lib/ai/agents/icone-do-agente";
import { useT } from "@/hooks/i18n/useT";
import type { AgentRow } from "@/hooks/ai/useAgent";
import { AgentStatusBadge, EXPLICACAO_DO_ESTADO, deriveAgentStatus } from "../../_components/AgentStatusBadge";
import { ModoDoAgente } from "../../_components/ModoDoAgente";
import { EscolherIcone } from "./EscolherIcone";

/**
 * O cabeçalho da FICHA do agente: o próprio agente — ícone, nome, se está no ar e
 * como atende — com o caminho de volta à lista. A tela abria direto num seletor
 * de "Operação do agente", sem dizer de qual agente se tratava.
 *
 * O nome que aparece é o salvo; quem o edita é a seção "Quem é" do formulário.
 */
export function CabecalhoDoAgente({
  agent,
  numero,
  readOnly,
}: {
  agent: AgentRow;
  /** Como a tela chama o número da versão publicada, quando há. */
  numero?: string | null;
  readOnly?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const status = deriveAgentStatus(agent);
  const [icone, setIcone] = useState<IconeDoAgente>(iconeDoAgente(agent));
  const [salvando, setSalvando] = useState(false);

  async function trocar(novo: IconeDoAgente) {
    const antes = icone;
    setIcone(novo);
    setSalvando(true);
    try {
      await apiClient.patch(`/api/v1/ai/agents/${agent.id}`, { config: { icone: novo } });
      toast.success(t("Ícone trocado."));
      router.refresh();
    } catch (e) {
      setIcone(antes);
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <header className="space-y-4">
      <Link
        href="/app/ai/agents"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden /> {t("Agentes de IA")}
      </Link>
      <div className="flex items-start gap-4">
        <EscolherIcone
          icone={icone}
          onEscolher={trocar}
          disabled={readOnly}
          salvando={salvando}
          ponto={status === "published" ? "no_ar" : status === "paused" ? "pausado" : null}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{agent.name}</h1>
            <AgentStatusBadge status={status} />
          </div>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {agent.description?.trim() ? agent.description : t(EXPLICACAO_DO_ESTADO[status])}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-0.5 text-sm">
            {status !== "archived" ? <ModoDoAgente agent={agent} /> : null}
            <span className="inline-flex min-w-0 items-center gap-2">
              <WhatsappLogo size={16} aria-hidden className="shrink-0 text-muted-foreground" />
              <span className={numero ? "truncate" : "truncate text-muted-foreground"}>
                {numero ?? t("Nenhum número no ar")}
              </span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
