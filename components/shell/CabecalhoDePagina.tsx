import type { ReactNode } from "react";

/**
 * O cabeçalho de toda tela: o que ela é, em uma linha, e o que se faz aqui.
 *
 * Componente de SERVIDOR (sem hook): quem chama passa o texto já traduzido, como as telas fazem hoje
 * com `traduzir(texto, user.idioma)`. O botão "Como funciona" (`ComoFunciona`) é cliente e entra por
 * `ajuda`.
 *
 *   - O `<h1>` é o único da página: leitor de tela e atalho de navegação dependem disso.
 *   - A descrição tem teto de 65 caracteres de medida; passou disso, é texto para o "Como funciona".
 *   - À direita: primeiro a ajuda, depois a ação principal — que fica sempre no canto, no mesmo lugar
 *     em todas as telas (antes ela caía solta no meio, ou abaixo, conforme a tela).
 */
export function CabecalhoDePagina({
  titulo,
  descricao,
  ajuda,
  acoes,
}: {
  titulo: string;
  descricao: string;
  ajuda?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{titulo}</h1>
        <p className="max-w-[65ch] text-sm text-muted-foreground">{descricao}</p>
      </div>
      {ajuda || acoes ? (
        <div className="flex flex-wrap items-center gap-2">
          {ajuda}
          {acoes}
        </div>
      ) : null}
    </header>
  );
}
