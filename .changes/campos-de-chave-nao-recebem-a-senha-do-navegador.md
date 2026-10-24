---
impacto: nada_mudou
secao: corrigido
titulo: Campos de token e chave não são mais preenchidos com a senha de login pelo navegador
---

Em telas como **Conversões**, **Meta Ads**, **Chaves de acesso à IA**, **Linha telefônica** e as conexões do WhatsApp, o campo de token ou de chave podia aparecer já preenchido com a senha (e o campo ao lado com o e-mail) de quem estava logado, porque o Chrome oferece a senha salva a qualquer campo de senha que não diga o contrário. Quem clicasse em salvar sem reparar gravaria a própria senha de login como token. Esses campos agora avisam o navegador de que **não são uma senha de login**, e ele deixa de preenchê-los.
