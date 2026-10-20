# Diagnóstico — Lojas Online CTT (Shopkit) vs. backoffice próprio iNurse

Levantamento feito a 20/10/2026, só de leitura, no backoffice `artur.lojasonlinectt.pt/admin` e na loja `www.inurse.pt`.
Serve de referência para decidir o que integrar na loja própria antes de desligar a loja atual.

## 0. Factos da loja atual a ter em conta
- **Plano Corporate, renova a 5 nov. 2026** (saldo de conta 14,22 €). É a data-limite natural para a mudança.
- 149 produtos no catálogo do backoffice (166 contados na conta), 330 clientes, ~204 MB de multimédia.
- **Portes (método "CTT")**: Continente 0–2 kg 4,00 €, 2–10 kg 7,72 €; Açores e Madeira 0–2 kg 10,00 €; **grátis a partir de 75 €** no Continente.
  Método "PONTOS DE ENTREGA CTT" ativo (o cliente escolhe o ponto no checkout; nas encomendas aparece com custo ~4,92 €).
- **Embalagens**: Envelope 50×32×16 cm (50 g) e Caixa Socas 35×22×12 cm (100 g).
- **Expedição automática CTT Expresso**: ao pagar, cria o envio, o código DBxxxxxxxxxPT, guia e certificado; estados "Envio criado → Recolhido → Em distribuição → Entregue"; custo real por envio ~3,89–4,23 €.
- **Faturação**: InvoiceXpress — fatura emitida automaticamente quando a encomenda é paga.
- **Pagamentos usados**: MB WAY (a maioria), Multibanco, PayPal. Disponíveis na plataforma: cartão, Apple/Google Pay, Klarna, Payshop, Bizum, transferência, cobrança, levantamento.
- **Carrinhos abandonados**: 18 registados; email automático de recuperação ativo; cupão de recuperação existente **PROSAUDE**.
- **Apps ativas**: CTT Expresso, InvoiceXpress, Cálculo de portes (paga), Newsletter, Cookies bar, Botão WhatsApp, Facebook Página, Google Translate.
- **Templates de email** editáveis: encomenda, carrinho abandonado, registo, recuperação de password, pagamento falhado, confirmação de newsletter, avaliação de produtos, pontos, alerta de stock, alteração de pagamento, manutenção, 404.
- Encomenda #572586 (Patricia Alves, 20/10) ainda entrou na loja atual.

## 1. Encomendas
| Loja atual | Loja própria | Integrar? |
|---|---|---|
| Filtros: pago/não pago, lido/não lido, expedido, com devolução, faturado, com pontos, com cupão, 12 estados, forma de pagamento, método de envio, país, B2B | Separadores (Por tratar, A aguardar pagamento, Enviadas, Todas, Canceladas) + pesquisa | **Sim** — filtros combináveis |
| Exportar e importar encomendas; imprimir (encomenda / várias) | Não | **Sim** — exportar CSV/Excel e imprimir folha de preparação |
| Lista com colunas pago, fatura, expedição, devolução (ícones), formato compacto/completo | Lista com estado, pagamento, total, selo "Nova" | **Sim** — colunas de ícones |
| Detalhe: "Encomenda paga / desmarcar", "Alterar estado", passos do envio (criado/recolhido/distribuição/entregue) | Estados, envios, fatura, devoluções, margem real | Parcial — **passos do envio** |
| Histórico detalhado com "Cliente notificado por e-mail", "Fatura emitida", "Tracking adicionado" | Histórico e notas internas | **Sim** — registar emails enviados e eventos |
| Nota interna **e nota para o cliente** (enviada por email) | Só nota interna | **Sim** |
| Editar dados do cliente e moradas de envio/faturação na encomenda | Não | **Sim** |
| Tags de encomenda | Não | Talvez (baixo) |
| Lembrete de pagamento após X dias (+SMS) e cancelamento automático após X dias | Não | **Sim** |
| Estado quando paga configurável | Fixo | Não |
| Expedição automática CTT (código, guia, certificado) | Registo manual do código | **Sim, quando houver credenciais da API CTT** |

## 2. Carrinhos abandonados
| Loja atual | Loja própria | Integrar? |
|---|---|---|
| Lista (cliente, data, email enviado, recuperado, produtos, subtotal), exportar | Não existe | **Sim — prioridade alta** |
| Email automático após 1/3/6/12/24/48 h, só a quem aceitou newsletter ou a todos, com cupão opcional (PROSAUDE) | Não | **Sim** |
| Carrinho atual do cliente visível na ficha do cliente | Não | Sim (vem com o anterior) |

