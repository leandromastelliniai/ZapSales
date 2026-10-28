"use client";
/**
 * "Sua evolução em quatro respostas" e "Está tudo certo?", numa faixa no alto de Evolução da IA.
 *
 * A página conta uma história em quatro blocos (aprendeu → fez → resultado → travando), e o bloco que
 * pede ação, o das travas, fica no fim. A faixa o traz para cima: quatro números do período e as
 * conferências, com um link direto para "O que está travando". As contas são do produto
 * (`lib/ai/evolution/resumo-da-evolucao.ts`); a faixa só lê e nunca grava, e não recomenda nada — o
 * bloco de baixo já diz, linha a linha, o que fazer.
 */
import Link from "next/link";

import { FaixaDeResumo, type CelulaDaFaixa, type ConferenciaDaFaixa } from "@/components/guia/FaixaDeResumo";
import { useT } from "@/hooks/i18n/useT";
import type { ConferenciaDaEvolucao, ResumoDaEvolucao } from "@/lib/ai/evolution/resumo-da-evolucao";

export function ResumoDaEvolucaoFaixa({ resumo }: { resumo: ResumoDaEvolucao }) {
  const t = useT();
  const celulas: CelulaDaFaixa[] = [
    {
      id: "aprendeu",
      titulo: t("O agente aprendeu"),
      texto: String(resumo.aprendeu),
      sub: t("regras, melhorias e habilidades"),
    },
    {
      id: "usou",
      titulo: t("O agente usou"),
      texto: String(resumo.usos),
      sub: t("habilidades, consultas e encaminhamentos"),
    },
    {
      id: "negocios",
      titulo: t("Fechados / perdidos"),
      texto: `${resumo.fechados} / ${resumo.perdidos}`,
      sub: t("pelo agente, neste período"),
    },
    {
      id: "travando",
      titulo: t("Está travando"),
      texto: String(resumo.travas),
      sub: resumo.travas > 0 ? t("veja o que fazer no fim da página") : t("nenhuma lacuna neste período"),
      destaque: resumo.travas > 0,
    },
  ];

  const conferencias: ConferenciaDaFaixa[] = resumo.conferencias.map((c) => ({
    id: c.id,
    estado: c.estado,
    texto: (
      <>
        {textoDaConferencia(c, t)}
        {c.id === "travando" && c.estado === "atencao" && (
          <>
            {" "}
            <Link
              href="#bloco-travando"
              data-testid="evolucao-ir-travando"
              className="font-medium text-accent underline underline-offset-2 hover:text-accent-strong"
            >
              {t("Ver o que está travando")}
            </Link>
          </>
        )}
      </>
    ),
  }));

  return (
    <FaixaDeResumo rotulo={t("Sua evolução no período")} prefixo="evolucao" celulas={celulas} conferencias={conferencias} />
  );
}

function textoDaConferencia(c: ConferenciaDaEvolucao, t: (s: string) => string): string {
  const n = c.quantidade ?? 0;
  switch (c.motivo) {
    case "travando":
      return n === 1
        ? t("1 lacuna está limitando o agente. O que fazer está em O que está travando, no fim da página.")
        : `${n} ${t("lacunas estão limitando o agente. O que fazer está em O que está travando, no fim da página.")}`;
    case "sem_lacunas":
      return t("Nenhuma lacuna apareceu neste período, no que a tela consegue medir.");
    case "aprendeu":
      return n === 1
        ? t("O agente aprendeu 1 coisa nova neste período.")
        : `${t("O agente aprendeu")} ${n} ${t("coisas novas neste período.")}`;
    case "nada_aprendeu":
      return t(
        "O agente não aprendeu nada novo neste período. Regras da Memória da IA, melhorias aprovadas e habilidades instaladas aparecem em O que seu agente aprendeu.",
      );
    case "usou":
      return n === 1
        ? t("O agente usou um recurso 1 vez neste período.")
        : `${t("O agente usou seus recursos")} ${n} ${t("vezes neste período.")}`;
    case "nada_usou":
      return t(
        "O agente não usou habilidades, materiais nem encaminhamentos neste período. Pode ser que as conversas não pedissem, ou que ainda não haja nada instalado.",
      );
    default:
      return c.motivo;
  }
}
