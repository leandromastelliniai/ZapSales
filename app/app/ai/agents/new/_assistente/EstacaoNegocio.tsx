"use client";
/**
 * Estação 1 — o negócio. A lista é grande e agrupada, com busca por digitação (em
 * qualquer dos três idiomas); "Outro" fica sempre à mão para quem não se acha na lista.
 * Escolher aqui só RECOMENDA: modelo, tom e frases partem do ramo, e a pessoa muda tudo
 * nas estações seguintes.
 */
import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { GRUPOS_DE_RAMO, buscarRamos } from "@/lib/ai/agents/assistente/ramos";
import { NEGOCIO_MAX } from "@/lib/ai/agents/assistente/compor";
import { escolherRamo, type EstadoDoAssistente } from "@/lib/ai/agents/assistente/estado";
import type { IdiomaDoAgente } from "@/lib/ai/agents/perfil";
import { cn } from "@/lib/utils";

interface Props {
  estado: EstadoDoAssistente;
  idioma: IdiomaDoAgente;
  mudar: (e: EstadoDoAssistente) => void;
}

const BOTAO = "min-h-11 rounded-lg border px-3 py-2 text-left text-sm transition-colors";

export function EstacaoNegocio({ estado, idioma, mudar }: Props) {
  const t = useT();
  const [consulta, setConsulta] = React.useState("");
  const achados = buscarRamos(consulta, idioma);
  const escolhido = estado.respostas.ramoId;

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

      <div className="space-y-1.5">
        <Label htmlFor="assistente-busca">{t("Tipo de negócio")}</Label>
        <Input
          id="assistente-busca"
          type="search"
          value={consulta}
          placeholder={t("Digite para buscar: clínica, loja, advocacia…")}
          autoComplete="off"
          onChange={(e) => setConsulta(e.target.value)}
        />
      </div>

      <div
        role="radiogroup"
        aria-label={t("Tipo de negócio")}
        className="space-y-4"
        data-testid="lista-de-ramos"
      >
        {GRUPOS_DE_RAMO.map((g) => {
          const doGrupo = achados.filter((r) => r.grupo === g.id);
          if (doGrupo.length === 0) return null;
          return (
            <div key={g.id} className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">{g.nome[idioma]}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {doGrupo.map((r) => {
                  const marcado = escolhido === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={marcado}
                      data-testid={`ramo-${r.id}`}
                      onClick={() => mudar(escolherRamo(estado, r.id))}
                      className={cn(
                        BOTAO,
                        marcado
                          ? "border-2 border-foreground font-medium"
                          : "border-border hover:border-foreground/50",
                      )}
                    >
                      {r.nome[idioma]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {achados.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Nenhum tipo de negócio com esse nome. Use “Outro”.")}
          </p>
        ) : null}
        <button
          type="button"
          role="radio"
          aria-checked={escolhido === null}
          data-testid="ramo-outro"
          onClick={() => mudar(escolherRamo(estado, null))}
          className={cn(
            BOTAO,
            "w-full",
            escolhido === null
              ? "border-2 border-foreground font-medium"
              : "border-border hover:border-foreground/50",
          )}
        >
          {t("Outro")}
          <span className="block text-xs font-normal text-muted-foreground">
            {t("O agente começa com palavras neutras e você ajusta o que quiser.")}
          </span>
        </button>
      </div>
    </div>
  );
}
