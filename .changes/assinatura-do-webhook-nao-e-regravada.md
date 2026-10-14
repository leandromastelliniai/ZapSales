---
impacto: nada_mudou
secao: corrigido
titulo: Atualizar a instalação não liga mais a exigência de assinatura do webhook do WAHA
---

O instalador regravava `WAHA_WEBHOOK_REQUIRE_SIGNATURE=true` a cada atualização. Como o WAHA Core
não assina as entregas, o app recusava todo evento do WhatsApp e o agente deixava de responder, sem
erro na tela. Agora o valor é só uma semente da primeira instalação (`false` no WAHA Core, `true` no
WAHA Plus) e a atualização não toca mais nele: o que você configurou em **Admin › Sistema** ou no
`.env` fica.

Instalações que já têm `true` no `.env` não são alteradas. Se o WhatsApp parou de entregar, desligue
"Exigir assinatura nas entregas do canal" em **Admin › Sistema**.
