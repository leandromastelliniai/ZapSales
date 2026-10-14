/**
 * O resultado da validação do usuário, repassado do `proxy` ao resto da requisição.
 *
 * ─── Por que existe ──────────────────────────────────────────────────────────
 *
 * O `proxy` global valida o token no GoTrue (`getUser()` → `GET /auth/v1/user`).
 * Cada ponto depois dele — layout, rota, MFA (`listFactors` chama `getUser`),
 * auditoria, suporte temporário — fazia a sua própria validação, e cada uma é uma
 * ida ao GoTrue. Medido em produção (2026-10-14): mediana de 332 ms e pico de
 * 2,3 s por chamada. Uma requisição logada pagava isso várias vezes.
 *
 * A regra de segurança NÃO muda: nunca se confia no cookie local, o token é
 * validado no servidor de autenticação. O que muda é QUANTAS vezes. O proxy valida
 * uma vez e assina o resultado; quem vem depois confere a assinatura em vez de
 * perguntar de novo.
 *
 * ─── Por que não dá para forjar ──────────────────────────────────────────────
 *
 * 1. O proxy REMOVE `x-zs-sessao` de toda requisição que chega (antes de qualquer
 *    decisão), então valor vindo de fora nunca atravessa um caminho que ele alcança.
 * 2. Há caminhos que o proxy NÃO alcança (uploads grandes, estáticos — ver o
 *    `matcher`). Neles o cabeçalho de fora chegaria intacto. Por isso o valor é
 *    ASSINADO (HMAC-SHA256) com uma chave derivada de um segredo que só o servidor
 *    tem: sem a chave, ninguém fabrica um valor que passe, e valor que não passa é
 *    ignorado — a rota cai na validação de sempre, no GoTrue.
 * 3. O valor expira (`VALIDADE_MS`). Fora do prazo, volta à validação de sempre.
 *
 * Falha SEMPRE para o caminho antigo (perguntar ao GoTrue), nunca para "confiar".
 */
import type { User } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/** Nome do cabeçalho interno. Só o proxy escreve; todo o resto só lê. */
export const CABECALHO_SESSAO = "x-zs-sessao";

