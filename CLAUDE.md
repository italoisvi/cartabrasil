# Carta Brasil — Arquitetura

> Guiado por **Arquitetura Limpa** (Robert C. Martin) e **Implementing DDD** (Vaughn Vernon).
> "As dependências de código-fonte apontam apenas para dentro, na direção das políticas de nível mais alto."

---

## Visão Geral

**Carta Brasil** é uma plataforma de newsletter automatizada que coleta notícias de fontes RSS, curadoria o conteúdo por categorias e distribui edições personalizadas para assinantes via email.

**Stack tecnológico:**
- **Backend**: Supabase (PostgreSQL, Edge Functions em Deno/TypeScript, Storage, pg_cron)
- **Frontend**: HTML/CSS/JS vanilla (sem framework — a web é um detalhe)
- **Email**: Resend API
- **Fontes**: RSS da Agência Brasil

---

## Linguagem Ubíqua

Estes termos devem aparecer literalmente no código, nos nomes de funções, variáveis e tabelas:

| Termo | Significado |
|-------|-------------|
| **Artigo** | Notícia individual coletada de uma fonte RSS |
| **Assinante** | Pessoa cadastrada que recebe a newsletter |
| **Edição** | Conjunto curado de artigos enviado numa newsletter |
| **Categoria** | Classificação temática: `politica`, `mercados`, `internacional`, `tecnologia`, `geral` |
| **Frequência** | Cadência de recebimento: `realtime`, `daily`, `weekly` |
| **Fonte** | Feed RSS de onde os artigos são coletados |
| **Curadoria** | Processo de selecionar e filtrar artigos relevantes para cada assinante |
| **Distribuição** | Processo de montar e enviar a newsletter por email |
| **Preferências** | Categorias e frequência escolhidas pelo assinante |

---

## Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CARTA DE NOTÍCIA                            │
│                                                                     │
│  ┌──────────────┐   ArtigoColetado   ┌──────────────────────┐      │
│  │   COLETA DE  │ ──────────────────▶│    CURADORIA DE      │      │
│  │    FONTES    │   (Domain Event)   │     CONTEÚDO         │      │
│  │ (Supporting) │                    │   (Core Domain)      │      │
│  └──────────────┘                    └──────────┬───────────┘      │
│                                                 │                   │
│                                      EdiçãoPublicada               │
│                                        (Domain Event)              │
│                                                 │                   │
│  ┌──────────────┐                    ┌──────────▼───────────┐      │
│  │  GESTÃO DE   │   Preferências     │   DISTRIBUIÇÃO       │      │
│  │ ASSINANTES   │◀──────────────────▶│    DE EDIÇÕES        │      │
│  │  (Generic)   │                    │   (Supporting)       │      │
│  └──────────────┘                    └──────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1. Coleta de Fontes (Supporting Subdomain)
- **Responsabilidade**: Buscar artigos de feeds RSS, processar conteúdo e imagens, armazenar no banco
- **Aggregate Root**: `FonteDeNoticias` (URL, nome, categoria, última coleta)
- **Domain Event produzido**: `ArtigoColetado`
- **Edge Function**: `fetch-rss`

### 2. Curadoria de Conteúdo (Core Domain)
- **Responsabilidade**: Filtrar, organizar e preparar artigos para newsletters. Este é o diferencial.
- **Aggregate Root**: `Artigo` (título, descrição, corpo, categoria, fonte, dataPublicação)
- **Value Objects**: `Categoria`, `FonteOriginal`, `ConteúdoFormatado`
- **Domain Event produzido**: `EdiçãoPublicada`

### 3. Distribuição de Edições (Supporting Subdomain)
- **Responsabilidade**: Montar emails personalizados e enviar via Resend
- **Aggregate Root**: `Edição` (frequência, artigos selecionados, data de envio)
- **Consome**: `EdiçãoPublicada` + preferências dos assinantes
- **Edge Function**: `send-newsletter`

### 4. Gestão de Assinantes (Generic Subdomain)
- **Responsabilidade**: Cadastro, preferências, ativação/desativação
- **Aggregate Root**: `Assinante` (email, categorias, frequência, ativo)
- **Value Objects**: `Preferências` (categorias[] + frequência), `Email`

---

## Arquitetura Limpa — Regra da Dependência

