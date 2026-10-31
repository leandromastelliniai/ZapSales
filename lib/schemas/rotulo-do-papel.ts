import { ROTULO_DO_PAPEL as ROTULO_DE_TODOS_OS_PAPEIS } from "@/lib/auth/types";
import type { Role } from "./team";

/**
 * Como o papel aparece para quem usa o produto. O valor guardado no banco
 * (`viewer`/`agent`/`manager`/`admin`) é vocabulário interno e nunca vai à tela:
 * a Equipe mostrava `manager` e `viewer` crus. Passe o resultado por `t()`.
 *
 * Não escreve nome: recorta os quatro papéis humanos da tabela de `lib/auth/types.ts`,
 * que é a única fonte. Antes havia duas tabelas, e o `viewer` era "Visualizador" na
 * Equipe e "Somente leitura" no resto do produto (issue #175).
 */
export const ROTULO_DO_PAPEL: Record<Role, string> = {
  viewer: ROTULO_DE_TODOS_OS_PAPEIS.viewer,
  agent: ROTULO_DE_TODOS_OS_PAPEIS.agent,
  manager: ROTULO_DE_TODOS_OS_PAPEIS.manager,
  admin: ROTULO_DE_TODOS_OS_PAPEIS.admin,
};

/** Papel desconhecido (vindo de um clone mais novo) cai no valor cru, nunca em branco. */
export function rotuloDoPapel(papel: string): string {
  return (ROTULO_DO_PAPEL as Record<string, string>)[papel] ?? papel;
}
