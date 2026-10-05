---
impacto: capacidade_nova
secao: adicionado
titulo: Criar modelos da API Oficial no ZapSales, com preview, e acompanhar a aprovação sozinho
---

Em **Conexões › Canal oficial › Templates da Meta** há um botão novo, **Novo modelo**. Nele você
escreve o texto com variáveis numeradas (`{{1}}`) ou com nome (`{{nome}}`), preenche um exemplo
para cada variável, acrescenta rodapé e botões de resposta rápida, de link e de copiar código, e
vê ao lado como o cliente vai receber. **Enviar para aprovação** manda o modelo para a Meta sem
passar pelo WhatsApp Manager. O que a Meta recusaria por regra conhecida, como uma variável sem
exemplo ou uma variável no começo do texto, aparece no próprio campo antes do envio.

A situação do modelo se atualiza sozinha pelo webhook da Meta: aprovado, recusado, pausado e
desativado, além da qualidade e da categoria. Quando a Meta recusa, pausa ou desativa um modelo,
deixa a qualidade dele vermelha ou muda a categoria dele, um aviso abre na Central. A mudança de
categoria muda o custo: um modelo de utilidade que passa a marketing custa como marketing a cada
envio. Cada mudança gera um aviso só, mesmo quando a Meta reentrega o evento.

Para receber a qualidade e a categoria, assine também os campos
`message_template_quality_update` e `template_category_update` no webhook do app da Meta. A tela
de conexão lista os campos a assinar. Sem eles, o status continua chegando pelo webhook, e a
qualidade e a categoria chegam só ao clicar em **Sincronizar com a Meta**.

A lista de modelos passa a mostrar também a qualidade de cada um. Os modelos com variáveis com
nome, que antes saíam sem o nome de cada parâmetro e eram recusados pela Meta, passam a ser
enviados corretamente.
