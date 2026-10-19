---
impacto: nada_mudou
secao: corrigido
titulo: Imagens do PDF da proposta passam a ser buscadas pela proteção de rede do servidor
---

A foto de um produto do catálogo e o logo da marca que aparecem no PDF da proposta agora são baixados pelo
próprio ZapSales, com a mesma proteção de rede que já vale para webhooks e extensões, antes de o PDF ser
montado. Antes, quem baixava era a biblioteca que desenha o PDF, sem essa proteção: um endereço de imagem
cadastrado por alguém da equipe podia apontar para um serviço interno da máquina.

Nada muda para quem usa imagem pública normal (PNG ou JPEG): o PDF sai igual. A imagem que não puder ser
usada — endereço interno, arquivo acima de 2 MB, servidor que demora mais de 5 segundos, formato que não é
PNG/JPEG ou erro ao baixar — simplesmente fica de fora, e **a proposta continua sendo gerada e enviada**.
