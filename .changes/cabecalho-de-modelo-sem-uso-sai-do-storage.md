---
impacto: nada_mudou
secao: corrigido
titulo: Arquivo de cabeçalho de modelo que nenhum modelo usa sai do armazenamento
---

A imagem, o vídeo ou o PDF enviado como cabeçalho no editor de modelos da API Oficial ficava
guardado para sempre, mesmo quando deixava de ser usado: ao trocar o arquivo no editor, ao
fechar o editor sem criar o modelo ou ao recriar um modelo desativado. Esses arquivos ocupavam
o mesmo espaço da mídia das conversas.

A limpeza diária de mídia passa a apagar o arquivo de cabeçalho que tem mais de 7 dias e que
nenhum modelo usa. O arquivo de um modelo existente continua guardado, seja qual for a situação
do modelo na Meta. Os 7 dias dão tempo de terminar um modelo começado no editor antes de o arquivo
entrar na limpeza.
