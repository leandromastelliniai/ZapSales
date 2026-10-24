"use client";
/**
 * Estação 4 — quando chamar uma pessoa. Pedir "falar com uma pessoa" já funciona sozinho
 * (as palavras de passagem padrão e a ferramenta de passar o caso vêm ligadas); aqui a
 * pessoa diz o que MAIS deve chamar a equipe no negócio dela. A sugestão vem do ramo e é
 * só um ponto de partida.
 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { sugestaoDe } from "@/lib/ai/agents/assistente/compor";
import type { EstadoDoAssistente } from "@/lib/ai/agents/assistente/estado";

interface Props {
  estado: EstadoDoAssistente;
  mudar: (e: EstadoDoAssistente) => void;
}

export function EstacaoPessoa({ estado, mudar }: Props) {
  const t = useT();
  const r = estado.respostas;
  const sugestao = sugestaoDe(r, "chamarPessoaQuando");
  const valor = r.chamarPessoaQuando ?? sugestao;
  const editada = r.chamarPessoaQuando !== null && r.chamarPessoaQuando !== sugestao;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{t("Quando o agente deve chamar uma pessoa?")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Se o cliente pedir para falar com uma pessoa, o agente já chama a equipe. Aqui você diz o que mais deve chamar alguém.",
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assistente-chamar">{t("Chamar uma pessoa quando…")}</Label>
        <Textarea
          id="assistente-chamar"
          value={valor}
          rows={3}
          maxLength={400}
          placeholder={t("Ex.: o cliente reclamar, pedir reembolso ou quiser negociar valor")}
          onChange={(e) =>
            mudar({ ...estado, respostas: { ...r, chamarPessoaQuando: e.target.value } })
          }
        />
        {editada ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => mudar({ ...estado, respostas: { ...r, chamarPessoaQuando: null } })}
          >
            {t("Voltar à sugestão")}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {sugestao === ""
            ? t(
                "Sem sugestão para este tipo de negócio: escreva só se houver algo além do pedido do cliente.",
              )
            : t("Sugestão do seu tipo de negócio. Reescreva do seu jeito.")}
        </p>
      </div>
    </div>
  );
}