## 3. Produtos
| Loja atual | Loja própria | Integrar? |
|---|---|---|
| Estatísticas do produto (vendas 7/15/30 dias) na ficha | Não | **Sim** |
| Avaliação média do produto na ficha | Avaliações têm página própria | Sim (mostrar média) |
| Tags de produto e visibilidade (todos/B2B) | Etiquetas | Já existe |
| Custo por item, preço promoção, desconto %, **preço por quantidade** | Custo, preço antes, PVPR, margens | Preço por quantidade: talvez |
| Peso, portes próprios por produto, país de origem, código HS | Peso e volume | Não necessário (só Portugal) |
| SKU, código de barras, limites de quantidade, gestão de stock | Referências, EAN, stock | Limites de quantidade: talvez |
| Opções extra (personalização no carrinho) | Não | Não |
| Estados: Ativo, Escondido, Sem stock, **Brevemente**; atributos destaque/novidade/promoção | Ativo/Esgotado/Rascunho/Arquivado, destaque | "Novidade" e "Brevemente": talvez |
| **Produtos relacionados** (mesma categoria/marca/tags, inteligentes, manuais) | Não | **Sim** |
| Vídeo (YouTube/Vimeo) e ficheiros anexos (fichas técnicas) | Não | Sim (ficha técnica PDF útil nas meias) |
| Campos técnicos (ex.: CUIDADOS DE LAVAGEM) que viram filtros | Não | **Sim** |
| Pré-visualização SEO, histórico de alterações do produto | SEO sim, histórico não | Histórico: talvez |
| Exportar/importar catálogo | Importação de folhas (IA) | Exportar: **Sim** |
| Categorias e marcas com páginas próprias | Categorias | Marcas: talvez |

## 4. Clientes
| Loja atual | Loja própria | Integrar? |
|---|---|---|
| Lista com nº encomendas, total, pontos; filtros registado/não registado/banido; pesquisa por telefone/NIF | Lista com pesquisa e ordenação | **Sim** — colunas e filtros |
| Ficha: visto há X, última encomenda, estatísticas (pagas/não pagas), produtos comprados, carrinho atual, wishlist, tags, notas | Dados, encomendas, moradas, notas | **Sim** — produtos comprados, wishlist, carrinho |
| Enviar email / telefonar / banir cliente | Não | Email/telefonar: sim; banir: baixo |
| RGPD: exportar dados e eliminar dados do cliente | Não | **Sim (obrigação legal)** |
| Importar/exportar clientes | Exportar sim | Importar: para a migração |

## 5. Marketing e promoções
| Loja atual | Loja própria | Integrar? |
|---|---|---|
| Cupões (valor, tipo, condição, clientes, utilizações) | Promoções com código, mínimo, usos, datas | Já existe |
| Campanhas (descontos em vários produtos por período) | Não (há campanhas de imagens) | **Sim** — descontos por categoria/marca com datas |
| Pontos e recompensas (desligado) | Não | Mais tarde |
| Newsletter, alerta de stock (app paga), SMS | Newsletter (registo) | Alerta "avisa-me quando houver": **Sim** |
| Google Shopping/Facebook catálogo (apps pagas) | Não | Sim — feed de produtos (Google Merchant) |

## 6. Estatísticas e painel
| Loja atual | Loja própria | Integrar? |
|---|---|---|
| Painel: vendas, sessões, conversão, carrinhos abandonados (valor), produtos populares, **pesquisas populares**, origem do tráfego | Painel com encomendas, resultado do mês, propostas | **Sim** — pesquisas populares e valor em carrinhos abandonados |
| Estatísticas de encomendas (valor médio, produtos vendidos, origem das conversões) | Estatísticas de visitas e funil | **Sim** — valor médio e origem das vendas |
| Registo de atividade (últimos 50 eventos: logins, faturas, exportações) | Não | Sim — registo de atividade |

## 7. Configurações
| Loja atual | Loja própria | Integrar? |
|---|---|---|
| Registo de clientes opcional/obrigatório, campos obrigatórios, Google Login | Área de cliente por link mágico | Google Login: talvez |
| Devoluções: prazo, morada, guia de devolução pedida pelo cliente | Devoluções com prazo e recolhas | Já existe |
| Grupos de países, regras de pagamento por país | Só Portugal | Não |
| Utilizadores com cargos e 2FA | Administradores | Talvez (se houver equipa) |
| Templates de email editáveis | Textos fixos em 4 línguas | **Sim** — editar textos dos emails no backoffice |
| CSS/JS/HTML personalizados | Não | Não |

## 8. Área de cliente (www.inurse.pt)
- Entrada com email+password ("Manter-me ligado"), recuperar password, registo com opção de newsletter.
- Promete: acompanhar encomendas, lista de favoritos, moradas guardadas para checkout rápido.
- Ficha de produto: tamanhos com preço, wishlist, partilhar, marca, tags, campos técnicos (cuidados de lavagem).
- Não foi possível ver o interior da conta de cliente (precisa de uma conta de cliente com sessão iniciada).
- Na loja própria já existe: encomendas com seguimento, faturas, trocas/devoluções, moradas, favoritos, dados pessoais.
  Falta: **password opcional** (hoje é link por email), "manter-me ligado", pontos (se forem ativados).

## Prioridades recomendadas
1. **Carrinhos abandonados** com email automático e cupão (recupera vendas).
2. **Encomendas**: filtros, exportar/imprimir, nota para o cliente, editar moradas, histórico de emails, lembrete e cancelamento automático.
3. **Portes iguais aos atuais** (4,00 € / 7,72 € / ilhas 10,00 € / grátis ≥ 75 €) e embalagens — configurar já.
4. **Clientes**: colunas, produtos comprados, wishlist, RGPD (exportar/eliminar).
5. **Produtos**: relacionados, estatísticas na ficha, campos técnicos, exportar.
6. **Painel**: pesquisas populares, valor médio, origem das vendas, registo de atividade.
7. **Marketing**: campanhas de desconto por período, alerta de stock, feed Google Shopping.
8. Expedição automática CTT quando houver credenciais da API CTT.
9. Mais tarde: pontos e recompensas, preço por quantidade, B2B, Google Login.
