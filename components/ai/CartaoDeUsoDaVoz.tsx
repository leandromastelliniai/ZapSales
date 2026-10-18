import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { ConfigDeAudio } from "@/lib/ai/resposta-em-audio/config";
import type { ResumoDoUsoDaVoz } from "@/lib/ai/resposta-em-audio/uso";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/**
 * A voz no Uso de IA (issue #91): o que a resposta em áudio gastou neste mês, e o
 * limite de texto que ela converte.
 *
 * Voz cobra por CARACTERE e não aparece nos gráficos de tokens, então ganha o
 * próprio cartão — só quando há o que mostrar (recurso ligado, ou uso no mês). Uma
 * organização que nunca ligou a resposta em áudio não vê esta caixa.
 *
 * O custo já está no gasto do mês que o teto de orçamento vigia (`llm_calls`, a
 * mesma tabela): este cartão só o abre em partes.
 */
export function CartaoDeUsoDaVoz({
  config,
  uso,
  idioma,
}: {
  config: Pick<ConfigDeAudio, "ligado" | "limite_de_caracteres">;
  uso: ResumoDoUsoDaVoz | null;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const tag = tagDeIdioma(idioma);
  const temUso = uso !== null && uso.respostasEmAudio + uso.falhas > 0;
  if (!config.ligado && !temUso) return null;

  const dinheiro = (cents: number) =>
    `US$ ${(cents / 100).toLocaleString(tag, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

  return (
    <Card className="mb-4 p-4" data-testid="cartao-de-uso-da-voz">
      <h2 className="text-base font-semibold">{t("Voz das respostas em áudio")}</h2>
      {uso === null ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("Não consegui ler o uso da voz agora.")}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground" data-testid="uso-da-voz-mes">
          {`${t("Neste mês")}: ${uso.respostasEmAudio} ${t("respostas em áudio")} · ${uso.caracteres.toLocaleString(tag)} ${t("caracteres convertidos")} · ${dinheiro(uso.custoCents)}`}
          {uso.semPreco > 0 ? ` · ${uso.semPreco} ${t("sem preço conhecido")}` : ""}
          {uso.falhas > 0 ? ` · ${uso.falhas} ${t("caíram em texto por falha da voz")}` : ""}
        </p>
      )}
      <p className="mt-1 text-sm text-muted-foreground" data-testid="uso-da-voz-limite">
        {`${t("Limite por resposta:")} ${config.limite_de_caracteres.toLocaleString(tag)} ${t("caracteres; acima disso a resposta sai como texto.")}`}
      </p>
      <Link href="/app/ai/providers" className="mt-2 inline-block text-sm font-medium underline">
        {t("Ajustar em Provedores")}
      </Link>
    </Card>
  );
}
