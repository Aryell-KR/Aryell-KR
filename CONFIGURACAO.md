# Configurar a cobrinha

## Escolher mês ou ano pelo GitHub

1. Abra a aba **Actions** do repositório.
2. Selecione **Atualizar imagens do perfil**.
3. Clique em **Run workflow**.
4. Em **Período da cobrinha**, escolha `month` para o mês atual ou `year` para o ano atual.
5. Confirme em **Run workflow** e aguarde a execução terminar.

A execução salva a escolha em `profile.config.json`. A atualização automática, de hora em hora, continua usando esse período. A opção `configured` mantém a escolha já salva.

O bloco entre `<!-- snake:start -->` e `<!-- snake:end -->` no README é atualizado pela automação para apontar para o período escolhido. O restante do README permanece editável normalmente.

## Escolher pelo arquivo

Edite `profile.config.json`:

```json
{
  "snakePeriod": "month",
  "snakeMaxSegments": 18
}
```

- `month`: contribuições do dia 1 até hoje, no mês atual.
- `year`: calendário completo do ano atual, com contribuições de janeiro até hoje. Os dias futuros aparecem apagados e não são consumidos.
- `snakeMaxSegments`: limite visual de tamanho da cobra, de 3 a 40 segmentos.

Ao salvar o arquivo no GitHub, a automação atualiza as imagens. O fuso usado para identificar o mês, o ano e o dia atual é `America/Fortaleza`.

## Atualização automática dos dados

O mesmo workflow atualiza as contribuições visíveis no ano, os dias ativos, a quantidade de repositórios públicos, o cartão de sequências e a cobrinha. Ele roda a cada hora, aos 17 minutos, e depois de alterações no README, no gerador ou na configuração. O GitHub pode atrasar execuções agendadas; essa atualização não é em tempo real.

Na virada do mês ou do ano, os períodos e os títulos são calculados novamente. Se o serviço do cartão de sequências estiver indisponível, a última imagem válida é mantida e o aviso aparece no log da execução.

## Crescimento e progresso

A cobra começa com 3 segmentos e ganha um segmento por contribuição consumida, até o limite configurado. Um dia com 8 contribuições acrescenta até 8 segmentos quando é alcançado.

A barra mostra o número de contribuições consumidas em relação ao total do período. Ela não conta os dias vazios. Cobra, células, contador e barra são sincronizados e reiniciam juntos no fim do ciclo. Quando o período não tem contribuições, a barra permanece vazia e a cobra mantém o tamanho inicial.

A escolha no GitHub é uma configuração do proprietário. O README não executa JavaScript nem oferece um seletor que mude a imagem para cada visitante.

## Gerar no computador

Com Node.js 22 ou superior instalado, execute na pasta do projeto:

```powershell
node --test scripts/contribution-snake.test.mjs
node scripts/update-profile.mjs
```

As imagens usam o calendário público de contribuições do GitHub. Informações privadas que não aparecem publicamente não entram na contagem.

## Tema claro e escuro

O README usa os marcadores de tema do GitHub (`#gh-light-mode-only` e `#gh-dark-mode-only`) para exibir uma única versão de cada imagem conforme o tema da página. Banners, boas-vindas animadas, GameMaker, estatísticas, sequências e cobrinha têm cores próprias para cada tema. O texto normal acompanha o estilo nativo do GitHub. O botão do Instagram mantém o roxo com texto branco, legível nos dois modos.

A atualização automática gera os cartões claros e escuros juntos, preservando o período e o limite de crescimento da cobrinha definidos em `profile.config.json`.
