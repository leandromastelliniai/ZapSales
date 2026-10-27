/**
 * O título de um bloco de uma tela longa: separa o que a pessoa faz em cada etapa (mandar as vendas
 * de volta, conferir o que falhou, saber de onde veio o cliente) sem esconder nada. Sem estado e sem
 * hook, para servir tanto a tela de servidor quanto a de cliente; o texto já chega traduzido.
 */
export function TituloDeSecao({
  titulo,
  descricao,
  className,
}: {
  titulo: string;
  descricao: string;
  className?: string;
}) {
  return (
    <div className={`border-b border-border pb-2 ${className ?? ""}`} data-testid="titulo-de-secao">
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <p className="text-sm text-muted-foreground">{descricao}</p>
    </div>
  );
}
