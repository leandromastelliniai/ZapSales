import { criarIcone } from "./criarIcone";

/**
 * Os ícones próprios do produto. Cada um nasceu de um conceito que o Phosphor não desenha:
 *
 *   - `FunilEmEtapas`: a Linha do Funil — etapas passadas cheias, a atual maior, a futura vazada.
 *     É a assinatura visual da Inbox, agora também o ícone da lista de funis.
 *   - `AgenteEmConversa`: o agente de IA falando com um cliente — balão com a faísca da IA dentro.
 *   - `PassagemParaHumano`: a IA entrega a conversa a uma pessoa — faísca, seta, pessoa.
 *   - `FilaDeEspera`: quem espera atendimento — três barras que encurtam, com a bolinha de cada um.
 *   - `JanelaDe24h`: a janela de 24 horas da API Oficial — balão com um relógio dentro.
 *
 * Grade de 256, traço de 16, pontas redondas: ver `criarIcone`. A prévia, ao lado do Phosphor, está
 * em `/vitrine-sistema`.
 */

const BALAO =
  "M56 40h144a16 16 0 0 1 16 16v100a16 16 0 0 1-16 16h-76l-36 36v-36H56a16 16 0 0 1-16-16V56a16 16 0 0 1 16-16Z";

// A linha sobe na diagonal, de baixo à esquerda para cima à direita: na horizontal ela ocupava só uma
// faixa de 56 em 256 e, em 16 px, virava um pontilhado. Etapas passadas cheias, a atual maior, a
// futura vazada — a mesma gramática da Linha do Funil da Inbox.
export const FunilEmEtapas = criarIcone("FunilEmEtapas", {
  tracos: (
    <>
      <path d="M56 190L88 162M112 142L136 122M176 88L200 66" />
      <circle cx="212" cy="56" r="16" />
    </>
  ),
  cheios: (
    <>
      <circle cx="44" cy="200" r="16" />
      <circle cx="100" cy="152" r="16" />
      <circle cx="156" cy="105" r="26" />
    </>
  ),
  fundo: <circle cx="156" cy="105" r="48" />,
});

export const AgenteEmConversa = criarIcone("AgenteEmConversa", {
  tracos: <path d={BALAO} />,
  cheios: <path d="M128 70l10 26 26 10-26 10-10 26-10-26-26-10 26-10Z" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />,
  fundo: <path d={BALAO} />,
});

export const PassagemParaHumano = criarIcone("PassagemParaHumano", {
  tracos: (
    <>
      <path d="M108 128h60M148 108l20 20-20 20" />
      <circle cx="204" cy="92" r="22" />
      <path d="M168 204a36 36 0 0 1 72 0" />
    </>
  ),
  cheios: <path d="M64 92l9 27 19 9-19 9-9 27-9-27-19-9 19-9Z" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />,
  fundo: <circle cx="204" cy="92" r="22" />,
});

export const FilaDeEspera = criarIcone("FilaDeEspera", {
  tracos: (
    <>
      <rect x="40" y="48" width="176" height="40" rx="20" />
      <rect x="40" y="108" width="144" height="40" rx="20" />
      <rect x="40" y="168" width="112" height="40" rx="20" />
    </>
  ),
  cheios: (
    <>
      <circle cx="60" cy="68" r="8" />
      <circle cx="60" cy="128" r="8" />
      <circle cx="60" cy="188" r="8" />
    </>
  ),
  fundo: <rect x="40" y="48" width="176" height="40" rx="20" />,
});

export const JanelaDe24h = criarIcone("JanelaDe24h", {
  tracos: (
    <>
      <path d={BALAO} />
      <circle cx="128" cy="106" r="34" />
      <path d="M128 88v18l14 9" />
    </>
  ),
  fundo: <circle cx="128" cy="106" r="34" />,
});

/** O catálogo, para a prévia e para os testes. A ordem é a da vitrine. */
export const ICONES_DO_PRODUTO = {
  FunilEmEtapas,
  AgenteEmConversa,
  PassagemParaHumano,
  FilaDeEspera,
  JanelaDe24h,
} as const;
