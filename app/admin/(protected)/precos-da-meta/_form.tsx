"use client";

import { useState, useTransition } from "react";

import { updatePrecosDaMeta } from "@/app/actions/settings/updatePrecosDaMeta";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { MENSAGEM_DA_RECUSA_DE_ESCRITA, ehRecusaDeEscrita } from "@/lib/auth/recusa-de-escrita-de-admin";
import { CATEGORIAS_DE_PRECO, ROTULO_DA_CATEGORIA, type CategoriaDePreco, type LinhaDePreco } from "@/lib/custo/tabela-de-precos";

interface Props {
  readonly linhasIniciais: readonly LinhaDePreco[];
  /** `null` = nunca salva: vale a referência do produto. */
  readonly cotacaoInicial: number | null;
  readonly cotacaoDeReferencia: number;
}

/** Um país na tela: uma linha com o preço de cada categoria. */
interface Pais {
  chave: string;
  country: string;
  dial_prefix: string;
  currency: string;
  precos: Record<CategoriaDePreco, string>;
}

function agrupar(linhas: readonly LinhaDePreco[]): Pais[] {
  const porPais = new Map<string, Pais>();
  for (const l of linhas) {
    const p = porPais.get(l.country) ?? {
      chave: l.country,
      country: l.country,
      dial_prefix: l.dial_prefix,
      currency: l.currency,
      precos: { marketing: "", utility: "", authentication: "", service: "" },
    };
    p.precos[l.category] = (l.unit_price_cents / 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
    porPais.set(l.country, p);
  }
  return [...porPais.values()];
}

/** "0,3217" → 32.17 centavos; vazio → `null` (categoria fora da tabela). */
function centavos(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (t === "") return null;
  const reais = Number(t);
  return Number.isFinite(reais) && reais >= 0 ? Math.round(reais * 1_000_000) / 10_000 : NaN;
}

/**
 * Um país por linha, uma coluna por categoria, e um botão de salvar — a tabela
 * inteira de uma vez, como ela é mostrada: o que sumiu da tela sai do banco.
 */
export function FormularioDePrecosDaMeta({ linhasIniciais, cotacaoInicial, cotacaoDeReferencia }: Props) {
  const t = useT();
  const [paises, setPaises] = useState<Pais[]>(() => agrupar(linhasIniciais));
  const [cotacao, setCotacao] = useState(cotacaoInicial === null ? "" : String(cotacaoInicial).replace(".", ","));
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, iniciar] = useTransition();

  function mudar(chave: string, campo: Partial<Omit<Pais, "precos">> & { categoria?: CategoriaDePreco; preco?: string }) {
    setSalvo(false);
    setPaises((atual) =>
      atual.map((p) => {
        if (p.chave !== chave) return p;
        const { categoria, preco, ...resto } = campo;
        return { ...p, ...resto, precos: categoria ? { ...p.precos, [categoria]: preco ?? "" } : p.precos };
      }),
    );
  }

  function salvar() {
    setErro(null);
    setSalvo(false);
    const linhas: LinhaDePreco[] = [];
    for (const p of paises) {
      for (const categoria of CATEGORIAS_DE_PRECO) {
        const c = centavos(p.precos[categoria]);
        if (c === null) continue;
        if (Number.isNaN(c)) {
          setErro(`${t("Preço que não entendi em")} ${p.country || "?"} · ${t(ROTULO_DA_CATEGORIA[categoria])}`);
          return;
        }
        linhas.push({ country: p.country.trim().toUpperCase(), dial_prefix: p.dial_prefix.trim(), category: categoria, unit_price_cents: c, currency: p.currency.trim().toUpperCase() || "BRL" });
      }
    }
    const cot = cotacao.trim() === "" ? null : Number(cotacao.trim().replace(",", "."));
    if (cot !== null && !(cot > 0)) {
      setErro(t("A cotação precisa ser um número maior que zero, ou ficar em branco."));
      return;
    }
    iniciar(async () => {
      const r = await updatePrecosDaMeta({ linhas, cotacao_usd_brl: cot });
      if (r.ok) {
        setSalvo(true);
        return;
      }
      if (r.error === "duplicada") {
        setErro(t("O mesmo país aparece duas vezes. Deixe uma linha por país."));
        return;
      }
      if (r.error === "invalid_input") {
        setErro(t("Confira os campos: país com duas letras (BR), prefixo só com números (55) e moeda com três letras (BRL)."));
        return;
      }
      setErro(t(ehRecusaDeEscrita(r.error) ? MENSAGEM_DA_RECUSA_DE_ESCRITA[r.error] : "Não deu para salvar. Tente de novo em instantes."));
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("Tabela de preços")}</CardTitle>
          <CardDescription>
            {t(
              "Preço de uma mensagem, em reais, para quem recebe naquele país. Mudar aqui muda as estimativas e os tetos daqui para a frente; o custo das mensagens que já saíram continua com o preço da hora em que saíram.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2 font-normal">{t("País")}</th>
                  <th className="py-1 pr-2 font-normal">{t("Prefixo")}</th>
                  {CATEGORIAS_DE_PRECO.map((c) => (
                    <th key={c} className="py-1 pr-2 font-normal">
                      {t(ROTULO_DA_CATEGORIA[c])} (R$)
                    </th>
                  ))}
                  <th className="py-1 font-normal" />
                </tr>
              </thead>
              <tbody>
                {paises.map((p) => (
                  <tr key={p.chave}>
                    <td className="py-1 pr-2">
                      <Input aria-label={t("País")} className="w-16" value={p.country} maxLength={2} onChange={(e) => mudar(p.chave, { country: e.target.value })} />
                    </td>
                    <td className="py-1 pr-2">
                      <Input aria-label={t("Prefixo")} className="w-20" inputMode="numeric" value={p.dial_prefix} onChange={(e) => mudar(p.chave, { dial_prefix: e.target.value })} />
                    </td>
                    {CATEGORIAS_DE_PRECO.map((c) => (
                      <td key={c} className="py-1 pr-2">
                        <Input
                          aria-label={`${p.country} · ${t(ROTULO_DA_CATEGORIA[c])}`}
                          data-testid={`preco-${p.country}-${c}`}
                          inputMode="decimal"
                          value={p.precos[c]}
                          onChange={(e) => mudar(p.chave, { categoria: c, preco: e.target.value })}
                        />
                      </td>
                    ))}
                    <td className="py-1">
                      <Button size="sm" variant="outline" onClick={() => setPaises((a) => a.filter((x) => x.chave !== p.chave))}>
                        {t("Tirar")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setPaises((a) => [
                ...a,
                { chave: `novo-${a.length}-${Date.now()}`, country: "", dial_prefix: "", currency: "BRL", precos: { marketing: "", utility: "", authentication: "", service: "" } },
              ])
            }
          >
            {t("Acrescentar país")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t("O país é o de quem RECEBE, reconhecido pelo prefixo do telefone (55 é o Brasil). Destinatário de país fora da tabela aparece à parte na estimativa, sem preço inventado.")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("Cotação do dólar")}</CardTitle>
          <CardDescription>
            {t("O custo de IA é registrado em dólar, e a Meta cobra em reais. Esta cotação soma os dois no relatório da campanha.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="cotacao">{t("R$ por US$ 1")}</Label>
          <Input
            id="cotacao"
            className="w-32"
            inputMode="decimal"
            placeholder={String(cotacaoDeReferencia).replace(".", ",")}
            value={cotacao}
            onChange={(e) => {
              setSalvo(false);
              setCotacao(e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("Em branco, vale a referência do produto")} (R$ {String(cotacaoDeReferencia).replace(".", ",")}). {t("Ela não acompanha o câmbio do dia: ajuste quando o dólar mudar.")}
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={pendente} data-testid="salvar-precos">
          {pendente ? t("Salvando…") : t("Salvar")}
        </Button>
        {salvo && !erro ? (
          <span className="text-sm text-muted-foreground" role="status">
            {t("Preços salvos.")}
          </span>
        ) : null}
      </div>
      {erro ? (
        <p className="text-sm text-destructive" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
