"use client";
/**
 * A prévia viva de "Jeito de responder": uma conversa de exemplo que MUDA junto com o que a
 * pessoa configura (tom, mensagens curtas ou texto único, áudio). É o jeito de ver, sem sair
 * da tela e sem gastar chave de IA, o que a configuração faz com o que o cliente lê.
 *
 * É uma SIMULAÇÃO, e a tela diz isso: o texto é fixo por tom; só o formato (as bolhas) usa
 * a mesma função que o envio real, `splitIntoBubbles`, então "mensagens curtas" aqui é
 * exatamente o que sai no WhatsApp. Quando algo muda, as bolhas do agente brilham uma vez
 * (nunca em laço; sem movimento, nada brilha).
 *
 * O "Ver como ficaria com" é só uma pergunta: experimenta um tom sem tocar no formulário, e
 * "Usar este tom" é o único botão que grava.
 */
import * as React from "react";

import { useT } from "@/hooks/i18n/useT";
import { TONS_DO_AGENTE, type TomDoAgente } from "@/lib/ai/agents/perfil";
import { splitIntoBubbles } from "@/lib/agent-engine/agent/split-message";
import { Microphone, Sparkle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  nomeDoAgente: string;
  /** O tom que o formulário tem agora (`""` = ainda sem tom: a prévia usa o normal). */
  tom: TomDoAgente | "";
  dividir: boolean;
  maxChars: number;
  audio: boolean;
  onUsarTom: (tom: TomDoAgente) => void;
  disabled?: boolean;
}

export function PreviaDaResposta({
  nomeDoAgente,
  tom,
  dividir,
  maxChars,
  audio,
  onUsarTom,
  disabled,
}: Props) {
  const t = useT();
  // O tom experimentado vale só enquanto o tom do formulário for o mesmo de quando se
  // experimentou: se a pessoa mudar o tom lá em cima, a prévia volta a seguir o formulário.
  const [visto, setVisto] = React.useState<{ tom: TomDoAgente; base: TomDoAgente | "" } | null>(
    null,
  );
  const tomVisto = visto && visto.base === tom ? visto.tom : null;
  const tomEfetivo: TomDoAgente = tomVisto ?? (tom === "" ? "normal" : tom);
  const experimentando = tomVisto !== null && tomVisto !== tom;

  const frases: Record<TomDoAgente, string[]> = {
    formal: [
      t("Boa tarde, e obrigado pelo contato."),
      t("Terei prazer em explicar como funciona e informar os valores."),
      t("Poderia me dizer qual serviço lhe interessa?"),
    ],
    normal: [
      t("Olá! Obrigado pelo contato."),
      t("Posso te explicar como funciona e passar os valores."),
      t("Qual serviço você está procurando?"),
    ],
    descontraido: [
      t("Oi! Que bom te ver por aqui."),
      t("Te explico rapidinho como funciona e já passo os valores."),
      t("Me conta: qual serviço você quer?"),
    ],
  };
  const texto = frases[tomEfetivo].join("\n\n");
  const bolhas = dividir ? splitIntoBubbles(texto, maxChars) : [texto];

  // O brilho recomeça quando muda o que a prévia mostra. A assinatura é comparada durante a
  // renderização (padrão "estado derivado"), sem efeito: a primeira vez não brilha.
  const assinatura = `${tomEfetivo}|${dividir ? maxChars : "texto"}|${audio ? "audio" : "sem"}`;
  const [anterior, setAnterior] = React.useState(assinatura);
  const [rodada, setRodada] = React.useState(0);
  if (assinatura !== anterior) {
    setAnterior(assinatura);
    setRodada((r) => r + 1);
  }

  const nomesDosTons: Record<TomDoAgente, string> = {
    formal: t("Formal"),
    normal: t("Normal"),
    descontraido: t("Descontraído"),
  };

  return (
    <aside
      aria-label={t("Prévia da conversa")}
      data-testid="previa-da-resposta"
      className="aura-ia flex min-w-0 flex-col overflow-hidden rounded-xl border border-ia/30 bg-surface"
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-semibold">
        <Sparkle size={16} weight="fill" aria-hidden className="shrink-0 text-ia" />
        <span className="min-w-0 flex-1 truncate">
          {t("Prévia ao vivo")}
          {nomeDoAgente.trim() ? ` · ${nomeDoAgente.trim()}` : ""}
        </span>
        <span className="shrink-0 rounded-full bg-ia-fundo px-2 py-0.5 text-[11px] font-medium text-ia">
          {t("Não gasta chave")}
        </span>
      </header>

      <div className="flex flex-col gap-2 bg-surface-elevated/50 p-3" aria-live="polite">
        <p className="max-w-[88%] self-end rounded-2xl rounded-br-sm bg-surface-elevated px-3 py-2 text-sm">
          {t("Oi, quanto custa e como funciona?")}
        </p>
        {bolhas.map((b, i) => (
          <p
            key={`${rodada}-${i}`}
            data-testid="previa-bolha"
            className={cn(
              "max-w-[88%] self-start rounded-2xl rounded-bl-sm border border-border bg-surface px-3 py-2 text-sm whitespace-pre-line",
              rodada > 0 && "realce-da-previa",
            )}
          >
            {b}
          </p>
        ))}
        {audio ? (
          <p
            data-testid="previa-audio"
            className={cn(
              "inline-flex max-w-[88%] items-center gap-1.5 self-start rounded-2xl rounded-bl-sm border border-dashed border-border bg-surface px-3 py-2 text-xs text-muted-foreground",
              rodada > 0 && "realce-da-previa",
            )}
          >
            <Microphone size={14} aria-hidden />
            {t("Também responde em áudio")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span id="previa-tom-rotulo" className="text-xs text-muted-foreground">
            {t("Ver como ficaria com:")}
          </span>
          <div
            role="radiogroup"
            aria-labelledby="previa-tom-rotulo"
            className="flex flex-wrap gap-1.5"
          >
            {TONS_DO_AGENTE.map((o) => {
              const marcado = tomEfetivo === o;
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  data-testid={`previa-tom-${o}`}
                  onClick={() => setVisto({ tom: o, base: tom })}
                  className={cn(
                    "min-h-9 rounded-full border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden",
                    marcado
                      ? "border-ia bg-ia text-white"
                      : "border-border bg-surface hover:border-foreground/50",
                  )}
                >
                  {nomesDosTons[o]}
                </button>
              );
            })}
          </div>
        </div>
        {experimentando ? (
          <button
            type="button"
            disabled={disabled}
            data-testid="previa-usar-tom"
            onClick={() => {
              onUsarTom(tomEfetivo);
              setVisto(null);
            }}
            className="inline-flex min-h-9 items-center rounded-lg border border-ia/40 bg-ia-fundo px-3 text-xs font-medium text-ia transition-colors hover:border-ia focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden disabled:opacity-50"
          >
            {t("Usar este tom")}
          </button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t(
            "Exemplo ilustrativo. O agente de verdade escreve com a sua IA e as suas instruções; aqui você vê o formato e o tom.",
          )}
        </p>
      </div>
    </aside>
  );
}
