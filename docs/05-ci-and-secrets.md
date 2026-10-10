# 05. Integración continua y escaneo de secretos

PR: `chore/ci-and-secrets`. Archivos nuevos: `.github/workflows/ci.yml`, `.github/dependabot.yml`, `scripts/gitleaks.sh`. Cambio en `.husky/pre-commit`.

## 1. Objetivo

Repetir en los servidores de GitHub las comprobaciones de calidad y de secretos, donde nadie puede saltárselas, y preparar `main` para exigirlas antes de fusionar cualquier PR. Los hooks locales (PR C) se pueden saltar con `git commit --no-verify`; el CI no.

## 2. Glosario

| Término | Significado |
|---|---|
| **CI (integración continua)** | Ejecutar comprobaciones automáticas en un servidor cada vez que alguien propone un cambio |
| **GitHub Actions** | El servicio de GitHub que ejecuta esos flujos automáticos |
| **Workflow** | Un flujo automático definido en un archivo YAML dentro de `.github/workflows/` |
| **Trigger (disparador)** | El evento que inicia un workflow: abrir un PR, hacer push, etc. |
| **Job (trabajo)** | Un grupo de pasos que se ejecuta en una máquina. Los jobs de un workflow corren en paralelo por defecto |
| **Step (paso)** | Una instrucción dentro de un job: ejecutar un comando o usar una acción |
| **Runner** | La máquina virtual que ejecuta un job. Aquí, `ubuntu-24.04` |
| **Action (acción)** | Un paso reutilizable publicado por alguien (por ejemplo `actions/checkout`) |
| **Check (comprobación)** | El resultado (verde o rojo) de un job, visible en el PR |
| **Check obligatorio (required status check)** | Un check que debe estar en verde para poder fusionar un PR |
| **SHA de commit** | El identificador único de 40 caracteres de un commit. Es inmutable |
| **Etiqueta (tag)** | Un nombre como `v7.0.1` que apunta a un commit. **Se puede mover** |
| **Digest de imagen** | El hash inmutable (`sha256:...`) de una imagen de Docker |
| **Cadena de suministro** | Todo el código de terceros del que depende tu proyecto, incluidas las herramientas de CI |
| **gitleaks** | Herramienta que busca secretos en archivos y en el historial de Git |
| **Falso positivo** | Una alerta que parece un secreto pero no lo es |
| **Dependabot** | Servicio de GitHub que abre PRs para actualizar dependencias |

## 3. Teoría

### 3.1 Cómo funciona un workflow de GitHub Actions

Un archivo `.github/workflows/ci.yml` declara **cuándo** se ejecuta (`on`), **con qué permisos** (`permissions`) y **qué trabajos** hace (`jobs`). Cada job arranca una máquina limpia, descarga tu código y ejecuta sus pasos en orden. Si un paso falla, el job se marca rojo y el resto de sus pasos no se ejecuta.

Nuestro workflow tiene dos jobs que corren en paralelo:

| Job (nombre visible) | Qué hace |
|---|---|
| **Quality** | Instala dependencias y ejecuta `format:check`, `lint:root`, `lint`, `typecheck`, `build` y `test` |
| **Secrets** | Escanea todo el historial de Git con gitleaks |

El **nombre visible** (`name: Quality`, `name: Secrets`) es el que aparece como check en el PR y el que se usa para hacerlo obligatorio. Si lo cambias, hay que actualizar la regla de `main`.

### 3.2 Disparadores

```yaml
on:
  pull_request:
  push:
    branches: [main]
```
- **`pull_request`:** cada vez que se abre o actualiza un PR. Es el que más importa: comprueba el cambio antes de fusionarlo.
- **`push` a `main`:** comprueba que lo ya fusionado sigue funcionando.

**Nunca `pull_request_target`.** Ese disparador da acceso a secretos del repositorio a código que viene de forks. Es una vulnerabilidad conocida en proyectos públicos, porque cualquiera podría abrir un PR malicioso que ejecute código con esos secretos. `pull_request` ejecuta el código del PR **sin** acceso a secretos.

### 3.3 Seguridad del workflow

