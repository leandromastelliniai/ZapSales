"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pause, Play, SlidersHorizontal } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { AgentRow } from "@/hooks/ai/useAgent";

/**
 * O comando de "como ele atende AGORA": vale na hora, sem rascunho nem
 * publicação — por isso fica fora do formulário, logo abaixo do nome.
 *
 * O `<select>` nativo é de propósito (rótulo "Modo de operação"): o teste de
 * autonomia o dirige por `selectOption`, e o nativo é o mais previsível no
 * celular. O que ganha aqui é a frase que diz o que cada escolha FAZ.
 */
export function AgentOperation({ agent, readOnly }: { agent: AgentRow; readOnly?: boolean }) {
  const t = useT(),
    router = useRouter(),
    [busy, setBusy] = useState(false);
  async function change(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await apiClient.patch(`/api/v1/ai/agents/${agent.id}`, body);
      router.refresh();
    } catch (e) {
      showApiError(e);
    } finally {
      setBusy(false);
    }
  }
  const modo = agent.operation_mode ?? "automatic";
  const pausado = agent.paused_at != null;
  const semVersao = !agent.published_version_id;

  return (
    <section
      className="grid items-center gap-4 rounded-xl border border-border bg-surface p-4 shadow-xs sm:px-5 md:grid-cols-[minmax(0,1fr)_auto]"
      aria-label={t("Operação do agente")}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-foreground">
          <SlidersHorizontal size={18} aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold">{t("Como ele atende agora")}</p>
          <p className="max-w-[65ch] text-sm text-muted-foreground" data-testid="explicacao-do-modo">
            {pausado
              ? t(
                  "Automático pausado. A versão publicada foi preservada e a assistência continua disponível.",
                )
              : modo === "assisted"
                ? t(
                    "Ele escreve a resposta dentro da conversa e espera: só vai para o cliente depois que alguém da equipe aprovar.",
                  )
                : t(
                    "Ele responde o cliente sozinho, seguindo o que está configurado nesta página. Vale na hora, sem publicar.",
                  )}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <select
          className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:w-auto"
          aria-label={t("Modo de operação")}
          value={modo}
          disabled={readOnly || busy}
          onChange={(e) => change({ operation_mode: e.target.value })}
        >
          <option value="assisted">{t("Assistido: revisar antes de enviar")}</option>
          <option value="automatic">{t("Automático: responder com as regras do agente")}</option>
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={readOnly || busy || semVersao}
          title={semVersao ? t("Publique uma versão para poder pausar.") : undefined}
          onClick={() => change({ paused_at: agent.paused_at ? null : new Date().toISOString() })}
        >
          {pausado ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
          {t(pausado ? "Retomar automático" : "Pausar automático")}
        </Button>
      </div>
    </section>
  );
}
