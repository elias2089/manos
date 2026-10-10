# 04. Calidad de código: ESLint, Prettier, husky, lint-staged y commitlint

PR: `chore/code-quality`. Archivos nuevos: `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `commitlint.config.mjs`, `.husky/pre-commit`, `.husky/commit-msg`. Cambios en `package.json` y `pnpm-lock.yaml`.

## 1. Objetivo

Automatizar tres comprobaciones para que no dependan de la memoria ni de la disciplina de nadie:

1. **El código no tiene errores ni malas prácticas evidentes** (ESLint).
2. **El código tiene siempre el mismo formato** (Prettier).
3. **Los commits siguen el formato Conventional Commits** (commitlint), y todo lo anterior se ejecuta solo en cada commit (husky y lint-staged).

## 2. Glosario

| Término | Significado |
|---|---|
| **Linter** | Programa que lee tu código sin ejecutarlo y avisa de errores probables y malas prácticas |
| **Regla (rule)** | Una comprobación concreta de un linter. Cada una puede estar en `off`, `warn` (aviso) o `error` |
| **Formateador** | Programa que reescribe el código con un estilo uniforme (espacios, comillas, saltos de línea) |
| **Linting vs. formato** | El linter busca **errores** de lógica y calidad; el formateador solo cambia el **aspecto** |
| **Flat config** | El formato moderno de configuración de ESLint (`eslint.config.mjs`), que sustituye al antiguo `.eslintrc` |
| **Parser** | Parte que convierte el código en una estructura que la herramienta puede analizar |
| **Git hook** | Un script que Git ejecuta automáticamente en ciertos momentos (antes de un commit, al escribir su mensaje...) |
| **Staged** | Archivos que ya añadiste con `git add` y que entrarán en el próximo commit |
| **Conventional Commits** | Convención para escribir mensajes de commit: `tipo: descripción`, por ejemplo `feat: add login` |
| **Plugin** | Extensión que añade reglas o funciones a una herramienta |
| **Config compartida** | Un conjunto de reglas ya preparado que se importa en vez de escribirlo a mano |
| **ESM / `.mjs`** | El sistema moderno de módulos de JavaScript. La extensión `.mjs` indica que el archivo lo usa |
| **SAST** | Análisis estático de seguridad: buscar vulnerabilidades leyendo el código sin ejecutarlo |

## 3. Teoría: qué es cada herramienta y para qué se usa

### 3.1 ESLint

**Qué es.** Un linter para JavaScript y TypeScript. Lee tu código y lo compara con un conjunto de reglas.

**Para qué lo usamos.** Detectar errores antes de ejecutar nada: variables sin usar, comparaciones que siempre dan lo mismo, promesas olvidadas, `any` en TypeScript, etc. Es la primera línea de defensa de calidad.

**Cómo se configura.** En `eslint.config.mjs`, una lista de bloques que se aplican en orden. Los que están después pueden anular a los anteriores. Por eso el orden importa y `prettier` va el último.

**Versión elegida: 9.39.5, no la 10.** `eslint-plugin-jsx-a11y` (accesibilidad, que usaremos con la web en la fase 1) solo declara soporte hasta ESLint 9. Subiremos a la 10 cuando el ecosistema lo permita.

**Cómo ejecutarlo.** `pnpm lint:root` revisa los archivos de la raíz. Cuando existan paquetes, cada uno tendrá su script `lint` y `pnpm lint` los ejecutará todos mediante Turborepo.

### 3.2 `@eslint/js`

**Qué es.** El paquete oficial con las reglas base de ESLint para JavaScript.

**Para qué.** Aporta `js.configs.recommended`: el conjunto de reglas que el equipo de ESLint considera indiscutibles, como `no-undef` (usar una variable que no existe) o `no-unreachable` (código que nunca se ejecuta). Tiene que ir en la misma versión mayor que `eslint`.

### 3.3 `typescript-eslint`

**Qué es.** El puente que permite a ESLint entender TypeScript. Incluye un parser (convierte TypeScript en algo que ESLint analiza) y reglas propias de TypeScript.

**Para qué.** Sin él, ESLint no sabría leer `: string` ni `interface`. Con él, reglas como `no-explicit-any` (prohíbe `any`, que desactiva la comprobación de tipos).

**Ejemplo real de nuestras pruebas.** `export const a: any = 1;` produce `Unexpected any. Specify a different type @typescript-eslint/no-explicit-any`.

**Por qué esta herramienta bajó TypeScript a 6.0.3.** En su versión actual (8.71.1) declara que soporta TypeScript `>=4.8.4 <6.1.0`. Nuestro proyecto tenía TypeScript 7.0.2, que queda fuera del rango. La causa de fondo es probablemente que `typescript-eslint` usa la API de JavaScript del compilador, y TypeScript 7 es una reescritura nativa sin esa API; esto lo deducimos de los datos del paquete y **no lo probamos instalándolo**. Decisión: bajar a 6.0.3 y subir a 7 cuando `typescript-eslint` lo soporte. Ver la corrección en [03-monorepo-setup.md](03-monorepo-setup.md).

**Nota.** Usamos `tseslint.configs.recommended`, que **no** requiere información de tipos del proyecto. Las reglas "con tipos" (`recommendedTypeChecked`) son más potentes pero necesitan archivos TypeScript y un `tsconfig`; se activarán en la fase 1, cuando haya código.

### 3.4 `eslint-plugin-security`

**Qué es.** Un plugin de ESLint con reglas que buscan patrones de código peligrosos. Es una forma sencilla de SAST.

**Para qué.** Cubre en parte OWASP A03 (inyección): `eval` con datos variables, expresiones regulares que pueden bloquear el servidor, acceso a propiedades con claves variables, generación de números pseudoaleatorios para usos sensibles, etc.

**Ejemplo real de nuestras pruebas.** `eval(s)` produce `eval with argument of type Identifier security/detect-eval-with-expression`.

**Límite importante.** En su configuración recomendada las reglas son **avisos** (`warn`), no errores: no bloquean un commit. Tampoco encuentran todos los problemas de seguridad, y tiene falsos positivos. Es una red de apoyo, no sustituye la revisión ni la lista OWASP del proyecto.

### 3.5 Prettier

**Qué es.** Un formateador de código opinado: tú escribes como quieras y él reescribe todo con un estilo fijo.

**Para qué.** Acabar con las discusiones de estilo y con los diffs llenos de cambios de espacios. Todo el código se ve igual, sin importar quién lo escribió.

**Nuestra configuración (`.prettierrc.json`):**

| Opción | Valor | Efecto |
|---|---|---|
| `singleQuote` | `true` | Comillas simples: `'hola'` |
| `trailingComma` | `all` | Coma final en listas y objetos multilínea, lo que hace los diffs más limpios |
| `printWidth` | `100` | Ancho máximo de línea antes de partirla |

Prettier también lee `.editorconfig` (indentación, finales de línea). Por eso no repetimos esos ajustes.

**Ejemplo real de nuestras pruebas.** `const a = {b:1,"c":"d"}` queda como `const a = { b: 1, c: 'd' };`.

**`.prettierignore`.** Excluye carpetas generadas (`dist/`, `.next/`), el lockfile y `*.md`. Los Markdown se excluyen porque Prettier realinearía las tablas que mantenemos a mano y generaría diffs ruidosos.

**Cómo ejecutarlo.** `pnpm format` reescribe los archivos; `pnpm format:check` solo comprueba y falla si alguno no cumple (es lo que usará el CI).

### 3.6 `eslint-config-prettier`

**Qué es.** Una configuración que **desactiva** las reglas de ESLint que chocan con Prettier.

**Para qué.** ESLint tiene reglas de formato (comillas, espacios). Si siguieran activas, ESLint y Prettier se contradirían y ningún código los satisfaría a la vez. Este paquete apaga las reglas de estilo y deja el formato solo a Prettier. **Debe ir la última** en `eslint.config.mjs`, para anular a las anteriores.

### 3.7 husky

**Qué es.** Una herramienta que facilita el uso de **git hooks**: scripts que Git ejecuta solo, en momentos concretos del flujo.

**Para qué.** Los hooks vivían en `.git/hooks`, una carpeta que **no se comparte** con el repositorio. husky los guarda en `.husky/`, que sí se versiona, de modo que todos los que clonen el proyecto tienen los mismos hooks.

**Cómo funciona.**
1. El script `"prepare": "husky"` del `package.json` se ejecuta automáticamente tras `pnpm install`.
2. husky configura Git con `core.hooksPath=.husky/_`.
3. Cuando haces `git commit`, Git ejecuta los hooks de `.husky/`.

Nuestros dos hooks:

| Archivo | Cuándo se ejecuta | Qué hace |
|---|---|---|
| `.husky/pre-commit` | Antes de crear el commit | `pnpm exec lint-staged` |
| `.husky/commit-msg` | Cuando se escribe el mensaje | `pnpm exec commitlint --edit "$1"` (comprueba el mensaje) |

Si cualquiera de los dos falla, **el commit se cancela**.

### 3.8 lint-staged

**Qué es.** Una herramienta que ejecuta comandos **solo sobre los archivos que están en staging**.

**Para qué.** Revisar todo el proyecto en cada commit sería lento. Con lint-staged, solo se revisa lo que cambiaste.

**Nuestra configuración (en `package.json`):**

| Patrón | Comandos |
|---|---|
| `*.{js,mjs,cjs,ts,tsx}` | `eslint --fix` y luego `prettier --write` |
| `*.{json,yml,yaml,css}` | `prettier --write` |

`--fix` arregla automáticamente lo que ESLint sabe corregir. Si queda un error sin arreglar, el commit se detiene.

### 3.9 commitlint y `@commitlint/config-conventional`

**Qué es.** commitlint comprueba que el mensaje de cada commit cumpla una convención. `config-conventional` es la configuración que implementa **Conventional Commits**.

**Para qué.** Un historial legible, con tipos claros, permite generar changelogs automáticos y entender de un vistazo qué hizo cada cambio.

**Formato:** `tipo: descripción`. Los tipos permitidos son `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style` y `test`.

| Tipo | Úsalo para |
|---|---|
| `feat` | Una funcionalidad nueva |
| `fix` | Corregir un error |
| `docs` | Solo documentación |
| `chore` | Mantenimiento que no cambia el comportamiento (configuración, dependencias) |
| `refactor` | Reorganizar código sin cambiar lo que hace |
| `test` | Añadir o corregir pruebas |
| `ci` | Cambios en la integración continua |

Se ejecuta en el hook `commit-msg`.

## 4. Qué hicimos

| Cambio | Resultado |
|---|---|
| `package.json` | Nuevas `devDependencies` con versión exacta; scripts `lint:root`, `format`, `format:check` y `prepare`; sección `lint-staged`; `typescript` bajó a `6.0.3` |
| `eslint.config.mjs` | JavaScript recomendado, TypeScript recomendado, reglas de seguridad y `prettier` al final |
| `.prettierrc.json`, `.prettierignore` | Estilo y exclusiones de 3.5 |
| `commitlint.config.mjs` | Extiende `@commitlint/config-conventional` |
| `.husky/pre-commit`, `.husky/commit-msg` | Hooks de 3.7 |
| `docs/03-monorepo-setup.md` | Nota de corrección sobre TypeScript |

Versiones: `eslint` y `@eslint/js` 9.39.5, `typescript-eslint` 8.71.1, `eslint-plugin-security` 4.2.0, `eslint-config-prettier` 10.1.8, `prettier` 3.9.10, `husky` 9.1.7, `lint-staged` 17.6.0, `@commitlint/cli` y `@commitlint/config-conventional` 21.2.3, `typescript` 6.0.3.

## 5. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Biome** en lugar de ESLint y Prettier | Una sola herramienta y muy rápida, pero menos usada en proyectos reales y con menos plugins (accesibilidad, seguridad) |
| **ESLint 10** | `eslint-plugin-jsx-a11y` aún no la soporta |
| **TypeScript 7** | `typescript-eslint` declara no soportarlo (ver 3.3) |
| **Mantener TypeScript 7 sin typescript-eslint** | ESLint perdería casi todo su valor en TypeScript |
| **TypeScript 7 para compilar y 6 solo para ESLint** | Dos versiones a la vez: complejidad y riesgo de errores |
| **ESLint reglas de formato en lugar de Prettier** | Más configuración manual y peor resultado |
| **Lint de todo el proyecto en cada commit** | Lento; lint-staged revisa solo lo que cambió |
| **Hooks sin husky** (`.git/hooks`) | No se comparten con quien clone el repositorio |

## 6. Cómo verificar

Todo desde la raíz del repositorio. Las pruebas usan entrada por tubería (`printf ... |`) para no crear archivos.

**a) ESLint no encuentra problemas en el repositorio**
```bash
pnpm exec eslint .; echo "exit: $?"
```
Esperado: `exit: 0`.

**b) ESLint detecta un `any` en TypeScript**
```bash
printf 'export const a: any = 1;\n' | pnpm exec eslint --stdin --stdin-filename x.ts
```
Esperado: error `@typescript-eslint/no-explicit-any` y código de salida `1`.

**c) El plugin de seguridad detecta `eval`**
```bash
printf 'export const f = (s) => eval(s);\n' | pnpm exec eslint --stdin --stdin-filename x.js; echo "exit: $?"
```
Esperado: un **aviso** `security/detect-eval-with-expression`, con código de salida `0` (los avisos no bloquean).

**d) Prettier formatea**
```bash
printf 'const a = {b:1,"c":"d"}\n' | pnpm exec prettier --stdin-filepath x.ts
```
Esperado: `const a = { b: 1, c: 'd' };`.

**e) Prettier no ve diferencias en el repositorio**
```bash
pnpm format:check
```
Esperado: `All matched files use Prettier code style!`.

**f) commitlint rechaza un mensaje inválido**
```bash
echo "arreglé cosas" | pnpm exec commitlint; echo "exit: $?"
echo "update: stuff" | pnpm exec commitlint; echo "exit: $?"
```
Esperado: ambos con código `1`. El primero por `subject-empty` y `type-empty`; el segundo por `type-enum` (el tipo `update` no existe).

**g) commitlint acepta un mensaje válido**
```bash
echo "chore: add code quality tooling" | pnpm exec commitlint; echo "exit: $?"
```
Esperado: código `0`.

**h) Los hooks están activos**
```bash
git config core.hooksPath
ls .husky
```
Esperado: `.husky/_` y los archivos `commit-msg` y `pre-commit`.

**i) El hook rechaza de verdad (prueba definitiva)**
```bash
git commit --allow-empty -m "mensaje invalido"
```
Esperado: el commit se cancela con errores de commitlint.

**j) TypeScript 6.0.3 acepta la base estricta.** `tsc -p tsconfig.base.json` por sí solo da `TS18003 No inputs were found`, porque aún no hay archivos `.ts`. Eso no es un error de configuración. Para comprobarla de verdad hay que usar un proyecto de prueba que la herede (`extends`) con algún `.ts`. Lo hicimos fuera del repositorio: un archivo correcto compila, y `const x: string = lista[0]` falla con `Type 'string | undefined' is not assignable to type 'string'`, porque `noUncheckedIndexedAccess` está activo.

## 7. Trampas conocidas

- **Los hooks de husky se ejecutan en tu máquina con tu entorno.** Si `pnpm install` no se ha ejecutado, `prepare` no corre y los hooks no se activan. Es lo primero que hay que revisar si un commit no pasa por los hooks.
- **`git commit --no-verify` se salta los hooks.** Es una salida de emergencia, no una práctica. Por eso el CI (PR D) repetirá las mismas comprobaciones: los hooks locales se pueden saltar, el CI no.
- **commitlint limita el ancho del cuerpo del mensaje.** Cada línea del cuerpo debe tener como máximo 100 caracteres (`body-max-line-length`); el título también tiene su límite. Nos pasó en este mismo PR: el primer intento de commit fue rechazado por una línea larga. Con `git commit -m` se puede pasar un `-m` por párrafo para mantener las líneas cortas.
- **El orden en `eslint.config.mjs` importa.** `prettier` debe ir el último, o sus ajustes no anulan las reglas de formato.
- **Las reglas de seguridad son avisos.** No bloquean commits. Revisar la salida de ESLint, no solo su código de salida.
- **Sin archivos TypeScript, el linter casi no tiene qué revisar.** Hoy solo analiza `eslint.config.mjs` y `commitlint.config.mjs`. Su valor real llegará con el código de la fase 1.
- **`*.md` excluido de Prettier.** Las tablas de la documentación se alinean a mano.
- **Versión de TypeScript.** Si subes a 7 antes de que `typescript-eslint` lo soporte, ESLint dejará de funcionar o dará avisos de versión no soportada. Revisa el campo `peerDependencies` de `typescript-eslint` antes de subir.
- **ESLint 10 y `jsx-a11y`.** No actualizar ESLint a la 10 hasta que `eslint-plugin-jsx-a11y` la soporte.

## 8. Para repetirlo en otro proyecto

1. Instalar las `devDependencies` con versión exacta: `pnpm add -D -w eslint @eslint/js typescript-eslint eslint-plugin-security eslint-config-prettier prettier husky lint-staged @commitlint/cli @commitlint/config-conventional`.
2. Comprobar el campo `peerDependencies` de `typescript-eslint` contra tu versión de TypeScript **antes** de instalar.
3. Crear `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` y `commitlint.config.mjs` como en la sección 4.
4. Añadir al `package.json` los scripts `prepare`, `format`, `format:check`, `lint:root` y la sección `lint-staged`.
5. Ejecutar `pnpm install` para que `prepare` active husky.
6. Crear `.husky/pre-commit` y `.husky/commit-msg` con el contenido de 3.7.
7. Verificar con los comandos de la sección 6, sobre todo la prueba i (rechazo real del hook).
8. Hacer el cambio por rama y PR, y documentarlo en el mismo commit.