| Medida | Cómo se ve | Por qué |
|---|---|---|
| **Permisos mínimos** | `permissions: contents: read` | El workflow solo puede leer el repositorio. Si una acción comprometida intenta escribir, GitHub lo rechaza (OWASP A01) |
| **Acciones fijadas por SHA** | `actions/checkout@3d3c42e... # v7.0.1` | Una etiqueta como `@v7` se puede mover para apuntar a otro código. Un SHA no. Es la defensa contra un ataque a la cadena de suministro (OWASP A08). El comentario con la versión mantiene el archivo legible |
| **`persist-credentials: false`** | En cada `checkout` | Evita que el token de GitHub quede guardado en el `.git` del runner, donde otro paso podría leerlo |
| **Imagen de gitleaks por digest** | `...gitleaks:v8.30.1@sha256:c00b...` | Mismo motivo que el SHA: un digest es inmutable |
| **`timeout-minutes: 10`** | En cada job | Un job colgado no consume minutos indefinidamente |
| **`concurrency`** | Cancela la ejecución anterior de un PR si llega otro push | Ahorra minutos y evita resultados desactualizados. No cancela las de `main` |

### 3.4 Pasos del job Quality, uno por uno

| Paso | Para qué |
|---|---|
| `actions/checkout` | Descarga el código |
| `pnpm/action-setup` | Instala pnpm. Sin indicar versión, lee la del campo `packageManager` de `package.json` (9.15.9) |
| `actions/setup-node` con `node-version-file: .nvmrc` | Instala la versión de Node de `.nvmrc`. `cache: pnpm` guarda las dependencias descargadas entre ejecuciones |
| `pnpm install --frozen-lockfile` | Instala exactamente lo que dice el lockfile. **Falla** si `package.json` y el lockfile no coinciden, en lugar de modificar el lockfile |
| `pnpm format:check` | Prettier: ¿el código tiene el formato correcto? |
| `pnpm lint:root` | ESLint sobre los archivos de la raíz |
| `pnpm lint` | `lint` de cada paquete, mediante Turborepo |
| `pnpm typecheck` | Revisión de tipos de cada paquete |
| `pnpm build` | Compilación de cada paquete |
| `pnpm test` | Pruebas de cada paquete |

Una sola fuente de verdad para las versiones: Node sale de `.nvmrc` y pnpm de `package.json`. No hay números duplicados en el workflow que puedan quedarse desactualizados.

### 3.5 Cómo funciona gitleaks

gitleaks lee archivos y mensajes de commit y busca **secretos** con dos técnicas:
1. **Patrones (expresiones regulares)** propios de cada servicio: un token de GitHub empieza por `ghp_`, una clave de AWS por `AKIA`, etc. Trae cientos de reglas.
2. **Entropía:** mide lo "aleatorio" que parece un texto. Una contraseña o clave suele ser mucho más aleatoria que una palabra normal, y eso reduce los falsos positivos.

Opciones que usamos:

| Opción | Significado |
|---|---|
| `git` | Escanea un repositorio de Git |
| `--pre-commit --staged` | Solo lo que está en staging (modo del hook) |
| `--redact` | Oculta el secreto en la salida. Importante: si el log de CI se hace público, no filtra lo que acaba de detectar |
| `--verbose` | Muestra el detalle de cada hallazgo |
| `--no-banner` | Quita el logotipo de la salida |

**Dos momentos de escaneo, con dos funciones distintas:**

| Dónde | Qué escanea | Para qué |
|---|---|---|
| **Hook `pre-commit`** (local) | Archivos en staging | Detener el secreto **antes** de que exista en el historial. Es la defensa más barata |
| **Job Secrets** (CI) | Todo el historial | Red de seguridad si el hook se saltó o no estaba instalado |

El historial completo importa: un secreto que se borró en un commit posterior **sigue estando en el commit anterior**. Por eso el job usa `fetch-depth: 0` (descarga todo el historial, no solo el último commit).

A estas dos capas se suma la **push protection de GitHub** (paso 3 de [01](01-github-repository-setup.md)), que bloquea el push de claves conocidas. Son tres capas independientes.

### 3.6 El script `scripts/gitleaks.sh` y por qué usa Docker

Ejecutamos gitleaks dentro de un contenedor Docker en lugar de instalarlo:
- **Misma versión en todas partes:** tu máquina y el CI ejecutan la misma imagen, fijada por tag y digest.
- **Nada que instalar:** ya usas Docker, y lo usarás para PostgreSQL y Redis en el PR E.
- **Una sola definición:** el hook y el CI llaman al mismo script, así que la versión se cambia en un único lugar (DRY).

Qué hace el script, en orden:
1. Comprueba que el demonio de Docker responde. Si no, **falla con un mensaje claro** (decisión nuestra: es lo más seguro en un repositorio público; el commit se detiene hasta que arranques Docker).
2. Según el argumento (`staged` o `history`), elige el modo de gitleaks.
3. Monta tu carpeta del proyecto en `/repo` dentro del contenedor y ejecuta gitleaks.

