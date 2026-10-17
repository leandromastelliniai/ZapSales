"use client";
/**
 * O grupo "Ferramentas externas" do seletor de ferramentas do agente (issue #94).
 *
 * Lista os webhooks de consulta que a organização cadastrou em Agente de IA ›
 * Ferramentas externas e deixa marcar quais ESTE agente pode chamar. A marcação é
 * dado da versão do agente (rascunho, diff, histórico), igual às demais.
 *
 * Contam no MESMO teto de capacidades das outras: quem decide se ainda há vaga é o
 * seletor (que soma as duas listas) — este componente só recebe `semVagas`.
 */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import type { FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  /** O agente já tem as 27 capacidades: só dá para desmarcar. */
  semVagas: boolean;
  disabled?: boolean;
}

/** O que a rota serve — o tipo do repositório, sem puxar o módulo de servidor para o browser. */
type FerramentaDaLista = Pick<
  FerramentaExterna,
  "id" | "name" | "agent_name" | "when_to_use" | "url" | "effect" | "active"
>;

function enderecoCurto(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function FerramentasExternasDoSeletor({ value, onChange, semVagas, disabled }: Props) {
  const t = useT();
  const query = useQuery({
    queryKey: ["ai", "external-tools"],
    queryFn: async () => {
      const res = await apiClient.get<{ data: FerramentaDaLista[] }>("/api/v1/ai/external-tools");
      return res.data;
    },
    staleTime: 30_000,
  });

  const ferramentas = query.data ?? [];
  const conhecidas = new Set(ferramentas.map((f) => f.id));
  // Marcadas que o servidor não lista mais: não somem da tela (isso seria mentir). Só vale
  // DEPOIS de a lista chegar — durante o carregamento toda marcada pareceria órfã.
  const orfas = query.isSuccess ? value.filter((id) => !conhecidas.has(id)) : [];

  function alternar(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  return (
    <div data-testid="grupo-ferramentas-externas" className="space-y-2 rounded-md border border-border/60 p-4">
      <div className="space-y-1">
        <h4 className="text-sm font-medium">{t("Ferramentas externas")}</h4>
        <p className="text-xs text-muted-foreground">
          {t(
            "Consultas a outro sistema (estoque, planilha, ERP) que o agente faz durante a conversa. Só aparecem aqui as que você cadastrou em Ferramentas externas.",
          )}
        </p>
      </div>

      {query.isLoading ? (
        <p className="text-xs text-muted-foreground">{t("Carregando as ferramentas externas…")}</p>
      ) : query.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {t("Não foi possível carregar as ferramentas externas. Recarregue a página.")}
        </p>
      ) : ferramentas.length === 0 ? (
        <p data-testid="sem-ferramentas-externas" className="text-xs text-muted-foreground">
          {t("Você ainda não cadastrou nenhuma ferramenta externa.")}{" "}
          <Link href="/app/ai/external-tools" className="font-medium text-primary underline-offset-4 hover:underline">
            {t("Cadastrar uma ferramenta externa")}
          </Link>
        </p>
      ) : (
        <div className="space-y-1">
          {ferramentas.map((f) => {
            const marcada = value.includes(f.id);
            // Desativada ou que altera dados: só dá para DESMARCAR (a rota e o motor recusam o resto).
            const naoLiga = !f.active || f.effect !== "consulta";
            return (
              <label
                key={f.id}
                data-testid={`ferramenta-externa-${f.id}`}
                data-marcada={marcada ? "sim" : "nao"}
                className={`flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/40 ${
                  naoLiga && !marcada ? "opacity-60" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded-md border-border accent-primary"
                  checked={marcada}
                  onChange={() => alternar(f.id)}
                  disabled={disabled || (!marcada && (naoLiga || semVagas))}
                  aria-label={f.name}
                />
                <span className="flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{f.name}</span>
                    <Badge variant="outline" className="text-[11px] border-border/60 text-muted-foreground">
                      {f.effect === "consulta" ? t("Só consulta") : t("Altera dados")}
                    </Badge>
                    {!f.active ? (
                      <Badge variant="outline" className="text-[11px] border-warning/40 text-warning-fg">
                        {t("Desativada")}
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">· {enderecoCurto(f.url)}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground">{f.when_to_use}</span>
                  {!f.active ? (
                    <span className="block text-xs text-info-fg">
                      {t("Desativada: o agente não a usa até alguém reativar em Ferramentas externas.")}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {orfas.length > 0 ? (
        <div
          data-testid="ferramentas-externas-orfas"
          className="space-y-2 rounded-md border border-warning/40 bg-warning-bg p-3 text-xs text-warning-fg"
        >
          <p>
            {t(
              "Uma ferramenta externa marcada nesta versão não existe mais. Ela continua salva, mas o agente não consegue usá-la.",
            )}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter((id) => conhecidas.has(id)))}
            className="font-medium underline underline-offset-4 disabled:opacity-50"
          >
            {t("Desmarcar")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
