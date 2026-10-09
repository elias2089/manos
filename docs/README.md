# Documentación técnica

Guías y procedimientos que no caben en el README principal. Están en español porque son material de trabajo personal. El resto del repositorio está en inglés.

## Índice

Los documentos llevan un prefijo numérico: el orden es el de ejecución. Para repetir el proyecto desde cero, léelos y aplícalos en ese orden.

| Documento | Contenido |
|---|---|
| [01-github-repository-setup.md](01-github-repository-setup.md) | Seguridad y flujo de trabajo del repositorio en GitHub: visibilidad, PRs, escaneo de secretos, Dependabot, ruleset de `main` |
| [02-repo-hygiene.md](02-repo-hygiene.md) | `.gitignore`, `.env.example`, `.editorconfig`, `.gitattributes` y `.nvmrc`: qué ignorar, cómo tratar secretos y cómo fijar formato y versión de Node |

## Cómo se mantiene

- Cada paso o decisión técnica se documenta en el mismo commit que lo implementa.
- Un documento por PR, numerado con el siguiente número libre.
- Cada documento sigue la misma estructura: objetivo, glosario, teoría, qué se hizo, alternativas descartadas, cómo verificar, trampas conocidas y cómo repetirlo.
