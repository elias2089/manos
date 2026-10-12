# Documentación técnica

Guías y procedimientos que no caben en el README principal. Están en español porque son material de trabajo personal. El resto del repositorio está en inglés.

## Índice

Los documentos llevan un prefijo numérico: el orden es el de ejecución. Para repetir el proyecto desde cero, léelos y aplícalos en ese orden.

| Documento | Contenido |
|---|---|
| [01-github-repository-setup.md](01-github-repository-setup.md) | Seguridad y flujo de trabajo del repositorio en GitHub: visibilidad, PRs, escaneo de secretos, Dependabot, ruleset de `main` |
| [02-repo-hygiene.md](02-repo-hygiene.md) | `.gitignore`, `.env.example`, `.editorconfig`, `.gitattributes` y `.nvmrc`: qué ignorar, cómo tratar secretos y cómo fijar formato y versión de Node |
| [03-monorepo-setup.md](03-monorepo-setup.md) | Monorepo con pnpm y Turborepo: workspaces, lockfile, tareas con caché y TypeScript estricto |
| [04-code-quality.md](04-code-quality.md) | ESLint, Prettier, husky, lint-staged y commitlint: qué es cada herramienta, para qué sirve y cómo se comprueba |
| [05-ci-and-secrets.md](05-ci-and-secrets.md) | GitHub Actions, gitleaks por Docker y Dependabot: CI seguro, escaneo de secretos y checks obligatorios |
| [06-local-services.md](06-local-services.md) | PostgreSQL 17 y Redis 8 con Docker Compose: configuración línea por línea, seguridad, verificación y trampas |
| [07-behavior-specs-phase-1.md](07-behavior-specs-phase-1.md) | Gherkin: teoría, convenciones, los 119 escenarios de la fase 1 (en [features/](features/)) y la tabla de supuestos que hay que aprobar |
| [08-phase-1-technical-decisions.md](08-phase-1-technical-decisions.md) | Herramientas de la fase 1 (NestJS, Prisma, Zod, argon2, Mailpit, pino, Vitest, Cucumber...): qué es cada una, para qué se usa, su objetivo, un fragmento de código y qué queda sin verificar |
| [09-phase-1-data-and-auth-design.md](09-phase-1-data-and-auth-design.md) | Diseño de la fase 1: modelo de datos con diagrama y tablas de ejemplo, tokens y sesiones, claves de Redis, CSRF, fechas en UTC y orden de los PRs |

## Cómo se mantiene

- Cada paso o decisión técnica se documenta en el mismo commit que lo implementa.
- Un documento por PR, numerado con el siguiente número libre.
- Cada documento sigue la misma estructura: objetivo, glosario, teoría, qué se hizo, alternativas descartadas, cómo verificar, trampas conocidas y cómo repetirlo.
