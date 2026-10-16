import type { Role } from "./team";

/**
 * Como o papel aparece para quem usa o produto. O valor guardado no banco
 * (`viewer`/`agent`/`manager`/`admin`) é vocabulário interno e nunca vai à tela:
 * a Equipe mostrava `manager` e `viewer` crus. Passe o resultado por `t()`.
 */
export const ROTULO_DO_PAPEL: Record<Role, string> = {
  viewer: "Visualizador",
  agent: "Atendente",
  manager: "Gerente",
  admin: "Administrador",
};

/** Papel desconhecido (vindo de um clone mais novo) cai no valor cru, nunca em branco. */
export function rotuloDoPapel(papel: string): string {
  return (ROTULO_DO_PAPEL as Record<string, string>)[papel] ?? papel;
}
