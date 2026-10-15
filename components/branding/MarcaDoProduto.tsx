import { LOGOTIPO, SIMBOLO } from "@/lib/branding/desenho";
import {
  PROPORCAO_DA_FUTURISTAS,
  TracosDaFuturistas,
  VIEWBOX_DA_FUTURISTAS,
} from "@/components/branding/AssinaturaFuturistas";
import { cn } from "@/lib/utils";

/**
 * A marca do PRODUTO desenhada em SVG inline — o que a tela mostra quando
 * ninguém configurou marca própria (`marcaEhADoProduto`, em `lib/branding.ts`).
 *
 * Inline, e não `<img src="/algo.svg">`, por três motivos:
 *  - as cores seguem o TEMA: violeta mais claro e nome em branco-gelo no escuro, como
 *    a régua do produto já define — um arquivo estático teria uma cor só;
 *  - nada em `public/`: um `.svg` fixo ali seria servido na instalação de um
 *    revendedor que configurou a marca dele (ver `lib/branding/desenho.ts`);
 *  - a barra lateral já usa `<img>` para o logo CONFIGURADO, e o e2e
 *    `marca-logo.spec.ts` mede "barra sem `<img>`" como "sem logo do
 *    revendedor". Um `<img>` do produto ali faria a spec medir a coisa errada.
 *
 * O texto alternativo é o `nome` que a tela já resolveu — nunca uma string
 * fixa, para que a catraca de marca (`tests/unit/branding.test.ts`) continue
 * contando ZERO ocorrências fora de `lib/branding.ts`.
 */

type Props = {
  readonly nome: string;
  readonly className?: string;
  /** `true` quando o texto ao lado já nomeia a marca — evita ler duas vezes. */
  readonly decorativo?: boolean;
};

const SIMBOLO_CLARO_ESCURO = "fill-[#773df9] dark:fill-[#9e8aff]";
const NOME_CLARO_ESCURO = "fill-[#151a2e] dark:fill-[#eef0f7]";
const SUFIXO_CLARO_ESCURO = "fill-[#4b5373] dark:fill-[#a3abc6]";

// As classes acima repetem os hexes de `CORES_DA_MARCA` porque o Tailwind só
// gera utilitário para valor LITERAL no fonte. Quem impede os dois de divergirem
// é `tests/unit/marca-do-produto.test.tsx`, que compara as classes à paleta —
// e não uma asserção em runtime: um throw aqui derrubaria a casca inteira.
export const CLASSES_DE_COR = {
  simbolo: SIMBOLO_CLARO_ESCURO,
  nome: NOME_CLARO_ESCURO,
  sufixo: SUFIXO_CLARO_ESCURO,
} as const;

function acessibilidade(nome: string, decorativo: boolean) {
  return decorativo
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": nome } as const);
}

/** O símbolo sozinho — para a barra recolhida, avatar e cantos apertados. */
export function SimboloDoProduto({ nome, className, decorativo = false }: Props) {
  return (
    <svg
      viewBox={SIMBOLO.viewBox}
      className={cn("shrink-0", className)}
      {...acessibilidade(nome, decorativo)}
    >
      <g className={SIMBOLO_CLARO_ESCURO} transform={SIMBOLO.transform}>
        <path d={SIMBOLO.d} />
        <path d={SIMBOLO.realce} />
      </g>
    </svg>
  );
}

/** Símbolo + nome — para a barra aberta e a fachada de entrada. */
export function LogotipoDoProduto({ nome, className, decorativo = false }: Props) {
  return (
    <svg
      viewBox={LOGOTIPO.viewBox}
      className={cn("shrink-0", className)}
      {...acessibilidade(nome, decorativo)}
    >
      <g className={SIMBOLO_CLARO_ESCURO} transform={LOGOTIPO.simbolo.transform}>
        <path d={LOGOTIPO.simbolo.d} />
        <path d={LOGOTIPO.simbolo.realce} />
      </g>
      <g className={NOME_CLARO_ESCURO}>
        {LOGOTIPO.nome.map((g) => (
          <path key={g.transform} transform={g.transform} d={g.d} />
        ))}
      </g>
      {/* "by Futuristas" no lugar do antigo "CRM" (decisão do dono, 07/10/2026):
          o "by" na cor do sufixo, o logo oficial da Futuristas na cor do nome,
          com os quadradinhos no violeta dela. Dentro do MESMO SVG — os testes de
          marca leem o logotipo como uma imagem só, rotulada com o nome. */}
      <text
        className={SUFIXO_CLARO_ESCURO}
        x={268}
        y={212}
        fontSize={38}
        fontWeight={500}
      >
        by
      </text>
      <svg
        x={318}
        y={170}
        height={50}
        width={50 * PROPORCAO_DA_FUTURISTAS}
        viewBox={VIEWBOX_DA_FUTURISTAS}
        className={NOME_CLARO_ESCURO}
        aria-hidden
      >
        <TracosDaFuturistas />
      </svg>
    </svg>
  );
}