```
    ┌─────────────────────────────────────────────────┐
    │            FRAMEWORKS & DRIVERS                  │
    │  Supabase · Resend · RSS HTTP · HTML/JS · Deno  │
    │  ┌─────────────────────────────────────────────┐ │
    │  │         ADAPTADORES DE INTERFACE            │ │
    │  │   Controllers · Presenters · Gateways       │ │
    │  │  ┌─────────────────────────────────────────┐│ │
    │  │  │          CASOS DE USO                   ││ │
    │  │  │  ColetarArtigos · EnviarNewsletter     ││ │
    │  │  │  CadastrarAssinante · CurarEdição      ││ │
    │  │  │  ┌─────────────────────────────────┐   ││ │
    │  │  │  │         ENTIDADES               │   ││ │
    │  │  │  │  Artigo · Assinante · Edição    │   ││ │
    │  │  │  │  Categoria · Preferências       │   ││ │
    │  │  │  └─────────────────────────────────┘   ││ │
    │  │  └─────────────────────────────────────────┘│ │
    │  └─────────────────────────────────────────────┘ │
    └─────────────────────────────────────────────────┘

    → Dependências apontam SEMPRE para dentro
    → Entidades não conhecem Supabase, Resend, HTTP
    → Casos de Uso não conhecem HTML, Deno.serve, fetch()
```

### Camada 1 — Entidades (Centro)
Regras de negócio puras. Não importam, não referenciam nada externo.

```
Artigo: { id, titulo, descricao, corpo, categoria, fonteOriginal, dataPublicacao }
Assinante: { id, email, preferencias, ativo, criadoEm }
Edicao: { frequencia, artigos[], dataMontagem }
Categoria: "politica" | "mercados" | "internacional" | "tecnologia" | "geral"
Preferencias: { categorias: Categoria[], frequencia: Frequencia }
```

### Camada 2 — Casos de Uso
Orquestram o fluxo de dados entre Entidades. Definem interfaces (portas) para o mundo externo.

| Caso de Uso | Entrada | Saída | Portas Requeridas |
|-------------|---------|-------|-------------------|
| `ColetarArtigos` | feedUrl, categoria | artigos inseridos | `ArticleRepository`, `RSSFetcher`, `ImageStorage` |
| `CurarEdicao` | frequencia, desde | edição montada | `ArticleRepository`, `SubscriberRepository` |
| `EnviarNewsletter` | frequencia | enviados/falhas | `SubscriberRepository`, `ArticleRepository`, `EmailSender` |
| `CadastrarAssinante` | email, categorias, frequencia | assinante criado | `SubscriberRepository` |
| `AtualizarPreferencias` | email, categorias, frequencia | assinante atualizado | `SubscriberRepository` |

### Camada 3 — Adaptadores de Interface

**Portas de Entrada (Driving):**
- Edge Function HTTP handlers (`Deno.serve`) → traduzem HTTP request para input do caso de uso
- Frontend JS → chama Supabase client (adaptador para SubscriberRepository)

**Portas de Saída (Driven) — Interfaces definidas na camada de Casos de Uso:**
- `ArticleRepository` → implementado por Supabase (tabela `articles`)
- `SubscriberRepository` → implementado por Supabase (tabela `subscribers`)
- `RSSFetcher` → implementado por HTTP `fetch()` + parser XML
- `ImageStorage` → implementado por Supabase Storage
- `EmailSender` → implementado por Resend API

### Camada 4 — Frameworks & Drivers
- **Supabase**: PostgreSQL, Auth, Storage, pg_cron
- **Deno**: Runtime das Edge Functions
- **Resend**: Serviço de envio de email
- **HTML/CSS/JS**: Frontend vanilla (a web é um detalhe)

---

## Estrutura de Diretórios (objetivo)

