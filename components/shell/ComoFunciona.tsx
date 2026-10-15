"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useT, useIdioma } from "@/lib/i18n/IdiomaProvider";
import { INDICE_DE_AJUDA, type ChaveDeAjuda } from "@/lib/ajuda/indice";
import { conteudoNoIdioma, type ConteudoDeAjuda } from "@/lib/ajuda/tipos";
import { Question } from "@/lib/ui/icons";

/**
 * O botão "Como funciona" do cabeçalho: abre um painel com o que a tela mostra, o passo a passo e as
 * palavras difíceis explicadas.
 *
 * O TEXTO NÃO ESTÁ NO PACOTE DA TELA. Ele é um módulo separado por tela (`lib/ajuda/conteudo/`),
 * baixado só quando a pessoa abre o painel pela primeira vez — a tela carrega tão rápido quanto antes.
 * Carregar é um clique, então o `setState` acontece no tratador de clique, não num efeito.
 */
export function ComoFunciona({ chave, pagina }: { chave: ChaveDeAjuda; pagina: string }) {
  const t = useT();
  const idioma = useIdioma();
  const [conteudo, setConteudo] = useState<ConteudoDeAjuda | null>(null);
  const [falhou, setFalhou] = useState(false);

  function aoAbrir(aberto: boolean) {
    if (!aberto || conteudo) return;
    setFalhou(false);
    INDICE_DE_AJUDA[chave]()
      .then((modulo) => setConteudo(conteudoNoIdioma(modulo.default, idioma)))
      .catch(() => setFalhou(true));
  }

  return (
    <Sheet onOpenChange={aoAbrir}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" data-ajuda={chave}>
          <Question aria-hidden />
          {t("Como funciona")}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("Como funciona")}</SheetTitle>
          <SheetDescription>{pagina}</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6 text-sm">
          {conteudo ? (
            <>
              <p className="max-w-[65ch] leading-relaxed">{conteudo.oQueMostra}</p>
              <section className="space-y-2">
                <h3 className="font-semibold">{t("Passo a passo")}</h3>
                <ol className="list-decimal space-y-2 pl-5 marker:text-muted-foreground">
                  {conteudo.passos.map((passo) => (
                    <li key={passo} className="max-w-[65ch] leading-relaxed">
                      {passo}
                    </li>
                  ))}
                </ol>
              </section>
              {conteudo.termos?.length ? (
                <section className="space-y-2">
                  <h3 className="font-semibold">{t("Palavras desta tela")}</h3>
                  <dl className="space-y-3">
                    {conteudo.termos.map(({ termo, significa }) => (
                      <div key={termo}>
                        <dt className="font-medium">{termo}</dt>
                        <dd className="max-w-[65ch] leading-relaxed text-muted-foreground">{significa}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}
            </>
          ) : falhou ? (
            <p className="text-muted-foreground">{t("Não foi possível carregar a ajuda. Feche e abra de novo.")}</p>
          ) : (
            <p className="text-muted-foreground" aria-live="polite">
              {t("Carregando…")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
