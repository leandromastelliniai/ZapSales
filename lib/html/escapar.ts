/**
 * Escapa texto para dentro de HTML montado à mão — e-mail, ponte de volta do
 * login, página de saída. O único lugar desta regra: antes da issue #12 havia
 * uma cópia por template, e cada cópia nova é uma chance de esquecer a aspa
 * simples (que fecha atributo em `alt='…'`).
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
