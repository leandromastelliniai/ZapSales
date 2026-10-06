// scripts/deploy/pode-implantar.mjs — o commit do topo da `main` pode ir para a produção?
//
// Roda no job `implantar` de `.github/workflows/deploy.yml`, antes de qualquer
// SSH. A resposta é uma de três:
//
//   implantar — o topo da `main` tem as QUATRO verificações de push verdes
//   esperar   — alguma ainda roda (ou nem começou); a conclusão dela acorda
//               este workflow de novo, e a pergunta é refeita
//   pular     — alguma verificação terminou sem sucesso: a produção fica onde
//               está, e o vermelho já é visível no próprio commit
//
// ## Por que a pergunta é sobre o TOPO da `main`, e não sobre o commit do evento
//
// O workflow acorda pela conclusão de cada uma das quatro verificações, de
// qualquer commit. Com `cancel-in-progress: false`, o GitHub guarda UMA rodada
// pendente por grupo e descarta a anterior — então a rodada que de fato
// executa pode ter nascido do evento de um commit velho. Se ela decidisse sobre
// o commit do evento, o último gatilho do commit novo podia ser descartado e o
// deploy dele nunca aconteceria. Decidindo sempre sobre o topo, qualquer
// rodada que execute faz a pergunta certa.
//
// ## Por que o gate é este, e não a proteção da `main`
//
// A proteção de branch é configuração do repositório: muda num clique, não
// passa por PR, e em 2026-10-05 não existia (`Branch not protected`). Um push
// direto na `main` iria para a produção sem teste nenhum. Aqui o deploy exige
// as verificações do PRÓPRIO commit, rodadas no evento `push` da `main`, seja
// qual for a configuração da branch.

export const VERIFICACOES_EXIGIDAS = Object.freeze([
  "ci",
  "e2e",
  "perf",
  "Publicar imagem Docker (GHCR)",
]);

const SHA = /^[0-9a-f]{40}$/;

/**
 * @param {{ sha: string, execucoes: Array<{ id: number, name: string, event: string,
 *   head_sha: string, status: string, conclusion: string | null }> }} entrada
 * @returns {{ veredito: "implantar" | "esperar" | "pular", motivo: string }}
 */
export function decidir({ sha, execucoes }) {
  if (!SHA.test(sha)) throw new Error(`SHA inválido: '${sha}'`);

  const pendentes = [];
  for (const nome of VERIFICACOES_EXIGIDAS) {
    // A mais recente (maior id) vence: uma re-execução que passou substitui a
    // que falhou, e uma re-execução em andamento volta a ser "esperar".
    const ultima = execucoes
      .filter((e) => e.name === nome && e.event === "push" && e.head_sha === sha)
      .sort((a, b) => b.id - a.id)[0];
    if (!ultima) {
      pendentes.push(`${nome} (ainda não começou)`);
      continue;
    }
    if (ultima.status !== "completed") {
      pendentes.push(`${nome} (${ultima.status})`);
      continue;
    }
    if (ultima.conclusion !== "success") {
      return {
        veredito: "pular",
        motivo: `${nome} terminou em '${ultima.conclusion}' no commit ${sha.slice(0, 7)} — a produção fica onde está.`,
      };
    }
  }
  if (pendentes.length > 0) {
    return { veredito: "esperar", motivo: `Ainda rodando: ${pendentes.join(", ")}.` };
  }
  return {
    veredito: "implantar",
    motivo: `As ${VERIFICACOES_EXIGIDAS.length} verificações de ${sha.slice(0, 7)} estão verdes.`,
  };
}

async function api(caminho) {
  const r = await fetch(`https://api.github.com${caminho}`, {
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} em ${caminho}`);
  return r.json();
}

async function principal() {
  const repo = process.env.GITHUB_REPOSITORY;
  const topo = (await api(`/repos/${repo}/commits/main`)).sha;
  const { workflow_runs: execucoes } = await api(
    `/repos/${repo}/actions/runs?head_sha=${topo}&event=push&per_page=100`,
  );
  const { veredito, motivo } = decidir({ sha: topo, execucoes });
  process.stdout.write(`topo da main: ${topo}\n${veredito}: ${motivo}\n`);
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_OUTPUT, `veredito=${veredito}\nsha=${topo}\n`);
  }
}

const { pathToFileURL } = await import("node:url");
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
}
