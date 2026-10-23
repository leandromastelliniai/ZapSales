---
impacto: nada_mudou
secao: corrigido
titulo: Correção de segurança do Next.js (16.4.0 → 16.4.3)
---

O sistema passou a usar o **Next.js 16.4.3**, que fecha três falhas publicadas para as versões 16.0 a 16.4.0: duas **críticas**, que permitiam executar código no servidor sem login (pela otimização de imagens com SVG e por funções `use cache`), e uma de **travamento** por meio das ações de servidor. Basta atualizar como sempre; nada muda na tela nem na configuração.
