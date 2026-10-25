"use client";
/**
 * Estação 1 — o negócio, em duas linhas: o nome (opcional) e o tipo de negócio, que é um
 * MENU clicável (`SeletorDeRamo`) e não uma lista aberta na tela. Escolher aqui só
 * RECOMENDA: modelo, tom e frases partem do tipo de negócio, e a pessoa muda tudo nas
 * estações seguintes.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { NEGOCIO_MAX } from "@/lib/ai/agents/assistente/compor";
import { escolherRamo, type EstadoDoAssistente } from "@/lib/ai/agents/assistente/estado";
import type { IdiomaDoAgente } from "@/lib/ai/agents/perfil";

import { SeletorDeRamo } from "./SeletorDeRamo";

interface Props {
  estado: EstadoDoAssistente;
  idioma: IdiomaDoAgente;
  mudar: (e: EstadoDoAssistente) => void;
}

export function EstacaoNegocio({ estado, idioma, mudar }: Props) {
  const t = useT();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("Qual é o seu negócio?")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Com isso o agente já começa com as palavras e os cuidados do seu tipo de negócio. Você pode mudar tudo depois.",
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assistente-ramo">{t("Tipo de negócio")}</Label>
        <SeletorDeRamo
          escolhido={estado.respostas.ramoId}
          idioma={idioma}
          onEscolher={(id) => mudar(escolherRamo(estado, id))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assistente-negocio">{t("Nome do negócio (opcional)")}</Label>
        <Input
          id="assistente-negocio"
          value={estado.respostas.negocio}
          maxLength={NEGOCIO_MAX}
          placeholder={t("Ex.: Clínica Sorriso")}
          autoComplete="off"
          onChange={(e) =>
            mudar({ ...estado, respostas: { ...estado.respostas, negocio: e.target.value } })
          }
        />
      </div>
    </div>
  );
}
