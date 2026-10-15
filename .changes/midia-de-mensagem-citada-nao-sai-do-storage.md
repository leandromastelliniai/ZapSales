---
impacto: nada_mudou
secao: corrigido
titulo: Arquivo de mensagem não é apagado quando a mensagem é criada um dia depois do envio do arquivo
---

Quem enviava um arquivo pela API e só criava a mensagem com ele mais de um dia depois podia ficar
com uma mensagem sem arquivo: a limpeza diária de mídia já tinha marcado o arquivo como sem uso, e
o apagava em seguida. A conversa mostrava "Mídia indisponível" e nada chegava ao WhatsApp.

Agora a mensagem que passa a usar o arquivo o tira da lista de remoção, e a limpeza confere, antes
de apagar, se alguma mensagem usa o arquivo. Se o arquivo já tiver sido apagado, a criação da
mensagem é recusada com o código `media_unavailable`, e basta enviar o arquivo de novo.
