"use client";
/**
 * Criar modelo de mensagem da API Oficial — a página do editor.
 *
 * O editor tem três colunas e vários idiomas, então não cabe como painel dentro da
 * lista de modelos: ele ganha a página, com o caminho de volta no alto. Quem
 * escreve a regra do modelo é o próprio editor (`EditorDeModelo`); aqui só moram
 * o caminho e o destino depois de enviar ou cancelar.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";

import { EditorDeModelo } from "@/components/connections/EditorDeModelo";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { useT } from "@/hooks/i18n/useT";
import { ArrowBendUpLeft } from "@/lib/ui/icons";

/** A lista de modelos: a aba API Oficial › Templates da Meta, de Conexões. */
const LISTA_DE_MODELOS = "/app/connections?aba=oficial&sub=templates";

export function NovoModelo() {
  const t = useT();
  const router = useRouter();

  return (
    <CorpoDaPagina className="gap-4">
      <nav aria-label={t("Onde você está")} className="flex items-center gap-2 text-sm">
        <Link
          href={LISTA_DE_MODELOS}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-text"
        >
          <ArrowBendUpLeft size={14} aria-hidden />
          {t("Modelos de mensagem")}
        </Link>
        <span aria-hidden className="text-muted-foreground">
          ›
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Criar modelo")}</h1>
      </nav>
      <EditorDeModelo onFechar={() => router.push(LISTA_DE_MODELOS)} />
    </CorpoDaPagina>
  );
}