```
cartabrasil/
│
├── CLAUDE.md                          # Este arquivo
│
├── supabase/
│   ├── functions/
│   │   ├── fetch-rss/                 # Edge Function: Coleta de Fontes
│   │   │   └── index.ts              # Handler HTTP → ColetarArtigos
│   │   │
│   │   ├── send-newsletter/           # Edge Function: Distribuição
│   │   │   └── index.ts              # Handler HTTP → EnviarNewsletter
│   │   │
│   │   └── _shared/                   # Código compartilhado entre functions
│   │       ├── domain/                # CAMADA 1 — Entidades & Value Objects
│   │       │   ├── article.ts         # Entidade Artigo
│   │       │   ├── subscriber.ts      # Entidade Assinante
│   │       │   ├── edition.ts         # Entidade Edição
│   │       │   └── values.ts          # Value Objects: Categoria, Preferências, Email
│   │       │
│   │       ├── usecases/              # CAMADA 2 — Casos de Uso
│   │       │   ├── collect-articles.ts
│   │       │   ├── curate-edition.ts
│   │       │   ├── send-newsletter.ts
│   │       │   └── ports.ts           # Interfaces: ArticleRepository, EmailSender, etc.
│   │       │
│   │       └── infra/                 # CAMADA 3+4 — Adaptadores & Drivers
│   │           ├── supabase-article-repo.ts
│   │           ├── supabase-subscriber-repo.ts
│   │           ├── resend-email-sender.ts
│   │           ├── rss-fetcher.ts
│   │           └── supabase-image-storage.ts
│   │
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_cron_fetch_rss.sql
│
├── index.html                         # Landing page
├── preferencias.html                  # Gestão de preferências
├── noticias.html                      # Listagem de notícias
├── noticia.html                       # Artigo individual
├── portal.html                        # Portal de notícias
│
├── assets/
│   ├── font/
│   ├── icons/
│   └── images/
│
└── knowledge/                         # PDFs de referência (não versionados)
    ├── Arquitetura Limpa - ...pdf
    └── Implementando domain-drive design.pdf
```

---

## Domain Events

```
ArtigoColetado {
  artigoId: UUID
  titulo: string
  categoria: Categoria
  fonteUrl: string
  coletadoEm: timestamp
}

EdicaoPublicada {
  edicaoId: UUID
  frequencia: Frequencia
  artigosIds: UUID[]
  publicadaEm: timestamp
}

NewsletterEnviada {
  assinanteEmail: string
  edicaoId: UUID
  sucesso: boolean
  enviadaEm: timestamp
}

AssinanteCadastrado {
  assinanteId: UUID
  email: string
  categorias: Categoria[]
  frequencia: Frequencia
  cadastradoEm: timestamp
}
```

---

## Regras de Negócio (Invariantes)

### Artigo
- `titulo` é obrigatório e não-vazio
- `original_url` é único (evita duplicatas)
- `categoria` deve ser um valor válido do enum Categoria
- `published_at` deve ser uma data válida
- `body` armazena texto com `<strong>` para negritos (sem marcadores customizados)

### Assinante
- `email` é único e deve ser válido
- `categories` deve conter ao menos uma categoria válida
- `frequency` deve ser `realtime`, `daily` ou `weekly`
- Assinante inativo (`active = false`) não recebe newsletters

### Edição
- Deve conter ao menos 1 artigo para ser publicada
- Artigos filtrados pelas categorias do assinante
- Janela temporal definida pela frequência:
  - `realtime`: artigos inseridos nos últimos 15 minutos (usar `created_at`, não `published_at`)
  - `daily`: últimas 24 horas
  - `weekly`: últimos 7 dias

---

## Context Map (Integrações)

```
┌──────────────┐                    ┌──────────────────┐
│  Coleta de   │  Customer-Supplier │   Curadoria de   │
│   Fontes     │───────────────────▶│    Conteúdo      │
│  (upstream)  │  ArtigoColetado    │   (downstream)   │
└──────────────┘                    └────────┬─────────┘
                                             │
                                    EdiçãoPublicada
                                             │
┌──────────────┐                    ┌────────▼─────────┐
│  Gestão de   │    Open Host       │  Distribuição    │
│ Assinantes   │◀──────────────────▶│  de Edições      │
│              │  Preferências/ACL  │                  │
└──────────────┘                    └──────────────────┘

Padrões aplicados:
- Coleta → Curadoria: Customer-Supplier (Coleta fornece, Curadoria consome)
- Curadoria → Distribuição: Domain Event (EdiçãoPublicada)
- Assinantes ↔ Distribuição: Open Host Service (query de preferências)
- Fontes RSS externas → Coleta: ACL (Anticorruption Layer — parser RSS traduz XML externo)
- Resend API → Distribuição: ACL (adaptador traduz para EmailSender interface)
```

---

## Princípios de Design (regras para o código)

### Regra da Dependência
- `domain/` **nunca** importa de `infra/`, `usecases/`, ou frameworks
- `usecases/` importa **apenas** de `domain/` e define **interfaces** (portas)
- `infra/` implementa as interfaces definidas em `usecases/`
- Edge Function handlers são **finos** — instanciam dependências e delegam para Use Cases

