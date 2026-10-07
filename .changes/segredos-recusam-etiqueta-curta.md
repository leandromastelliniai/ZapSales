---
impacto: nada_mudou
secao: corrigido
titulo: Segredos guardados pela instalação recusam prova de integridade encurtada
---

As chaves de provedores de IA, a senha das conexões de banco externo, os segredos da configuração
da instalação e as credenciais de tronco VoIP ficam cifrados no banco, cada um com uma prova de
integridade de 16 bytes. A decifragem aceitava uma prova mais curta, que é muito mais fácil de
forjar, por quem conseguisse gravar direto nessas colunas do banco. Agora ela recusa tudo o que
não tenha o formato que a própria instalação grava, e um segredo recusado aparece como
indisponível, como já acontecia com um segredo que não decifrava.

Os segredos que você já cadastrou continuam funcionando, e não há nada a fazer ao atualizar.