/** Uma requisição que dura mais que isto volta a validar no GoTrue. */
const VALIDADE_MS = 120_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function paraBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): Uint8Array | null {
  try {
    const bin = atob(texto.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * A chave de assinatura é DERIVADA da service key com um rótulo próprio, e não a
 * própria service key: o HMAC não pode virar um oráculo para outro uso do segredo.
 * A service key é `requiredAlways` em `lib/env.ts`, então sempre existe.
 */
async function chaveDeAssinatura(): Promise<CryptoKey> {
  const base = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`zs:sessao-repassada:v1:${env.SUPABASE_SERVICE_ROLE_KEY}`),
  );
  return crypto.subtle.importKey("raw", base, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Assina o usuário que o GoTrue acabou de validar. Só o `proxy` chama. */
export async function assinarSessao(user: User, agora: number = Date.now()): Promise<string> {
  const corpo = paraBase64Url(encoder.encode(JSON.stringify({ u: user, e: agora + VALIDADE_MS })));
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    await chaveDeAssinatura(),
    encoder.encode(corpo),
  );
  return `${corpo}.${paraBase64Url(new Uint8Array(assinatura))}`;
}

/**
 * Devolve o usuário se — e só se — o valor foi assinado por este servidor e ainda
 * está no prazo. Qualquer outra coisa (ausente, adulterado, vencido, ilegível)
 * devolve `null`, e quem chama segue para a validação normal.
 */
export async function lerSessaoRepassada(
  valor: string | null | undefined,
  agora: number = Date.now(),
): Promise<User | null> {
  if (!valor) return null;
  const partes = valor.split(".");
  if (partes.length !== 2) return null;
  const [corpo, assinatura] = partes as [string, string];
  const bytesDaAssinatura = deBase64Url(assinatura);
  if (!bytesDaAssinatura) return null;
  try {
    // `verify` compara em tempo constante.
    const confere = await crypto.subtle.verify(
      "HMAC",
      await chaveDeAssinatura(),
      bytesDaAssinatura as BufferSource,
      encoder.encode(corpo),
    );
    if (!confere) return null;
    const bytesDoCorpo = deBase64Url(corpo);
    if (!bytesDoCorpo) return null;
    const dados = JSON.parse(decoder.decode(bytesDoCorpo)) as { u?: User; e?: number };
    if (typeof dados.e !== "number" || dados.e < agora) return null;
    if (!dados.u || typeof dados.u.id !== "string") return null;
    return dados.u;
  } catch {
    return null;
  }
}

/**
 * O que muda a identidade DENTRO da requisição. Depois de qualquer um destes, o
 * usuário que o proxy validou deixou de ser o retrato atual (fator de MFA recém
 * cadastrado, e-mail trocado, sessão encerrada) e o `getUser()` volta a perguntar
 * ao GoTrue. Lista de propósito larga: errar para o lado de perguntar custa uma
 * chamada; errar para o outro entrega dado velho a uma decisão de acesso.
 */
const MUTADORES = [
  "signOut",
  "signInWithPassword",
  "signInWithOtp",
  "signInWithOAuth",
  "signInWithIdToken",
  "signInWithSSO",
  "signUp",
  "updateUser",
  "setSession",
  "refreshSession",
  "exchangeCodeForSession",
  "verifyOtp",
  "reauthenticate",
  "unlinkIdentity",
  "linkIdentity",
];
const MUTADORES_DE_MFA = ["enroll", "unenroll", "verify", "challengeAndVerify"];

type Metodos = Record<string, ((...args: unknown[]) => unknown) | undefined>;

function envolver(alvo: Metodos, nomes: string[], aoChamar: () => void): void {
  for (const nome of nomes) {
    const original = alvo[nome];
    if (typeof original !== "function") continue;
    alvo[nome] = (...args: unknown[]) => {
      aoChamar();
      return original.apply(alvo, args);
    };
  }
}

/**
 * Faz o `auth.getUser()` deste cliente devolver o usuário que o proxy validou,
 * sem ir ao GoTrue. Os métodos internos do auth-js (`mfa.listFactors`, por
 * exemplo) chamam `this.getUser()`, então o repasse vale para eles também.
 *
 * `getUser(jwt)` com token explícito é uma pergunta sobre OUTRO token e sempre vai
 * ao GoTrue.
 */
/**
 * `createClient()` roda várias vezes por requisição. O "ainda vale" é, portanto,
 * da REQUISIÇÃO (chaveada pelo objeto de cabeçalhos dela), não de cada cliente:
 * um `signOut`/`mfa.enroll` no cliente A precisa tirar o repasse do cliente B.
 */
const estadoPorRequisicao = new WeakMap<object, { valido: boolean }>();

export function reaproveitarUsuarioDoProxy(
  client: { auth: unknown },
  user: User,
  requisicao: object = client,
): void {
  const auth = client.auth as Metodos & { mfa?: Metodos };
  const original = auth.getUser;
  if (typeof original !== "function") return;
  let estado = estadoPorRequisicao.get(requisicao);
  if (!estado) {
    estado = { valido: true };
    estadoPorRequisicao.set(requisicao, estado);
  }
  const compartilhado = estado;
  const invalidar = () => {
    compartilhado.valido = false;
  };
  auth.getUser = (...args: unknown[]) =>
    args[0] || !compartilhado.valido
      ? original.apply(auth, args)
      : Promise.resolve({ data: { user }, error: null });
  envolver(auth, MUTADORES, invalidar);
  if (auth.mfa) envolver(auth.mfa, MUTADORES_DE_MFA, invalidar);
}
