"use client";

import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
/**
 * Aba "Propostas" do agente (Operação Visível F3): melhorias que o flywheel
 * destilou das conversas reais. NADA se aplica sozinho — o botão é o gate
 * humano; aplicar cria uma versão NOVA do agente (publish-por-ponteiro).
 */
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentProposals, useApplyProposal, type ProposalRow } from "@/hooks/ai/useAgentProposals";
import { useT } from "@/hooks/i18n/useT";
import { ApiError } from "@/lib/api/types";
import { lerEvidenciaDeCorrecao } from "@/lib/ai/agents/evidencia-de-correcao";
import { Brain } from "@/lib/ui/icons";

const TYPE_LABEL: Record<ProposalRow["type"], string> = {
  playbook_bullet: "Regra de playbook",
  golden_case: "Caso exemplar",
  reentry_trigger: "Gatilho de reengajamento",
  org_memory_entry: "Memória da organização",
  response_correction: "Correção de resposta",
};

/**
 * A conversa que originou uma correção (já mascarada), para decidir com contexto.
 * Lida pelo schema da evidência — a tela não lê caminho de jsonb à mão.
 */
function ConversaDeOrigem({ evidence }: { evidence: ProposalRow["evidence"] }) {
  const t = useT();
  const ev = lerEvidenciaDeCorrecao(evidence);
  if (!ev) return null;
  return (
    <details className="mt-2 text-xs" data-testid="proposta-conversa-de-origem">
      <summary className="cursor-pointer text-muted-foreground">
        {ev.origem === "teste"
          ? t("Ver a conversa de origem (da aba Teste)")
          : t("Ver a conversa de origem (atendimento real, dados pessoais mascarados)")}
      </summary>
      <ul className="mt-2 space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
        {ev.conversa.map((fala, i) => (
          <li key={i} className="whitespace-pre-wrap">
            <span className="font-medium">
              {fala.role === "customer" ? t("Cliente") : t("Agente")}:
            </span>{" "}
            {fala.text}
          </li>
        ))}
      </ul>
      <p className="mt-2">
        <span className="font-medium">{t("O que deveria ter sido dito")}:</span>{" "}
        <span className="whitespace-pre-wrap">{ev.texto_corrigido}</span>
      </p>
    </details>
  );
}

export function ProposalsPanel({
  agentId,
  active,
  readOnly,
}: {
  agentId: string;
  active: boolean;
  readOnly?: boolean;
}) {
  const localeDaData = useLocaleDeData();
  const t = useT();
  const { data, isLoading } = useAgentProposals(agentId, active);
  const apply = useApplyProposal(agentId);

  const handleApply = async (p: ProposalRow) => {
    try {
      await apply.mutateAsync(p.id);
      toast.success(
        p.type === "org_memory_entry"
          ? t("Proposta aplicada como memória da organização.")
          : t("Proposta aplicada como versão nova do agente."),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("Não foi possível aplicar a proposta."));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border py-16 text-center">
        <Brain size={28} className="text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">{t("Nenhuma proposta ainda")}</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {t(
            "O assistente aprende com as conversas reais e propõe melhorias aqui. Você decide o que entra — nada é aplicado sozinho.",
          )}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {items.map((p) => {
        const when = formatDistanceToNowStrict(new Date(p.proposed_at), {
          addSuffix: true,
          locale: localeDaData,
        });
        return (
          <li key={p.id} className="flex items-start gap-3 px-4 py-3" data-testid="proposal-item">
            <Badge variant={p.applied_at ? "success" : "info"} className="mt-0.5 shrink-0">
              {p.applied_at ? t("aplicada") : t("pendente")}
            </Badge>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                {t(TYPE_LABEL[p.type])} · {t("proposta")} {when}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{p.content}</p>
              {p.type === "response_correction" ? (
                <>
                  {!p.applied_at ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(
                        "Se você aplicar, esta frase entra no fim das instruções do agente, numa versão nova. Enquanto não aplicar, o agente continua como está.",
                      )}
                    </p>
                  ) : null}
                  <ConversaDeOrigem evidence={p.evidence} />
                </>
              ) : null}
            </div>
            {!p.applied_at && !readOnly ? (
              <Button
                size="sm"
                variant="outline"
                disabled={apply.isPending}
                onClick={() => void handleApply(p)}
              >
                {p.type === "org_memory_entry" ? t("Aplicar como memória da org") : t("Aplicar como versão nova")}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
