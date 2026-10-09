# Manos

Local services marketplace for Mexico (plumbers, electricians, cleaning, and similar trades) with an autonomous WhatsApp support bot, human handoff, provider memberships, payments, and CFDI invoicing.

> **Status:** planning complete, implementation starts at Phase 0. This README is the living source of truth for scope, decisions, and quality standards. It is updated at the end of every phase.

## Table of contents

1. [Purpose](#purpose)
2. [Product overview](#product-overview)
3. [Feature map](#feature-map)
4. [Mexico-specific decisions](#mexico-specific-decisions)
5. [Architecture and stack](#architecture-and-stack)
6. [Roadmap](#roadmap)
7. [Security (OWASP)](#security-owasp)
8. [Performance (Lighthouse)](#performance-lighthouse)
9. [Accessibility (WCAG 2.2 AA)](#accessibility-wcag-22-aa)
10. [Secrets management](#secrets-management)
11. [Git workflow and commits](#git-workflow-and-commits)
12. [Working method](#working-method)
13. [Behavior specs (Gherkin)](#behavior-specs-gherkin)
14. [Local setup](#local-setup)

## Purpose

A portfolio project built to learn and demonstrate the skills freelance clients ask for most: WhatsApp support automation, recurring payments, secure APIs, measurable performance, and accessibility. Every architectural decision is recorded with its reasoning so it can be explained in an interview.

## Product overview

A customer in Mexico needs a service. They write on WhatsApp or use the web. The bot asks what the problem is, the zone, and the urgency, then connects them with a verified provider. If the customer asks for a person, a human agent takes over. Providers pay a membership for visibility and a number of leads.

**Roles**

| Role | Responsibility |
|---|---|
| Customer | Searches, requests services, contacts providers |
| Provider | Has a profile, a package, and receives leads |
| Agent | Handles the human inbox after a bot handoff |
| Admin | Verifies providers and manages the platform |

## Feature map

| Capability | Where it lives |
|---|---|
| Marketplace (catalog, search, reviews) | Provider and service catalog, search by zone and category |
| Authentication, authorization, user management, profiles | Role-based access: customer, provider, agent, admin |
| Memberships, packages, subscriptions | Paid provider plans (visibility, lead limits, bot access) |
| Invoicing and payment gateway | Recurring billing and CFDI invoices |
| Direct WhatsApp contact with a provider | "Contact" button that opens a chat with context |
| Support bot | 24/7 answers, catalog lookup, lead qualification |
| Scheduled messages and auto-replies | Reminders, follow-ups, campaigns (approved templates) |
| Contacts and integrations | Mini CRM, outbound webhooks, export |
| Human handoff | Shared real-time inbox |
| Language switch, About us, Contact, social links | Public site with i18n (es-MX default, en) |
| Mobile version | React Native app for providers and agents |

## Mexico-specific decisions

| Topic | Decision | Reason |
|---|---|---|
| Payments | Stripe Mexico (card, OXXO, SPEI); Mercado Pago as alternative | Many users pay in cash at OXXO or by bank transfer, not by card |
| Invoicing | CFDI 4.0 through a PAC (Facturama or SW Sapien) | The SAT requires stamped invoices |
| Privacy | Privacy notice under the LFPDPPP | The platform stores phone numbers and addresses |
| Language and currency | es-MX default, en secondary, prices in MXN | Target market |
| WhatsApp | Official Meta Cloud API | Unofficial libraries risk number bans and are not production-grade |

WhatsApp rule that shapes the design: Meta only allows messaging a customer first with approved templates, and free-form replies are only allowed within 24 hours of the customer's last message. Scheduled messages are built around this.

## Architecture and stack

A modular monolith in a monorepo, not microservices. For a single developer, microservices add cost without benefit. Modules stay separated so they can be extracted later.

```
manos/
├─ apps/
│  ├─ web/        Next.js (landing, marketplace, provider panel)
│  ├─ api/        NestJS (auth, users, providers, catalog, whatsapp,
│  │              bot, inbox, billing, invoicing, notifications)
│  └─ mobile/     React Native + Expo (provider and agent)
├─ packages/
│  ├─ shared/     types, Zod validations, constants
│  └─ ui/         shared accessible components
├─ infra/         Docker, Terraform, CI/CD
└─ docs/          ADRs, threat model, OWASP/WCAG checklists
```

| Layer | Technology | Why |
|---|---|---|
| Web | Next.js, TypeScript, Tailwind, `next-intl` | SSR for marketplace SEO, built-in i18n |
| API | NestJS, TypeScript | Clear module boundaries, one language across the stack |
| Database | PostgreSQL with Prisma | Relational data, type-safe queries, parameterized by default |
| Queues and cache | Redis with BullMQ | Scheduled messages, retries, caching |
| Real time | Socket.IO | Agent inbox |
| Bot | Claude API with tools plus fixed fallback replies | Qualifies leads; the backend, never the model, decides authorization |
| Payments | Stripe Mexico | Subscriptions, OXXO and SPEI support |
| Mobile | React Native with Expo | Reuses types and validations |
| Monorepo | Turborepo and pnpm | Shared code, cached builds |
| Delivery | Docker, GitHub Actions, Terraform | Reproducible builds and infrastructure |
| Observability | Sentry and structured logs | Error tracking without PII |

## Roadmap

Phases are ordered by what blocks later work and by portfolio value.

| Phase | Scope | Priority | What it teaches |
|---|---|---|---|
| 0. Foundations | Monorepo, strict TypeScript, linting, Docker Compose (Postgres, Redis), CI, Lighthouse CI, secret scanning | Critical | Monorepos, containers, CI |
| 1. Marketplace core | Data model, auth, roles, profiles, catalog, search, i18n, About and Contact pages | Critical | Database design, authN/authZ, SSR |
| 2. WhatsApp and basic bot | Webhook, auto-replies, direct-contact button, lead qualification | High | Webhooks, idempotency, HMAC signatures, LLM tools |
| 3. Inbox and human handoff | Real-time inbox, conversation states (bot, waiting for agent, human) | High | WebSockets, state machines |
| 4. Monetization | Packages, subscriptions, payment webhooks, plan limits, CFDI invoices | High | Recurring payments, reconciliation |
| 5. Automation and CRM | Scheduled templates, reminders, lead follow-up, contacts, outbound webhooks | Medium | Queues, retries, backoff |
| 6. Mobile app | Provider and agent app, push notifications | Medium | React Native |
| 7. Production and polish | IaC deployment, monitoring, backups, final OWASP/WCAG/Lighthouse audit, portfolio docs | Medium | Operations |

A demonstrable MVP exists at the end of Phase 3. The product can charge money at the end of Phase 4.

## Security (OWASP)

Guides: OWASP Top 10, ASVS as the verification checklist, and OWASP API Security Top 10 because the API is the main asset.

| Risk | Where it is applied | Why it matters here |
|---|---|---|
| A01 Broken access control | Role guards in NestJS and ownership checks on every resource | A provider must only see their own leads; changing an ID in a URL must not expose other data (IDOR) |
| A02 Cryptographic failures | argon2 password hashing, TLS only, secrets outside code, sensitive fields encrypted | Phone numbers and addresses are stored |
| A03 Injection | Parameterized Prisma queries, Zod validation, sanitized message content | WhatsApp messages are untrusted input, including prompt injection aimed at the bot |
| A04 Insecure design | Threat model in `docs/` before Phases 2 and 4 | Abuse is considered before code is written |
| A05 Security misconfiguration | Helmet headers, CSP, strict CORS, no stack traces in production | Common mistake in fast deployments |
| A06 Vulnerable components | Dependabot and `pnpm audit` in CI | Large dependency tree |
| A07 Authentication failures | Login rate limiting, short-lived tokens with rotating refresh, HttpOnly/Secure/SameSite cookies, optional 2FA for providers | Brute force and session theft |
| A08 Integrity failures | Verify HMAC signatures on Meta and Stripe webhooks; idempotency keys | Without it, payments or messages can be forged |
| A09 Logging and monitoring | Structured logs without PII, alerts, audit trail for admin actions | Detect abuse; support privacy compliance |
| A10 SSRF | Validate any URL the system fetches, such as WhatsApp media | The bot processes third-party files |

Project-specific rules: rate limit bot usage per user to control cost and abuse, and the bot never decides authorization.

## Performance (Lighthouse)

Lighthouse CI runs in GitHub Actions from Phase 0 with performance budgets that fail the build when exceeded. It is complemented by `@next/bundle-analyzer` and real-user Web Vitals in production.

Targets: LCP under 2.5 s, INP under 200 ms, CLS under 0.1, and a Lighthouse score above 90 in all four categories.

| Area | Technique |
|---|---|
| Marketplace pages | SSR/ISR, `next/image` with WebP/AVIF and explicit dimensions |
| Code | `next/dynamic` for heavy parts, `next/font` |
| Data | Postgres indexes for search, Redis cache, cursor pagination |
| Network | CDN (Cloudflare), Brotli compression |

Lighthouse only measures the web app. The API is load-tested separately (for example with k6).

## Accessibility (WCAG 2.2 AA)

Target: WCAG 2.2 level AA, verified with axe-core in CI, Lighthouse, and manual keyboard and screen reader (NVDA) testing. Automated tools catch only part of the problems.

| Area | Requirement |
|---|---|
| Whole site | Correct `<html lang>`, heading hierarchy, landmarks, skip link |
| Forms | Associated labels, `aria-invalid`, `aria-live` errors, correct `autocomplete` |
| Catalog and search | Keyboard navigation, visible focus, alt text for provider images |
| Modals and menus | Focus management on open and close, Escape to close |
| Real-time inbox | Polite `aria-live` for new messages |
| Visual design | Contrast of at least 4.5:1, touch targets of at least 24 px, `prefers-reduced-motion` |
| Language switch | Accessible selector, `lang` attribute updated |
| Mobile | React Native accessibility labels, system text scaling |

Accessibility is built into `packages/ui`: accessible base components mean everything composed from them inherits it.

## Secrets management

- Real secrets never enter git. `.env*` files are ignored; only `.env.example` with placeholder values is committed.
- Development uses test credentials only: Stripe test mode and the Meta test phone number.
- Production secrets live in the hosting platform's secret manager, not in files.
- Secret scanning in three layers: gitleaks as a pre-commit hook, gitleaks in CI, and GitHub secret scanning with push protection.
- Any leaked secret is revoked and rotated immediately; deleting it from history is not enough.
- Environment variables are validated with Zod at startup so the app fails fast when one is missing.

## Git workflow and commits

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`) enforced with commitlint and husky.
- One logical change per commit, with its tests and docs in the same commit.
- One short-lived branch per feature, opened as a pull request even when working solo, and squash-merged.
- `main` is protected: required CI checks and no direct pushes.
- Phases are tagged as releases (`v0.1.0` for Phase 0, and so on).

## Working method

For every phase:

1. Concept: what is built and why, with discarded alternatives.
2. Behavior: Gherkin scenarios for the phase (Phases 1 to 6, see below).
3. Design: structure agreed before code.
4. Small incremental steps with the reasoning for non-obvious choices.
5. Verification: tests, Lighthouse, axe, and the OWASP checklist for that phase.
6. Record: the steps and decisions taken, documented in `docs/` (written in Spanish, see [docs/README.md](docs/README.md)).

## Behavior specs (Gherkin)

Scenarios are written at the start of a phase, after the concept and before the design. They are the acceptance criteria that define when the phase is done.

| Phase | Gherkin | Reason |
|---|---|---|
| 0. Foundations | No | Infrastructure with no user behavior; validated by green CI |
| 1. Marketplace core | Yes | Registration, login, role permissions, search |
| 2. WhatsApp and basic bot | Yes | Conversation flows read best as scenarios |
| 3. Inbox and human handoff | Yes | The conversation state machine is where bugs appear |
| 4. Monetization | Yes | Sign-up, plan change, failed payment, duplicate webhook |
| 5. Automation and CRM | Partial | Business rules only, such as the 24-hour WhatsApp window |
| 6. Mobile app | Partial | Reuses scenarios from earlier phases |
| 7. Production and polish | No | Operations and audit |

Conventions:

- Files live in `docs/features/`, one `.feature` file per capability.
- They are written in Spanish (`# language: es`) because they are internal working material and are not shared with clients. Everything else in the repository stays in English.
- Technical values such as state names, fields, and routes keep their real code names, quoted inside the Spanish text, so scenarios stay linked to the tests.
- Use Gherkin only for business behavior a non-technical person could read. Field-level validation belongs in unit tests.
- Scenarios are executed in CI with a BDD runner (Cucumber or `playwright-bdd`, chosen in Phase 1), so they are verified, not only documented.

## Local setup

Prerequisites: Node 24, pnpm 9.15, Docker 28, Git 2.43. Setup instructions will be added in Phase 0, when the monorepo and Docker Compose services exist.
