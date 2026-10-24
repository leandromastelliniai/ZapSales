"use client";
/**
 * Estação 3 — como o agente fala: o tom (com exemplo de frase em cada um e o
 * recomendado marcado com o motivo) e a frase de abertura, que a pessoa pode reescrever
 * e restaurar com "Voltar à sugestão". Os atalhos acrescentam uma frase, não travam nada.
 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { acrescentarAvisoDeIa, sugestaoDe, tomSugerido } from "@/lib/ai/agents/assistente/compor";
import type { EstadoDoAssistente } from "@/lib/ai/agents/assistente/estado";
import {
  LIMITES_DO_PERFIL,
  TONS_DO_AGENTE,
  type IdiomaDoAgente,
  type TomDoAgente,
} from "@/lib/ai/agents/perfil";
import { cn } from "@/lib/utils";

interface Props {
  estado: EstadoDoAssistente;
  idioma: IdiomaDoAgente;
  mudar: (e: EstadoDoAssistente) => void;
}

const NOME_DO_TOM: Record<TomDoAgente, string> = {
  formal: "Formal",
  normal: "Normal",
  descontraido: "Descontraído",
};

const MOTIVO_DO_TOM: Record<TomDoAgente, string> = {
  formal: "Passa seriedade e confiança. Combina com saúde, direito e finanças.",
  normal: "Educado sem ser distante. Funciona para quase todo negócio.",
  descontraido: "Próximo e leve. Combina com varejo, beleza e quem vende por impulso.",
};

const EXEMPLO_DO_TOM: Record<TomDoAgente, Record<IdiomaDoAgente, string>> = {
  formal: {
    "pt-BR": "Boa tarde! Em que posso ajudá-lo(a)?",
    es: "¡Buenas tardes! ¿En qué puedo ayudarle?",
    en: "Good afternoon! How may I help you?",
  },
  normal: {
    "pt-BR": "Olá! Como posso ajudar?",
    es: "¡Hola! ¿En qué puedo ayudarte?",
    en: "Hello! How can I help?",
  },
  descontraido: {
    "pt-BR": "Oi! Me conta o que você precisa?",
    es: "¡Hola! ¿Me cuentas qué necesitas?",
    en: "Hi! Tell me what you need?",
  },
};

export function EstacaoTom({ estado, idioma, mudar }: Props) {
  const t = useT();
  const r = estado.respostas;
  const sugerido = tomSugerido(r.ramoId, r.modeloId, idioma);
  const sugestao = sugestaoDe(r, "abertura");
  const abertura = r.abertura ?? sugestao;
  const editada = r.abertura !== null && r.abertura !== sugestao;

  const mudarRespostas = (parcial: Partial<typeof r>) =>
    mudar({ ...estado, respostas: { ...r, ...parcial } });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("Como o agente deve falar com o cliente?")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Escolha o que combina com o seu cliente. Dá para mudar quando quiser.")}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={t("Tom de voz")}
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {TONS_DO_AGENTE.map((tom) => {
          const marcado = r.tom === tom;
          return (
            <button
              key={tom}
              type="button"
              role="radio"
              aria-checked={marcado}
              data-testid={`tom-${tom}`}
              onClick={() => mudarRespostas({ tom })}
              className={cn(
                "min-h-11 space-y-1.5 rounded-lg border px-3 py-3 text-left transition-colors",
                marcado ? "border-2 border-foreground" : "border-border hover:border-foreground/50",
              )}
            >
              <span className="flex min-h-6 flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t(NOME_DO_TOM[tom])}</span>
                {tom === sugerido ? <Selo significado="ia">{t("Recomendado")}</Selo> : null}
              </span>
              <span className="block rounded-md bg-surface-elevated px-2 py-1 text-xs text-muted-foreground">
                “{EXEMPLO_DO_TOM[tom][idioma]}”
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground" data-testid="motivo-do-tom">
        <span className="font-medium text-foreground">{t("Por que esse?")}</span>{" "}
        {t(MOTIVO_DO_TOM[sugerido])}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="assistente-abertura">{t("Primeira frase da conversa")}</Label>
        <Textarea
          id="assistente-abertura"
          value={abertura}
          rows={3}
          maxLength={LIMITES_DO_PERFIL.boasVindas}
          onChange={(e) => mudarRespostas({ abertura: e.target.value })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => mudarRespostas({ abertura: acrescentarAvisoDeIa(abertura, idioma) })}
          >
            {t("+ avisar que é uma IA")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={r.usarNomeDoCliente}
            onClick={() => mudarRespostas({ usarNomeDoCliente: !r.usarNomeDoCliente })}
          >
            {r.usarNomeDoCliente ? t("✓ citar o nome do cliente") : t("+ citar o nome do cliente")}
          </Button>
          {editada ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => mudarRespostas({ abertura: null })}
            >
              {t("Voltar à sugestão")}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "É só uma sugestão: reescreva do seu jeito. O agente não inventa preço, horário nem endereço; isso vem dos seus materiais.",
          )}
        </p>
      </div>
    </div>
  );
}
