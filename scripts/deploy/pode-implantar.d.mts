// Tipos de scripts/deploy/pode-implantar.mjs — o script roda no runner com `node`
// puro (sem instalar dependências), por isso é .mjs; este arquivo é só para o
// teste em TypeScript (tests/unit/deploy-automatico.test.ts).

export declare const VERIFICACOES_EXIGIDAS: readonly string[];

export interface ExecucaoDeWorkflow {
  id: number;
  name: string;
  event: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
}

export declare function decidir(entrada: { sha: string; execucoes: ExecucaoDeWorkflow[] }): {
  veredito: "implantar" | "esperar" | "pular";
  motivo: string;
};
