/**
 * VALIDAÇÕES SIMULTÂNEAS DA MESMA SESSÃO VIRAM UMA SÓ (issue #66, parte 3 da #63).
 *
 * A #64 deixou uma ida ao GoTrue POR REQUISIÇÃO. Mas a Inbox, ao abrir, dispara
 * ~15 chamadas de API ao mesmo tempo, e cada uma passa pelo proxy: 15 `GET /user`
 * simultâneos no GoTrue, que respondem em fila (medido na produção: 1,7 a 2,3 s
 * cada, com o banco em 1 ms). Quem espera o mesmo token ser validado não precisa
 * de uma segunda pergunta — precisa da resposta da primeira.
 *
 * ## O que isto NÃO faz
 *
 * Não guarda resultado. Quando a ida ao GoTrue termina, a entrada some: a
 * requisição seguinte pergunta de novo. A regra "validar o token no servidor de
 * autenticação" (CLAUDE.md › Auth) segue valendo; só não se repete uma pergunta
 * que já está em voo para a MESMA sessão.
 *
 * ## Por que não mistura identidades
 *
 * A chave é o hash de TODOS os cookies de sessão da requisição. Token diferente,
 * chave diferente. Sem cookie de sessão não há chave e nada é compartilhado.
 */

const EM_VOO = new Map<string, Promise<unknown>>();

/** Hash (SHA-256, hex) dos cookies de sessão; `null` quando não há nenhum. */
export async function chaveDaSessao(
  cookies: { name: string; value: string }[],
  prefixo: string,
): Promise<string | null> {
  const dela = cookies
    .filter((c) => c.name === prefixo || c.name.startsWith(`${prefixo}.`))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  if (dela.length === 0) return null;
  const bytes = new TextEncoder().encode(dela.map((c) => `${c.name}=${c.value}`).join("\n"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Executa `executar` uma vez por chave enquanto houver uma execução em voo. */
export function compartilharEmVoo<T>(chave: string | null, executar: () => Promise<T>): Promise<T> {
  if (chave === null) return executar();
  const existente = EM_VOO.get(chave);
  if (existente) return existente as Promise<T>;
  const p = executar().finally(() => {
    EM_VOO.delete(chave);
  });
  EM_VOO.set(chave, p);
  return p;
}
