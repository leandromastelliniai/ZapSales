"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

import { useT } from "@/hooks/i18n/useT";
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Painel } from "@/components/ui/painel";
import { FlowArrow, Plus, Sparkle } from "@/lib/ui/icons";
import { useFollowupFlows, type FollowupFlowPointerRow } from "@/hooks/followup/useFollowupFlows";
import type { FollowupFlowSurface } from "@/lib/followup/api-schemas";
import { DeleteFollowupFlowButton } from "./DeleteFollowupFlowButton";
import { DuplicateFollowupFlowButton } from "./DuplicateFollowupFlowButton";
import { FlowStatusBadge } from "./FlowStatusBadge";
import { ModelosDialog } from "./ModelosDialog";
import { NewFlowDialog } from "./NewFlowDialog";
import { RenameFollowupFlowButton } from "./RenameFollowupFlowButton";

interface Props {
  initialData: FollowupFlowPointerRow[];
  canWrite: boolean;
  /** Recorte por superfície. Ausente = todos (comportamento atual). */
  surface?: FollowupFlowSurface;
}

/**
 * O que acontece com o follow-up quando uma pessoa assume a conversa, em palavras de quem opera.
 * Antes a lista imprimia o valor cru do banco ("pause", "cancel") sob o rótulo "Handoff".
 */
const QUANDO_UMA_PESSOA_ASSUME: Record<string, string> = {
  pause: "Pausa quando uma pessoa assume",
  cancel: "Cancela quando uma pessoa assume",
  allow: "Segue mesmo quando uma pessoa assume",
};

function formatUpdatedAt(iso: string, idioma: string): string {
  return new Date(iso).toLocaleDateString(idioma, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function FlowsList({ initialData, canWrite, surface }: Props) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const { data } = useFollowupFlows({ initialData, ...(surface ? { surface } : {}) });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modelosOpen, setModelosOpen] = useState(false);
  const deAtendimento = surface === "atendimento";

  const flows = data ?? [];
  // Cada superfície tem a SUA rota de editor: abrir um fluxo de atendimento não
  // pode jogar o usuário na lista de Follow-ups.
  const baseHref = deAtendimento ? "/app/ai/atendimento" : "/app/ai/followups";

  // ⚠️ "Começar de um modelo" vem ANTES de "Novo fluxo", e na tela vazia é o
  // botão cheio. Quem chega aqui numa instalação nova não sabe o que é nó, ramo
  // ou prazo de graça — mandá-lo para uma tela em branco é o caminho mais curto
  // para a clínica nunca ter follow-up nenhum. Desenhar do zero continua a um
  // clique, para quem já sabe o que quer.
  const modelosButton = (
    <Button onClick={() => setModelosOpen(true)} className="w-full sm:w-auto">
      <Sparkle size={14} aria-hidden className="mr-2" /> {t("Começar de um modelo")}
    </Button>
  );

  const newFlowButton = (
    <Button
      onClick={() => setDialogOpen(true)}
      variant={deAtendimento ? "default" : "outline"}
      className="w-full sm:w-auto"
    >
      <Plus size={14} aria-hidden className="mr-2" />
      {deAtendimento ? t("Novo fluxo de atendimento") : t("Novo fluxo")}
    </Button>
  );

  const dialogos = canWrite && (
    <>
      <NewFlowDialog open={dialogOpen} onOpenChange={setDialogOpen} surface={surface} />
      {!deAtendimento && (
        <ModelosDialog
          open={modelosOpen}
          onOpenChange={setModelosOpen}
          nomesExistentes={flows.map((f) => f.name)}
        />
      )}
    </>
  );

  if (flows.length === 0) {
    return (
      <>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FlowArrow size={36} aria-hidden className="text-text-muted" />
          <h2 className="font-medium">
            {deAtendimento ? t("Nenhum fluxo de atendimento ainda") : t("Nenhum fluxo de follow-up ainda")}
          </h2>
          <p className="max-w-sm text-sm text-text-muted">
            {deAtendimento
              ? t(
                  "Os fluxos de atendimento cadastram as perguntas que a IA faz durante a conversa e o que acontece ao concluir — os dados ficam guardados por cliente.",
                )
              : t(
                  "Follow-ups reengajam contatos após silêncio, mudança de etapa, uma regra em Webhooks ou a resposta do contato — sem depender de alguém lembrar de mandar mensagem.",
                )}
          </p>
          {canWrite && (
            <div className="mt-1 flex flex-col items-center gap-2 sm:flex-row">
              {!deAtendimento && modelosButton}
              {newFlowButton}
            </div>
          )}
        </Card>
        {dialogos}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {!deAtendimento && modelosButton}
          {newFlowButton}
        </div>
      )}

      <Painel semRecuo>
        <ul className="divide-y divide-border">
          {flows.map((flow) => (
            <li
              key={flow.id}
              className="group relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-surface-elevated/60 md:grid-cols-[auto_minmax(0,1fr)_auto]"
            >
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-text-muted"
              >
                <FlowArrow size={24} />
              </span>

              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`${baseHref}/${flow.id}`}
                    title={flow.name}
                    className="min-w-0 font-semibold tracking-tight break-words outline-hidden after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset md:truncate"
                  >
                    {flow.name}
                  </Link>
                  <FlowStatusBadge status={flow.status} />
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  <span>{flow.active_version_id ? t("Versão publicada") : t("Sem versão publicada")}</span>
                  {QUANDO_UMA_PESSOA_ASSUME[flow.handoff_policy] ? (
                    <span>{t(QUANDO_UMA_PESSOA_ASSUME[flow.handoff_policy] as string)}</span>
                  ) : null}
                  <span>
                    {t("Atualizado em")} {formatUpdatedAt(flow.updated_at, tagDoIdioma)}
                  </span>
                </p>
              </div>

              {canWrite && (
                <div className="relative z-10 col-start-2 flex flex-wrap items-center gap-2 md:col-start-auto md:justify-end">
                  <RenameFollowupFlowButton flowId={flow.id} flowName={flow.name} />
                  <DuplicateFollowupFlowButton flowId={flow.id} />
                  <DeleteFollowupFlowButton flowId={flow.id} flowName={flow.name} listHref={baseHref} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </Painel>

      {dialogos}
    </div>
  );
}
