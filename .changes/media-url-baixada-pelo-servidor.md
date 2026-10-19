---
impacto: nada_mudou
secao: alterado
titulo: O envio por media_url baixa o arquivo no servidor, com limite de tamanho por tipo
---

Ao enviar uma mensagem com `media_url` (API pública, ferramentas MCP), o servidor agora baixa o
arquivo pela rede segura, guarda no Storage e entrega ao WhatsApp a URL assinada do próprio Storage.
Antes, quem baixava era o gateway de mensagens, que podia ser levado a um endereço interno por DNS
rebinding. Efeitos: o arquivo precisa respeitar o limite do tipo (imagem 5 MB, vídeo e áudio 16 MB,
documento 50 MB, os da Meta) e ser do tipo informado; fora disso a API responde 413 ou 415. O envio
fica um pouco mais lento e o arquivo ocupa a cota do Storage. O PDF da proposta não muda.
