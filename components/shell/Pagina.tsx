import type { ReactNode } from "react";

import { CabecalhoDePagina } from "./CabecalhoDePagina";
import { CorpoDaPagina, type LarguraDaPagina } from "./CorpoDaPagina";

/**
 * Corpo + cabeçalho: o que toda tela de lista ou de configuração escreve primeiro.
 * Tela que precisa só de um dos dois usa a peça separada.
 */
export function Pagina({
  largura,
  titulo,
  descricao,
  ajuda,
  acoes,
  children,
}: {
  largura?: LarguraDaPagina;
  titulo: string;
  descricao: string;
  ajuda?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <CorpoDaPagina largura={largura}>
      <CabecalhoDePagina titulo={titulo} descricao={descricao} ajuda={ajuda} acoes={acoes} />
      {children}
    </CorpoDaPagina>
  );
}