Un script de shell, y no código directo dentro del hook y del workflow, porque así se puede probar a mano (`sh scripts/gitleaks.sh history`).

### 3.7 Dependabot de versiones

`dependabot.yml` le pide a GitHub que cada semana revise dos cosas y abra PRs agrupados:

| Ecosistema | Qué actualiza |
|---|---|
| `github-actions` | Las acciones del workflow. Mantiene al día los SHA fijados |
| `npm` | Las dependencias de `package.json` (funciona con pnpm) |

- **`commit-message.prefix: chore(deps)`:** para que los PRs de Dependabot sigan Conventional Commits.
- **`groups`:** un solo PR con todas las actualizaciones, en lugar de uno por paquete. Menos ruido.
- **`ignore`:** bloquea las actualizaciones de versión **mayor** de `typescript`, `eslint` y `@eslint/js`. Sin eso, Dependabot propondría TypeScript 7 y ESLint 10, que hoy rompen la compatibilidad con `typescript-eslint` y `jsx-a11y` (ver [04](04-code-quality.md)). Cuando ese motivo desaparezca, hay que quitar esas entradas.

Esto es distinto de las **Dependabot security updates** activadas en el paso 3 de [01](01-github-repository-setup.md): aquéllas solo se disparan por vulnerabilidades; éstas son actualizaciones normales de versión.

### 3.8 Check obligatorio: por qué va en un paso aparte

Un check solo puede exigirse **después de que exista**: GitHub conoce los nombres `Quality` y `Secrets` solo cuando el workflow se ha ejecutado al menos una vez. Si exigiéramos los checks antes, el PR que los crea quedaría bloqueado esperando algo que aún no existe.

Orden correcto:
1. Fusionar el PR que crea el workflow (se ejecuta sobre el propio PR).
2. Añadir `Quality` y `Secrets` como obligatorios en el ruleset `protect-main` (ver sección 6).

## 4. Qué hicimos

| Archivo | Resultado |
|---|---|
| `.github/workflows/ci.yml` | Jobs `Quality` y `Secrets`, con las medidas de 3.3 |
| `.github/dependabot.yml` | Actualizaciones semanales de `github-actions` y `npm`, con `ignore` de versiones mayores bloqueadas |
| `scripts/gitleaks.sh` | Ejecuta gitleaks por Docker, con imagen fijada, en modo `staged` o `history` |
| `.husky/pre-commit` | Ahora ejecuta primero `sh scripts/gitleaks.sh staged` y luego `lint-staged` |

Versiones fijadas: `actions/checkout` v7.0.1, `pnpm/action-setup` v6.1.0, `actions/setup-node` v7.1.0 (todos por SHA) y `gitleaks` v8.30.1 (por digest).

## 5. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Acciones por etiqueta (`@v7`) | La etiqueta se puede mover. Un SHA es inmutable |
| `gitleaks/gitleaks-action` (la acción oficial) | Una dependencia más en la cadena de suministro. Según recuerdo, puede exigir licencia en cuentas de organización (no lo verificamos; compruébalo si la consideras). Con Docker controlamos la versión |
| Instalar el binario de gitleaks | Una instalación manual más y versiones que pueden diferir entre tu máquina y el CI |
| Hook de gitleaks que avisa pero deja continuar si no hay Docker | Cómodo, pero un secreto podría llegar hasta el CI |
| Un solo job para calidad y secretos | Si falla uno, no ves rápidamente cuál. Con dos jobs ves dos checks separados y se pueden exigir por separado |
| `pull_request_target` | Peligroso en repositorios públicos (ver 3.2) |
| Dependabot sin `ignore` | Propondría actualizaciones que hoy rompen el linter |
| Lighthouse CI ahora | No hay web que medir. Se añade en la fase 1 |

## 6. Cómo verificar

**a) El workflow es válido (sin ejecutarlo en GitHub)**
```bash
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest
echo "exit: $?"
```
Esperado: no imprime errores y sale con `0`. `actionlint` es una herramienta que analiza archivos de workflow.

**b) Los pasos del CI pasan en local, en el mismo orden**
```bash
pnpm install --frozen-lockfile
pnpm format:check && pnpm lint:root && pnpm lint && pnpm typecheck && pnpm build && pnpm test
```
Esperado: todos terminan con código `0`.

**c) gitleaks escanea el historial sin fugas**
```bash
sh scripts/gitleaks.sh history
```
Esperado: `no leaks found`.

