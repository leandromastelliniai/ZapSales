import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * O PAINEL: o contêiner das telas, no desenho da Inbox — canto grande, filete fino, fundo elevado.
 *
 * Tabela, lista e bloco de formulário ficam DENTRO de um painel, separados do fundo da tela pelo
 * filete e por um espaço, em vez de coladas direto no fundo (como Contatos e Auditoria estavam).
 * O cabeçalho do painel, quando existe, é uma faixa separada por filete, com o título e as ações.
 *
 * ⚠️ Painel não vai dentro de painel. Dois níveis de borda arredondada são o "cartão dentro de
 * cartão" que embaralha a leitura: o que está dentro de um painel se separa por filete ou por espaço.
 *
 * `semRecuo`: para quando o conteúdo é uma tabela ou uma lista que já traz o próprio respiro de
 * linha e deve encostar nas bordas do painel.
 */
export function Painel({
  titulo,
  descricao,
  acoes,
  nivel = 2,
  semRecuo = false,
  className,
  children,
  ...props
}: {
  titulo?: string;
  descricao?: string;
  acoes?: ReactNode;
  /** Nível do título na hierarquia da página: o `h1` é do cabeçalho da página, então começa em 2. */
  nivel?: 2 | 3 | 4;
  semRecuo?: boolean;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "title">) {
  const Titulo = `h${nivel}` as const;
  return (
    <section
      className={cn("overflow-hidden rounded-xl border border-border bg-surface shadow-xs", className)}
      {...props}
    >
      {titulo || acoes ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            {titulo ? <Titulo className="text-base font-semibold leading-tight tracking-tight">{titulo}</Titulo> : null}
            {descricao ? <p className="max-w-[65ch] text-sm text-muted-foreground">{descricao}</p> : null}
          </div>
          {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
        </header>
      ) : null}
      <div className={cn(!semRecuo && "p-5")}>{children}</div>
    </section>
  );
}
