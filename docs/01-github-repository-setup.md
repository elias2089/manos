# Configuración de seguridad del repositorio en GitHub

Guía para repetir en cualquier proyecto nuevo. Cada paso explica qué hacer, por qué, qué se gana y cómo comprobar que quedó bien.

- Comandos de ejemplo: sustituye `OWNER/REPO` por tu usuario y repositorio (aquí, `elias2089/manos`).
- Requisitos: `gh` (GitHub CLI) instalado y autenticado con `gh auth login` (protocolo SSH).
- Orden recomendado: del 1 al 6. El primero condiciona qué es posible en los demás.

## Resumen

| # | Paso | Dónde | Necesario antes de escribir código |
|---|---|---|---|
| 1 | Decidir la visibilidad del repositorio | Settings → General | Sí |
| 2 | Primer cambio por Pull Request | Terminal y GitHub | Sí |
| 3 | Activar escaneo de secretos y Dependabot | Settings → Code security | Sí |
| 4 | Limitar la forma de fusionar PRs | Settings → General | Sí |
| 5 | Proteger la rama `main` con un ruleset | Settings → Rules | Sí |
| 6 | Revisar la seguridad de la cuenta | Settings de tu cuenta | Sí |

## 1. Decidir la visibilidad del repositorio

**Qué hacer.** Elegir entre repositorio privado o público. La protección de ramas y el escaneo de secretos no están disponibles en repositorios privados con cuenta gratuita.

| Opción | Costo | Efecto |
|---|---|---|
| Privado y gratuito | $0 | Sin protección de ramas; dependes de tu disciplina |
| Privado con GitHub Pro | De pago | Protección de ramas en repos privados |
| Público | $0 | Protección de ramas y escaneo de secretos gratis |

**Por qué.** Las protecciones de los pasos siguientes dependen de esta decisión. Averiguarlo al final obliga a rehacer el trabajo.

**Beneficio.** En un proyecto de portafolio, un repositorio público con PRs, CI y commits limpios es la mejor demostración de tu forma de trabajar.

**Riesgo a tener presente.** Todo lo que se suba queda visible y copiable. Hazlo público cuando el historial aún esté limpio, y no antes de revisar que no haya secretos.

**Cómo comprobar.**
```bash
gh api repos/OWNER/REPO --jq '{visibility, permissions}'
gh api repos/OWNER/REPO/branches/main/protection 2>&1 | head -2
```
Si la segunda llamada responde `Upgrade to GitHub Pro or make this repository public`, la protección no está disponible en tu plan. `Branch not protected` significa que está disponible pero sin configurar.

## 2. Primer cambio por Pull Request

**Qué hacer.** Hacer el primer cambio real con el flujo completo: rama, commit, push, PR y squash merge.

```bash
git switch -c docs/nombre-del-cambio
git add archivo.md                     # nunca "git add ."
git commit -m "docs: describe el cambio"
git push -u origin docs/nombre-del-cambio
gh pr create --base main --title "docs: describe el cambio" --body "..."
```

Después de fusionar:
```bash
git switch main
git pull
git branch -d docs/nombre-del-cambio    # con squash puede pedir -D
```

**Por qué.** Se practica el flujo con un cambio de bajo riesgo, y se hace antes de activar la protección de `main`, que dejará de permitir el push directo.

**Beneficio.** Un historial de `main` con un commit limpio por PR, y el hábito de revisar tu propio cambio antes de fusionarlo.

**Convenciones.**
- Mensajes con Conventional Commits (explicados en detalle más abajo): `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- Un cambio lógico por commit, con sus pruebas y documentación.
- Prefijo de la rama según el tipo de cambio (`docs/`, `feat/`, `fix/`, `chore/`).
- `git add` con nombres de archivo, para no subir algo por accidente.

### Conventional Commits, explicado

**Qué es.** Una convención para escribir el título de cada commit con una estructura fija, de modo que un humano o una herramienta sepan **qué tipo de cambio** es sin abrir el código. Desde el PR C ([04](04-code-quality.md)), `commitlint` la comprueba en cada commit y rechaza los mensajes que no la cumplen.

**Estructura.**
```
tipo(ámbito opcional)!: descripción corta

Cuerpo opcional: el porqué del cambio, en párrafos cortos.