**d) gitleaks detecta un secreto (sin crear archivos)**
```bash
printf 'GITHUB_TOKEN=ghp_%s\n' "aB3dE5gH7jK9mN1pQ3sT5vW7yZ9bC1dE3fG5" \
  | docker run -i --rm ghcr.io/gitleaks/gitleaks:v8.30.1 stdin --no-banner --redact
echo "exit: $?"
```
Esperado: `leaks found: 1` y código `1`. El token es inventado. Esto comprueba la detección con la herramienta; **no** prueba el modo `staged` del hook con un archivo real en staging.

**e) El script rechaza un uso incorrecto**
```bash
sh scripts/gitleaks.sh; echo "exit: $?"
```
Esperado: `usage: sh scripts/gitleaks.sh staged|history` y código `2`.

**f) Los checks aparecen en el PR.** Abre el PR en GitHub: en la parte inferior deben aparecer `Quality` y `Secrets`. Esta es la **única prueba real** del workflow, porque se ejecuta en los servidores de GitHub.

**g) Dependabot reconoce la configuración.** En GitHub: Insights → Dependency graph → Dependabot. Debe listar `github-actions` y `npm`. Si hay un error de sintaxis, aparece ahí.

### Hacer los checks obligatorios (después de fusionar este PR)

1. Settings → Rules → Rulesets → `protect-main`.
2. Activa **Require status checks to pass**.
3. Pulsa **Add checks** y añade `Quality` y `Secrets`. Si no aparecen, es que el workflow aún no se ha ejecutado.
4. Guarda con **Save changes**.
5. Verifica abriendo un PR de prueba con un fallo (por ejemplo, un archivo sin formato): el botón de fusionar debe quedar bloqueado hasta que el check pase.

## 7. Trampas conocidas

- **Los hooks se pueden saltar** con `--no-verify`. Por eso existe el CI. Y el CI solo protege si los checks son **obligatorios** (sección 6): un check rojo que no es obligatorio no impide fusionar.
- **El job Secrets descubre secretos de commits viejos.** Si en el futuro un secreto antiguo aparece, ignorarlo en el archivo no basta: hay que **revocarlo y rotarlo**. Borrarlo del historial no es suficiente.
- **Falsos positivos.** Si gitleaks marca algo que no es un secreto, se puede permitir con un comentario `gitleaks:allow` en esa línea o con un archivo `.gitleaksignore`. Hazlo solo tras comprobar que de verdad no es un secreto.
- **Docker apagado bloquea los commits.** Es intencionado. Si Docker no arranca, el CI sigue escaneando cada PR, pero un secreto que entre en un commit local no se detendría hasta entonces.
- **Cambiar el nombre de un job rompe el check obligatorio.** Si renombras `Quality` o `Secrets`, el ruleset sigue esperando el nombre antiguo y el PR queda bloqueado para siempre.
- **El digest y los SHA fijados no se actualizan solos para gitleaks.** Dependabot actualiza los SHA de las acciones, pero **no** la imagen dentro de `scripts/gitleaks.sh`. Hay que cambiarla a mano periódicamente.
- **Sin `--frozen-lockfile`,** el CI podría reescribir el lockfile en lugar de detectar que está desactualizado.
- **Los workflows no se pueden probar por completo en local.** `actionlint` valida la sintaxis y ejecutar los pasos a mano valida los comandos, pero solo GitHub confirma que todo funciona unido.
- **`pnpm test` y `pnpm lint` pasan en vacío** mientras no haya paquetes. El CI aún no demuestra calidad real hasta la fase 1.
- **Dependabot ignora versiones mayores bloqueadas.** Hay que revisar y quitar esas entradas cuando `typescript-eslint` soporte TypeScript 7 y `jsx-a11y` soporte ESLint 10.

## 8. Para repetirlo en otro proyecto

1. Crear `scripts/gitleaks.sh` con la imagen fijada por tag y digest, y llamarlo desde el hook `pre-commit` (modo `staged`) y desde el CI (modo `history`).
2. Crear `.github/workflows/ci.yml` con permisos mínimos, acciones fijadas por SHA, `persist-credentials: false`, `fetch-depth: 0` en el job de secretos y `pnpm install --frozen-lockfile`.
3. Obtener los SHA con `gh api repos/<owner>/<repo>/commits/<etiqueta> --jq .sha`.
4. Crear `.github/dependabot.yml` para `github-actions` y el gestor de paquetes, con `commit-message.prefix` e `ignore` donde haya incompatibilidades.
5. Validar con `actionlint` y ejecutando cada paso del CI en local.
6. Abrir el PR y comprobar que aparecen los checks.
7. **Después** de fusionar, añadir los checks como obligatorios en el ruleset de `main`.
8. Documentarlo en el mismo commit que lo implementa.
