---
impacto: capacidade_nova
secao: adicionado
titulo: Instalação numa VPS limpa com um comando, HTTPS automático e guia de cada pergunta
---

Numa VPS que ainda não tem nada, um comando instala tudo:

```bash
curl -fsSL https://raw.githubusercontent.com/leandromastelliniai/ZapSales/main/kit/obter.sh | sudo bash
```

Ele baixa a última versão publicada para `/opt/zapsales` e chama o `kit/instalar.sh`, que agora
reconhece a VPS sem outros sites e entra no modo "VPS limpa": o próprio proxy do ZapSales ocupa as
portas 80 e 443 e emite o certificado HTTPS sozinho, o backup diário é agendado e o primeiro
administrador é criado. O instalador faz cinco perguntas — domínio, e-mail, nome da empresa,
idioma do sistema e senha — e o guia `docs/runbooks/instalacao-vps-limpa.md` (em inglês,
`installing-on-a-clean-vps.md`) explica cada uma em linguagem simples.

Quem já instalou no modo "convivendo com outros apps" não precisa fazer nada: o kit grava o modo
no `.env` e nunca troca de modo sozinho.