Pie opcional: BREAKING CHANGE: ...
```

| Parte | Obligatoria | Significado |
|---|---|---|
| `tipo` | Sí | La clase de cambio (tabla de abajo). Siempre en minúsculas |
| `(ámbito)` | No | La zona afectada, entre paréntesis: `feat(auth):`, `chore(deps):` |
| `!` | No | Marca un **cambio incompatible** (que rompe lo que ya funcionaba): `feat!:` |
| `:` y un espacio | Sí | Separador. Sin el espacio, el mensaje es inválido |
| `descripción` | Sí | Qué hace el commit, en imperativo y en inglés (`add login`, no `added login`) |
| cuerpo | No | Explica el **porqué**. Cada línea, máximo 100 caracteres |
| pie | No | Metadatos, como `BREAKING CHANGE:` o referencias a issues |

**Los 11 tipos que acepta nuestra configuración.** Se comprobó con `commitlint`: cualquier otro (por ejemplo `update:`) se rechaza con `type-enum`.

| Tipo | Úsalo cuando... | Ejemplo | ¿Cambia el comportamiento del producto? |
|---|---|---|---|
| `feat` | Añades una **funcionalidad nueva** para el usuario | `feat(auth): add login with email` | Sí |
| `fix` | **Corriges un error** | `fix: reject expired refresh tokens` | Sí |
| `docs` | Cambias **solo documentación** (README, `docs/`, comentarios) | `docs: add GitHub repository setup guide` | No |
| `style` | Cambias el **formato** sin tocar la lógica (espacios, comas, saltos de línea) | `style: apply prettier to the api package` | No |
| `refactor` | **Reorganizas código** sin cambiar lo que hace ni arreglar un error | `refactor: extract price calculation to a function` | No |
| `perf` | Haces que algo sea **más rápido o consuma menos** | `perf: cache the provider search` | No (mejora la velocidad) |
| `test` | **Añades o corriges pruebas** | `test: cover the 24-hour WhatsApp window rule` | No |
| `build` | Cambias el **sistema de compilación o las dependencias** | `build: bump turbo to 2.11.7` | No |
| `ci` | Cambias la **integración continua** (workflows, scripts de CI) | `ci: add GitHub Actions workflow and gitleaks scanning` | No |
| `chore` | **Mantenimiento** que no encaja en los demás: configuración, herramientas, limpieza | `chore: add PostgreSQL and Redis local services` | No |
| `revert` | **Deshaces** un commit anterior | `revert: undo the login change` | Depende del commit deshecho |

**Cómo elegir entre los más confundibles.**
- **`feat` o `fix`:** ¿el usuario puede hacer algo que antes no podía? Es `feat`. ¿Algo que debía funcionar no funcionaba? Es `fix`.
- **`refactor` o `style`:** `style` solo cambia el **aspecto** del código (formato); `refactor` cambia su **estructura**.
- **`chore`, `build` o `ci`:** si es compilación o dependencias, `build`; si es el CI, `ci`; si es otra tarea de mantenimiento del proyecto, `chore`. En duda, `chore`.
- **`docs`:** si además cambias código, usa el tipo del código y no `docs`. Un commit con **un solo propósito** lleva un solo tipo.

**Ámbito (`scope`).** Es opcional y sirve para decir **dónde**: `feat(auth)`, `fix(bot)`, `chore(deps)`. En este proyecto lo usará Dependabot (`chore(deps): ...`). Sin ámbito, el mensaje sigue siendo válido.

**Cambios incompatibles (`!` y `BREAKING CHANGE`).** Si un cambio obliga a quien usa el código a adaptarse, se marca con `!` después del tipo (`feat!: drop the v1 API`) o con un pie `BREAKING CHANGE: ...`. En versionado semántico (`mayor.menor.parche`), `feat` sube la versión **menor**, `fix` sube el **parche** y un cambio incompatible sube la **mayor**. Esa relación es parte del estándar; nosotros aún no generamos versiones automáticas.

**Reglas que comprueba `commitlint` (verificadas).**

| Mensaje | Resultado | Motivo |
|---|---|---|
| `feat: add login` | Válido | |
| `feat(auth): add login` | Válido | Con ámbito |
| `feat!: drop old api` | Válido | Cambio incompatible |
| `feat: Add login` | **Rechazado** | `subject-case`: la descripción no puede empezar con mayúscula |
| `feat: add login.` | **Rechazado** | `subject-full-stop`: no se termina con punto |
| `FEAT: add login` | **Rechazado** | `type-case`: el tipo va en minúsculas |
| `feat:add login` | **Rechazado** | Falta el espacio después de `:`, y no se reconoce la descripción |
| `update: stuff` | **Rechazado** | `type-enum`: `update` no es un tipo permitido |
| Título de más de 100 caracteres | **Rechazado** | `header-max-length` |
| Línea del cuerpo de más de 100 caracteres | **Rechazado** | `body-max-line-length` |

**Ejemplos reales de este repositorio**, con su tipo:

| Commit | Tipo y por qué |
|---|---|
| `docs: add project README with scope, roadmap and quality standards` | `docs`: solo documentación |
| `chore: add repo hygiene files and docs numbering` | `chore`: archivos de configuración del repositorio |
| `chore: set up pnpm workspace, Turborepo and strict TypeScript base` | `chore`: estructura de herramientas, sin comportamiento de producto |
| `chore: add ESLint, Prettier, husky and commitlint` | `chore`: herramientas de calidad |
| `ci: add GitHub Actions workflow and gitleaks scanning` | `ci`: integración continua |
| `chore: add PostgreSQL and Redis local services` | `chore`: entorno de desarrollo |

A partir de la fase 1 aparecerán `feat` y `fix`, porque habrá funcionalidades de producto.

**Por qué usarlo.**
- **Historial legible:** se entiende de un vistazo qué hizo cada commit.
- **Revisión más fácil:** el tipo anticipa qué esperar del cambio.
- **Automatización posible:** permite generar un changelog (lista de cambios por versión) y calcular versiones sin escribirlas a mano.
- **Portafolio:** un historial ordenado es lo primero que un cliente mira.

**Cómo escribir un buen mensaje.**
- Imperativo y en inglés: `add`, `fix`, `remove`, no `added` ni `adds`.
- Descripción corta (menos de 100 caracteres) que diga **qué** hace el cambio.
- Si hace falta explicar el **porqué**, va en el cuerpo. Con `git commit` se pasa un `-m` por párrafo para mantener las líneas cortas.
- **Un propósito por commit.** Si necesitas escribir "y" para describirlo, probablemente son dos commits.

**Cómo comprobar.**
```bash
gh pr view NUMERO --json state,mergedAt,mergeCommit
git log --oneline -3
```
El estado debe ser `MERGED`. El hash del commit en `main` es distinto al de tu rama, porque el squash crea un commit nuevo.

**Trampa conocida.** `git branch -d` puede decir que la rama "no está completamente fusionada" tras un squash, porque Git no reconoce el commit squash como suyo. Si el PR figura como `MERGED`, `git branch -D` es seguro.

## 3. Activar escaneo de secretos y Dependabot

**Qué hacer.** Activar cuatro funciones:

| Función | Qué hace |
|---|---|
| Dependabot alerts | Avisa de dependencias con vulnerabilidades conocidas |
| Dependabot security updates | Abre PRs automáticos para corregirlas |
| Secret scanning | Detecta claves conocidas en lo subido (Stripe, Meta, AWS...) |
| Push protection | Bloquea el push antes de que la clave llegue al repositorio |

En la web: Settings → Code security. O con `gh`:
```bash
gh api -X PUT repos/OWNER/REPO/vulnerability-alerts
gh api -X PUT repos/OWNER/REPO/automated-security-fixes
gh api -X PATCH repos/OWNER/REPO --input - <<'EOF'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
EOF
```

**Por qué.** En un repositorio público hay bots que rastrean GitHub buscando claves filtradas y las usan en minutos. Prevenir cuesta menos que rotar claves y limpiar daños.

**Beneficio.** Defensa automática contra dos riesgos de OWASP: componentes vulnerables (A06) y fallas criptográficas por secretos expuestos (A02). Push protection es la más importante, porque actúa antes de que el secreto exista en el historial.

**Cómo comprobar.**
```bash
gh api repos/OWNER/REPO --jq '.security_and_analysis'
```
Deben aparecer `enabled` en `dependabot_security_updates`, `secret_scanning` y `secret_scanning_push_protection`.

**Notas.**
- `secret_scanning_non_provider_patterns` y `secret_scanning_validity_checks` son extras opcionales. Los patrones genéricos los cubrirá `gitleaks`.
- Si una clave se filtra, se revoca y se rota de inmediato. Borrarla del historial no basta, porque ya pudo copiarse.

## 4. Limitar la forma de fusionar PRs

**Qué hacer.** Dejar solo squash merge y borrar la rama al fusionar.

```bash
gh api -X PATCH repos/OWNER/REPO --input - <<'EOF'
{"allow_squash_merge":true,"allow_merge_commit":false,"allow_rebase_merge":false,"delete_branch_on_merge":true}
EOF
```
En la web: Settings → General → Pull Requests.

**Por qué.** Con una sola forma de fusionar, el historial no depende de que recuerdes elegir la correcta.

**Beneficio.** Un commit por PR en `main`, fácil de leer y de revertir, y sin ramas muertas acumuladas.

**Cómo comprobar.**
```bash
gh api repos/OWNER/REPO --jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge, delete_branch_on_merge}'
```

## 5. Proteger la rama `main` con un ruleset

**Qué hacer.** Settings → Rules → Rulesets → New ruleset → New branch ruleset.

| Campo | Valor |
|---|---|
| Name | `protect-main` |
| Enforcement status | **Active** |
| Target branches | **Include default branch** (solo esa) |
| Restrict deletions | Activado |
| Require a pull request before merging | Activado, con 0 aprobaciones requeridas |
| Block force pushes | Activado |
| Bypass list | Vacía |

Los checks de CI obligatorios se añaden más tarde, cuando existan. Si se exigen antes, ningún PR podrá fusionarse.

**Por qué.** Impide que un error, un secreto o un cambio sin revisar entre directamente a `main`.

**Beneficio.** `main` queda siempre en un estado revisado, y practicas el mismo flujo que un equipo real. Con 0 aprobaciones, trabajando solo puedes fusionar tus propios PRs, pero el PR sigue siendo obligatorio.

**Cómo comprobar.** Con la configuración:
```bash
gh api repos/OWNER/REPO/rulesets --jq '.[] | {id, name, enforcement}'
gh api repos/OWNER/REPO/rulesets/ID --jq '{enforcement, include: .conditions.ref_name.include, rules: [.rules[].type]}'
```
Debe mostrar `active`, `include: ["~DEFAULT_BRANCH"]` y las reglas `deletion`, `non_fast_forward` y `pull_request`.

Y con una prueba real, que es la única comprobación definitiva:
```bash
git switch main
git commit --allow-empty -m "test: protected push"
git push                                # debe ser rechazado
git reset --hard origin/main            # descarta el commit de prueba local
```

**Trampas conocidas.**
- Un ruleset nuevo se crea con `Enforcement status: Disabled` y no protege nada hasta que se cambia a **Active**. Una configuración correcta pero inactiva engaña, por eso la prueba real importa.
- El target puede quedar en `~ALL` (todas las ramas), lo que también bloquea el push a tus ramas de trabajo. Debe ser solo `~DEFAULT_BRANCH`.
- Si el ruleset estaba inactivo y se probó con un push, ese commit llega a `origin/main`. Quitarlo exige force-push, destructivo sobre historial público. Si es un commit vacío, es mejor dejarlo.

## 6. Revisar la seguridad de la cuenta

**Qué hacer.** Esto se hace en la web, en los ajustes de tu cuenta, no del repositorio:
- Activar la autenticación en dos pasos (2FA).
- Revisar las claves SSH registradas (Settings → SSH and GPG keys) y borrar las que no reconozcas o no uses.

**Por qué.** Las protecciones del repositorio no sirven si alguien toma tu cuenta.

**Beneficio.** Reduce el riesgo de acceso no autorizado, que es la causa de brechas más habitual.

**Cómo comprobar.** Verifica a mano en Settings → Password and authentication que el 2FA aparezca activado. La API de `gh` no expone este dato de forma fiable.

## Lista de comprobación final

- [ ] Visibilidad decidida y coherente con el plan
- [ ] Primer PR fusionado con squash
- [ ] Dependabot alerts y security updates activos
- [ ] Secret scanning y push protection activos
- [ ] Solo squash merge, con borrado de ramas
- [ ] Ruleset `protect-main` activo, apuntando solo a la rama por defecto
- [ ] Push directo a `main` probado y rechazado
- [ ] 2FA activado y claves SSH revisadas
