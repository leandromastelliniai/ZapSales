---
impacto: capacidade_nova
secao: adicionado
titulo: Imagens com etiqueta imutável por commit e deploy automático com volta sozinha
---

Toda imagem publicada a partir da `main` ganha também a etiqueta `sha-<commit>`, que nunca
se move: quem quer instalar exatamente um commit testado aponta para ela.

O repositório passa a trazer um deploy automático opcional (`.github/workflows/deploy.yml` e
`kit/deploy/`): quando as verificações de um commit da `main` ficam verdes, a VPS configurada
recebe aquele commit, prova que a versão nova está no ar e volta sozinha para a anterior se a
prova falhar. Ele só liga onde o operador o configura (`DEPLOY_AUTOMATICO=sim`); quem instala
pelo kit não muda nada.

Conserto no kit: ao trocar de imagens construídas na VPS para imagens do registro, o
`kit/instalar.sh` agora apaga o `APP_VERSION` antigo do `.env`, que fazia o app responder em
`/api/v1/health` a versão da imagem anterior.
