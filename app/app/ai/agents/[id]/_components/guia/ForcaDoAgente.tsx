"use client";
/**
 * A "Força do agente": quão pronto ele está e o que mais ajudaria agora, no topo do editor.
 *
 * É uma régua de PRONTIDÃO (nome, personalidade, material, ações, saída para uma pessoa,
 * número, modelo), calculada a cada digitação por `forcaDoAgente`; não mede a qualidade da
 * IA e não bloqueia nada. O botão leva à parte onde o passo se resolve. A barra anima só a
 * largura, em resposta ao que a pessoa acabou de mexer (nada em laço).
 */
import { useT } from "@/hooks/i18n/useT";
import {
  faixaDaForca,
  type ForcaDoAgente,
  type IdDaSecaoDoGuia,
  type IdDoPasso,
} from "@/lib/ai/agents/guia-do-editor";
import { ArrowRight, Check, Gauge } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  forca: ForcaDoAgente;
  onIrPara: (secao: IdDaSecaoDoGuia) => void;
}

export function ForcaDoAgenteFaixa({ forca, onIrPara }: Props) {
  const t = useT();
  const faixa = faixaDaForca(forca.percentual);

  const titulo: Record<IdDoPasso, string> = {
    materiais: t("Dar materiais ao agente"),
    personalidade: t("Dizer quem ele é e como fala"),
    acoes: t("Ligar o que ele pode fazer"),
    pessoa: t("Deixar que ele chame uma pessoa"),
    nome: t("Dar um nome ao agente"),
    numero: t("Escolher o número de WhatsApp"),
    boas_vindas: t("Escrever a mensagem de boas-vindas"),
    modelo: t("Escolher o modelo de IA"),
  };
  const motivo: Record<IdDoPasso, string> = {
    materiais: t("Sem preços e regras por escrito, ele improvisa. Ligue ao menos um material."),
    personalidade: t("Sem personalidade, ele responde de um jeito genérico, igual para qualquer negócio."),
    acoes: t("Sem ações, ele só conversa: não registra o cliente nem avisa a equipe."),
    pessoa: t("Quando não souber, ele passa para a equipe em vez de arriscar uma resposta errada."),
    nome: t("A equipe reconhece o agente pelo nome nas listas e na Inbox."),
    numero: t("Sem número ele não tem por onde atender: dá para salvar, mas não para publicar."),
    boas_vindas: t("É a primeira impressão: define como a conversa começa."),
    modelo: t("É a inteligência artificial que escreve as respostas."),
  };
  const rotuloDaFaixa =
    faixa === "completa" ? t("Completo") : faixa === "boa" ? t("Quase pronto") : t("Só o começo");

  return (
    <section
      aria-label={t("Força do agente")}
      data-testid="forca-do-agente"
      data-faixa={faixa}
      className="rounded-xl border border-border bg-surface p-4 shadow-xs"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
        <div className="md:w-56 md:shrink-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Gauge size={16} weight="duotone" aria-hidden className="text-ia" />
              {t("Força do agente")}
            </span>
            <span className="text-sm font-semibold tabular-nums" data-testid="forca-percentual">
              {forca.percentual}%
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={forca.percentual}
            aria-label={t("Força do agente")}
            className="mt-2 h-2 overflow-hidden rounded-full bg-surface-elevated"
          >
            <div
              className="h-full rounded-full bg-ia transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${forca.percentual}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{rotuloDaFaixa}</p>
        </div>

        {forca.proximo ? (
          <>
            <div className="min-w-0 flex-1" data-testid="forca-proximo" data-passo={forca.proximo.id}>
              <p className="text-xs font-medium text-ia">{t("Próximo passo que mais ajuda")}</p>
              <p className="text-sm">
                <span className="font-medium">{titulo[forca.proximo.id]}.</span>{" "}
                <span className="text-muted-foreground">{motivo[forca.proximo.id]}</span>
              </p>
            </div>
            <button
              type="button"
              data-testid="forca-ir"
              onClick={() => forca.proximo && onIrPara(forca.proximo.secao)}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-border bg-surface px-3 text-sm font-medium transition-colors hover:border-foreground/50 focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:outline-hidden md:self-center"
            >
              {t("Ir para lá")}
              <ArrowRight size={16} aria-hidden />
            </button>
          </>
        ) : (
          <p className="flex flex-1 items-center gap-2 text-sm" data-testid="forca-completa">
            <Check size={18} weight="bold" aria-hidden className="shrink-0 text-success" />
            {t("Tudo pronto: o agente tem o essencial para atender bem.")}
          </p>
        )}
      </div>

      <details className="mt-3 border-t border-border pt-3" data-testid="forca-detalhe">
        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
          {t("O que compõe a força")}
        </summary>
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {forca.passos.map((p) => (
            <li
              key={p.id}
              data-testid={`passo-${p.id}`}
              data-feito={p.feito ? "sim" : "nao"}
              className="flex items-center gap-2 text-sm"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full border",
                  p.feito ? "border-success bg-success-bg text-success-fg" : "border-border",
                )}
              >
                {p.feito ? <Check size={10} weight="bold" /> : null}
              </span>
              <span className={cn("min-w-0 flex-1", p.feito ? "text-muted-foreground" : "")}>
                {titulo[p.id]}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">+{p.peso}%</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
