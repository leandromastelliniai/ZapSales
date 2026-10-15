"use client";
/**
 * O CAMPO DE TEXTO DA MENSAGEM DO MODELO, com as variáveis à vista.
 *
 * É um `<textarea>` de verdade — cursor, seleção, colar e desfazer são do
 * navegador — com uma camada atrás que pinta de destaque cada `{{variável}}` do
 * texto, como a "etiqueta" azul do ManyChat. A camada tem a mesma fonte, a mesma
 * borda e o mesmo preenchimento, e o campo cresce com o texto (sem barra de
 * rolagem), então as duas nunca saem do alinhamento. O destaque é só fundo: o
 * texto continua sendo o do textarea.
 */
import { useEffect, type RefObject } from "react";

const VARIAVEL = /\{\{\s*\w+\s*\}\}/g;

/** Tudo o que a camada e o campo precisam ter igual para o destaque cair em cima do texto. */
const MEDIDAS =
  "w-full whitespace-pre-wrap break-words rounded-md border px-3 py-2 text-sm leading-6";

/** O texto partido em pedaços, marcando quais são variáveis. */
function pedacos(texto: string): Array<{ texto: string; variavel: boolean }> {
  const out: Array<{ texto: string; variavel: boolean }> = [];
  let desde = 0;
  for (const m of texto.matchAll(VARIAVEL)) {
    if (m.index > desde) out.push({ texto: texto.slice(desde, m.index), variavel: false });
    out.push({ texto: m[0], variavel: true });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) out.push({ texto: texto.slice(desde), variavel: false });
  return out;
}

export function CampoDeMensagem({
  valor,
  onMudar,
  campoRef,
  testId,
  rotulo,
  maximo,
}: {
  valor: string;
  onMudar: (texto: string) => void;
  /** O campo de quem chama: é dele que se lê o cursor para inserir uma variável. */
  campoRef: RefObject<HTMLTextAreaElement | null>;
  testId: string;
  rotulo: string;
  maximo?: number;
}) {
  // Cresce com o conteúdo: sem rolagem própria, a camada de destaque acompanha.
  useEffect(() => {
    const campo = campoRef.current;
    if (!campo) return;
    campo.style.height = "auto";
    campo.style.height = `${campo.scrollHeight}px`;
  }, [valor, campoRef]);

  return (
    <div className="relative">
      <div
        aria-hidden
        className={`${MEDIDAS} pointer-events-none absolute inset-0 overflow-hidden border-transparent text-transparent`}
        data-testid={`${testId}-destaque`}
      >
        {pedacos(valor).map((p, i) =>
          p.variavel ? (
            <mark key={i} className="rounded-sm bg-primary/25 text-transparent">
              {p.texto}
            </mark>
          ) : (
            <span key={i}>{p.texto}</span>
          ),
        )}
        {/* O textarea mostra a linha final vazia depois de um Enter; a camada precisa da mesma. */}
        {"\n"}
      </div>
      <textarea
        aria-label={rotulo}
        ref={campoRef}
        className={`${MEDIDAS} relative block min-h-28 resize-none overflow-hidden bg-transparent outline-hidden focus-visible:ring-2 focus-visible:ring-ring`}
        value={valor}
        maxLength={maximo}
        onChange={(e) => onMudar(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}