### SOLID aplicado
- **SRP**: Cada Edge Function = um caso de uso. Cada módulo = uma responsabilidade.
- **OCP**: Novos tipos de fonte (API, scraping) implementam `RSSFetcher` sem modificar Use Cases.
- **LSP**: Qualquer implementação de `EmailSender` (Resend, SES, SMTP) é substituível.
- **ISP**: Use Cases dependem apenas das portas que precisam (não de um "super-repositório").
- **DIP**: Use Cases dependem de interfaces (`ArticleRepository`), não de Supabase client direto.

### DDD aplicado
- **Entidades com comportamento**: Artigo sabe formatar seu corpo, Edição sabe filtrar por preferências.
- **Value Objects para 70% dos dados**: Categoria, Preferências, Email, FonteOriginal.
- **Aggregates pequenos**: Root Entity + Value Objects. Sem referências diretas entre Aggregates.
- **Consistência eventual**: Coleta e Distribuição são eventos assíncronos via pg_cron.

---

## Banco de Dados (PostgreSQL via Supabase)

### Tabela `articles`
| Coluna | Tipo | Constraint |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| title | TEXT | NOT NULL |
| description | TEXT | nullable |
| body | TEXT | nullable |
| category | TEXT | NOT NULL, CHECK (enum) |
| image_url | TEXT | nullable |
| image_caption | TEXT | nullable |
| source_name | TEXT | NOT NULL, default 'Agência Brasil' |
| source_url | TEXT | nullable |
| author | TEXT | nullable |
| original_url | TEXT | UNIQUE NOT NULL |
| published_at | TIMESTAMPTZ | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |

Índices: `idx_articles_category`, `idx_articles_published_at`

### Tabela `subscribers`
| Coluna | Tipo | Constraint |
|--------|------|------------|
| id | UUID | PK, default gen_random_uuid() |
| email | TEXT | UNIQUE NOT NULL |
| categories | TEXT[] | NOT NULL, default todas |
| frequency | TEXT | NOT NULL, CHECK (realtime/daily/weekly) |
| active | BOOLEAN | NOT NULL, default true |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |

Índice: `idx_subscribers_active`

### Storage
- Bucket `article-images` (público) — imagens dos artigos

---

## UI/UX — Design System

### Tipografia
- **Headlines**: Lora (serif), 600 weight
- **Body text**: Lora (serif), 400 weight, 1.85 line-height
- **UI elements**: DM Sans (sans-serif), 300-500 weight
- **Labels/Tags**: DM Sans, 0.65rem, uppercase, letter-spacing 0.14em

### Paleta de Cores
```
--ink:          #111111    (texto principal)
--ink-light:    #555555    (texto secundário)
--ink-muted:    #999999    (texto auxiliar)
--rule:         #e0e0e0    (bordas e separadores)
--bg:           #fafaf8    (fundo da página)
--paper:        #ffffff    (fundo de cards/artigos)
--accent:       #c0392b    (vermelho — logo e destaques)
```

### Cores por Categoria
```
politica:       #c0392b    (vermelho)
mercados:       #2c3e50    (azul-escuro)
internacional:  #d4a017    (dourado)
tecnologia:     #2980b9    (azul)
geral:          #7f8c8d    (cinza)
```

### Identidade Visual
- Logo: "Carta Brasil" + ponto vermelho (Lora serif)
- Estética editorial/jornalística: bordas finas, separadores, layout em grid
- Animações sutis: fadeUp 0.6s ease com delay escalonado
- Mobile-first responsivo com breakpoint em 600px

---

## CRON Jobs (pg_cron)

| Job | Schedule | Endpoint | Função |
|-----|----------|----------|--------|
| fetch-rss-every-15min | `*/15 * * * *` | /functions/v1/fetch-rss | Coletar artigos dos feeds |
| send-realtime-every-15min | `*/15 * * * *` | /functions/v1/send-newsletter?frequency=realtime | Alertas em tempo real |
| send-daily-7am | `0 10 * * *` | /functions/v1/send-newsletter?frequency=daily | Resumo diário (07h BRT) |
| send-weekly-monday-7am | `0 10 * * 1` | /functions/v1/send-newsletter?frequency=weekly | Resumo semanal (seg 07h BRT) |

---

## Convenções de Código

- **TypeScript** para Edge Functions (Deno runtime)
- **Vanilla JS** no frontend (sem frameworks — a web é um detalhe)
- Nomes de variáveis/funções em **camelCase** (inglês no código)
- Nomes de domínio seguem a **Linguagem Ubíqua** (português nos termos de negócio)
- Comentários apenas onde a lógica não é auto-evidente
- Sem over-engineering: complexidade mínima para a tarefa atual
