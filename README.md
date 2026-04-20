# Amortiza

Controle pessoal de amortizações de financiamento imobiliário (Tabela Price, amortização com redução de prazo).

Substitui a velha planilha por um painel estático e rápido, publicável gratuitamente no GitHub Pages.

---

## O que o sistema faz

- **Registra** o saldo devedor e o prazo restante a cada mês.
- **Simula** múltiplos cenários de amortização por mês (`valor a amortizar` + `novo prazo` que você pega do simulador da Caixa).
- **Marca** qual cenário foi efetivamente executado — só esses entram na economia acumulada.
- **Calcula** economia bruta e líquida:
  - `economia bruta   = (prazo − novo prazo) × parcela`
  - `economia líquida = economia bruta − valor amortizado`
- **Exibe** gráfico comparando a trajetória real da dívida com a projeção sem amortizações.
- **Persiste** tudo no `localStorage` do navegador. Use `Exportar JSON` / `Importar JSON` para versionar o histórico no próprio repositório (commitando o arquivo no Git).

---

## Como publicar no GitHub Pages

1. Crie um repositório novo no GitHub (público ou privado — o Pages funciona em ambos se você tiver plano gratuito ou pago).
2. Suba os arquivos deste diretório para a raiz do repositório:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `dados-exemplo.json` *(opcional — serve de ponto de partida)*
   - `README.md`
3. No repositório, vá em **Settings → Pages**.
4. Em **Source**, selecione a branch `main` (ou `master`) e a pasta `/ (root)`.
5. Salve. Em 1–2 minutos o site estará em `https://<seu-usuario>.github.io/<nome-do-repo>/`.

> Se preferir um subdomínio próprio, basta configurar o CNAME pelo painel do GitHub Pages — o sistema é 100% estático e não precisa de build.

---

## Fluxo de uso recomendado

1. **Primeira vez**: abra o painel, clique em `⚙ Configurar` e confirme o valor da parcela (R$ 2.820).
2. **Para carregar seu histórico atual**: clique em `↑ Importar JSON` e selecione `dados-exemplo.json`. Seus 4 meses (dez/25 a abr/26) já vêm pré-carregados.
3. **Todo mês**:
   - Abra o app → `Novo registro mensal` → preencha o mês, saldo devedor e prazo restante.
   - Em `Simulações do mês`, adicione um ou mais cenários (ex.: "e se eu amortizar R$ 3.000? R$ 5.000? R$ 10.000?").
   - Quando decidir o que vai amortizar de fato, clique na estrela ★ ao lado do cenário escolhido para marcá-lo como **executado**.
4. **Backup**: periodicamente clique em `↓ Exportar JSON`, mova o arquivo para `dados-exemplo.json` no repositório e faça commit. Seu histórico fica versionado.

---

## Modelo de dados (`dados-exemplo.json`)

```jsonc
{
  "settings": {
    "parcela": 2820,          // valor da parcela mensal em R$
    "saldoOriginal": 1177390, // opcional — início do financiamento
    "prazoOriginal": 419      // opcional
  },
  "registros": [
    {
      "id": "2025-12",        // YYYY-MM, é a chave única do mês
      "mes": "2025-12",
      "saldo": 1177390,       // saldo devedor no início do mês
      "prazo": 419,           // meses restantes
      "simulacoes": [
        {
          "id": "uuid",
          "valor": 10000,     // valor que você amortizaria
          "novoPrazo": 340,   // novo prazo (tirado do simulador da Caixa)
          "executada": false  // true = foi efetivamente feita
        }
      ]
    }
  ]
}
```

---

## Observação sobre a economia

A planilha original calculava apenas a **economia bruta** (soma das parcelas que você deixa de pagar). O painel mostra também a **economia líquida**, que desconta o que você desembolsou para amortizar — essa é a sua economia real.

**Exemplo (dez/25, amortização de R$ 50.000):**

| Métrica | Valor |
|---|---|
| Meses ganhos | 213 (de 419 para 206) |
| Economia bruta | R$ 600.660 (213 × 2.820) |
| Menos o desembolso | − R$ 50.000 |
| **Economia líquida** | **R$ 550.660** |

Nota: a economia bruta reflete corretamente o que a Caixa te cobraria a menos no Price, porque cada parcela futura contém juros e principal na proporção certa para quitar a dívida — quando o prazo encurta, o que desaparece são parcelas inteiras, juros inclusos.

---

## Stack

- HTML + CSS puro, JS vanilla (zero dependências a instalar localmente).
- Fontes: Fraunces (display) + Inter (body) + JetBrains Mono (números), carregadas via Google Fonts.
- Gráficos: Chart.js 4 via CDN jsDelivr.
- Armazenamento: `localStorage` + export/import JSON manual.
