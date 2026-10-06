---
impacto: capacidade_nova
secao: corrigido
titulo: Arquivos acima de 10 MB voltam a chegar inteiros
---

Enviar um arquivo com mais de 10 MB falhava com a mensagem "Campo 'file' obrigatório", embora a
tela prometesse aceitar até 20 MB no acervo de conhecimento e até 50 MB nos anexos da conversa e
das notas. Agora o arquivo chega inteiro até o teto anunciado.

Os modelos da API Oficial também aceitam arquivos maiores no cabeçalho: vídeo de até 16 MB (o
limite da Meta) e documento de até 50 MB. Antes os dois eram limitados a 9 MB.

Não é preciso fazer nada na VPS: a correção vem na imagem.
