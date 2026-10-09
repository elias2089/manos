# 03. Monorepo con pnpm y Turborepo

PR: `chore/monorepo-setup`. Archivos nuevos en la raíz: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig.base.json`.

## 1. Objetivo

Dejar la estructura del monorepo funcionando: un solo repositorio donde conviven la web, la API, la app móvil y el código compartido, con un comando en la raíz que ejecute una tarea (compilar, revisar tipos, probar) en todos los paquetes. Todavía no existen `apps/` ni `packages/`: se crean cuando haya código que meter.

## 2. Glosario

| Término | Significado |
|---|---|
| **Monorepo** | Un solo repositorio de Git que contiene varios proyectos relacionados |
| **Paquete (package)** | Una carpeta con su propio `package.json`. Puede ser una aplicación o una librería interna |
| **Workspace** | Función del gestor de paquetes que reconoce varios paquetes dentro de un repositorio y los enlaza entre sí |
| **Gestor de paquetes** | Programa que descarga e instala dependencias: npm, yarn o pnpm |
| **Dependencia** | Código de terceros que tu proyecto usa |
| **`devDependencies`** | Dependencias que solo se necesitan para desarrollar (compilar, probar), no para ejecutar el producto |
| **Lockfile** | Archivo que registra la versión **exacta** de cada dependencia instalada, incluidas las indirectas |
| **Dependencia transitiva** | Una dependencia de tus dependencias |
| **Turborepo (`turbo`)** | Herramienta que ejecuta tareas en el monorepo en el orden correcto, en paralelo y con caché |
| **Tarea (task)** | Un script con nombre (`build`, `lint`...) que Turborepo sabe orquestar |
| **Caché** | Resultado guardado de una ejecución anterior para no repetirla si nada cambió |
| **TypeScript** | JavaScript con tipos. El compilador `tsc` revisa que los tipos sean coherentes |
| **`tsconfig`** | Archivo de configuración del compilador de TypeScript |
| **Corepack** | Utilidad incluida con Node que fija la versión del gestor de paquetes que usa un proyecto |
| **Semver** | Versionado `mayor.menor.parche`. Un cambio de versión mayor puede romper compatibilidad |

## 3. Teoría

### 3.1 Qué es un monorepo y cuándo conviene

Un monorepo reúne varios proyectos en un solo repositorio. En este proyecto la web, la API y la app móvil comparten tipos y validaciones (por ejemplo, la forma de un "lead"). Con repositorios separados habría que copiar o publicar ese código y mantenerlo sincronizado a mano. En un monorepo, un solo commit cambia el tipo y todos sus usos.

| Ventaja | Costo |
|---|---|
| Un cambio atómico entre paquetes | Hace falta una herramienta que organice las tareas (Turborepo) |
| Tipos y validaciones compartidos sin publicar | El repositorio crece y el CI debe ejecutar solo lo necesario |
| Un solo conjunto de reglas de calidad y seguridad | Quien clona obtiene todo, aunque trabaje solo en una parte |

No conviene si los proyectos no comparten código ni ciclo de vida, o si equipos distintos necesitan permisos separados.

### 3.2 `pnpm` y los workspaces

`pnpm-workspace.yaml` declara dónde están los paquetes:
```yaml
packages:
  - apps/*
  - packages/*
```
`*` significa "cualquier carpeta de primer nivel". Cuando existan `apps/web` y `packages/shared`, pnpm los reconocerá como parte del workspace.

Cómo ayuda pnpm:
- **Enlaces, no copias.** Si `apps/web` depende de `packages/shared`, pnpm crea un enlace simbólico hacia esa carpeta. No se publica ni se copia: editas `shared` y `web` lo ve al instante.
- **Almacén común.** Cada versión de cada dependencia se descarga una sola vez en un almacén global y se enlaza en cada proyecto. Ahorra disco y tiempo.
- **Estricto.** Un paquete solo puede importar lo que declaró en su `package.json`. Con npm o yarn, a veces funciona importar algo que no declaraste, porque otro paquete lo instaló, y falla después en otro entorno. Con pnpm falla enseguida.

### 3.3 `package.json` de la raíz, campo por campo

| Campo | Valor | Para qué |
|---|---|---|
| `name` | `manos` | Nombre del proyecto |
| `version` | `0.0.0` | Sin versión publicable aún |
| `private` | `true` | **Impide publicar el paquete por accidente** en npm. Obligatorio en la raíz de un monorepo |
| `packageManager` | `pnpm@9.15.9` | Declara el gestor y su versión. Corepack y pnpm lo leen para usar o exigir esa versión |
| `engines.node` | `>=24 <25` | Declara la versión de Node soportada. Es una restricción que el gestor puede comprobar, a diferencia de `.nvmrc`, que solo documenta |
| `engines.pnpm` | `>=9.15.9 <10` | Exige pnpm 9. pnpm avisa de que existe la 12, pero no la usamos a propósito |
| `scripts` | `build`, `lint`, `typecheck`, `test` | Cada uno delega en Turborepo: `turbo run <tarea>` |
| `devDependencies` | `turbo`, `typescript` | Herramientas de desarrollo compartidas por todo el monorepo |

**Versiones exactas, sin `^`.** Escribimos `"turbo": "2.11.7"` y no `"^2.11.7"`. El `^` permite actualizaciones menores automáticas; la versión exacta hace que las actualizaciones sean una decisión tuya, revisable en un PR. El lockfile ya fija las versiones, pero así también queda claro en el `package.json`.

**Por qué `engines` y no solo `.nvmrc`.** `.nvmrc` es una ayuda para quien usa `nvm`. `engines` es una declaración que el gestor de paquetes lee al instalar; con `engine-strict` pasa a ser obligatoria.

### 3.4 El lockfile

`pnpm-lock.yaml` guarda la versión exacta de cada paquete, incluidas las dependencias transitivas, y un hash de integridad de cada uno. Sin lockfile, `pnpm install` podría traer hoy una versión distinta de una dependencia indirecta que ayer.

- **Se commitea siempre.** Así tu máquina, el CI y producción instalan exactamente lo mismo.
- **Seguridad (OWASP A06 y A08).** El hash de integridad impide que un paquete cambie sin que te enteres, y permite auditar qué versiones usas con `pnpm audit`.
- **No se edita a mano.** Lo modifica `pnpm install` o `pnpm add`.
- En el CI se usa `pnpm install --frozen-lockfile`, que **falla** si el lockfile no coincide con los `package.json`, en vez de modificarlo.

### 3.5 Turborepo

Turborepo hace tres cosas:

1. **Orden.** Si `apps/web` depende de `packages/shared`, compila primero `shared`. Lo declara `"dependsOn": ["^build"]`: el `^` significa "la misma tarea en las dependencias de este paquete".
2. **Paralelismo.** Ejecuta a la vez lo que no depende entre sí.
3. **Caché.** Calcula una huella de las entradas (código, dependencias, configuración). Si es idéntica a una ejecución anterior, **reutiliza el resultado** en lugar de repetir el trabajo. Ahorra mucho tiempo, sobre todo en CI.

Tareas definidas en `turbo.json`:

| Tarea | `dependsOn` | `outputs` | Significado |
|---|---|---|---|
| `build` | `^build` | `dist/**`, `.next/**` (sin `.next/cache/**`) | Compilar. Los outputs son lo que se cachea y restaura |
| `lint` | `^lint` | | Revisar el estilo y errores comunes |
| `typecheck` | `^typecheck` | | Revisar los tipos con `tsc` |
| `test` | `^build` | `coverage/**` | Probar. Necesita que las dependencias estén compiladas |

`"agentGuidance": false` desactiva que Turborepo escriba un `AGENTS.md` en la raíz cuando detecta que lo ejecuta un asistente de IA. Decidimos no tener ese archivo en el repositorio (ver sección 7).

Con este PR no hay paquetes, así que `pnpm build` termina con éxito y avisa `No tasks were executed`. Es el comportamiento esperado.

### 3.6 `tsconfig.base.json`

Es la configuración **base** estricta que heredarán todos los paquetes con `"extends"`. Cada paquete añadirá solo lo suyo (carpetas, plugins).

| Opción | Efecto |
|---|---|
| `target: ES2023`, `lib: ["ES2023"]` | Sintaxis y APIs de JavaScript que Node 24 soporta |
| `module: ESNext`, `moduleResolution: Bundler` | Módulos modernos; la resolución imita a los empaquetadores (Next.js, Vite) |
| `strict` | Activa el grupo de comprobaciones estrictas: no permite `null`/`undefined` sin comprobar, ni `any` implícito |
| `noUncheckedIndexedAccess` | Leer `lista[0]` o `objeto[clave]` da `T \| undefined`, porque el elemento puede no existir. Evita fallos en tiempo de ejecución |
| `exactOptionalPropertyTypes` | Distingue una propiedad ausente de una propiedad con valor `undefined` |
| `noImplicitOverride` | Obliga a escribir `override` al sobrescribir un método de una clase |
| `noImplicitReturns` | Todas las ramas de una función deben devolver valor |
| `noFallthroughCasesInSwitch` | Evita olvidar un `break` en un `switch` |
| `noUnusedLocals`, `noUnusedParameters` | Marca variables y parámetros que no se usan |
| `forceConsistentCasingInFileNames` | Evita importar `./Archivo` y `./archivo` como si fueran distintos. Importa entre Windows y Linux |
| `isolatedModules` | Cada archivo debe poder compilarse por separado, requisito de los empaquetadores modernos |
| `verbatimModuleSyntax` | Obliga a escribir `import type` para imports que solo son tipos; hace explícito qué se borra al compilar |
| `skipLibCheck` | No revisa los tipos de archivos `.d.ts` de librerías. Acelera sin sacrificar seguridad en nuestro código |

La estrictez es de seguridad (OWASP A04, diseño inseguro): muchos errores de lógica se descubren al compilar y no en producción. Es más fácil empezar estricto que endurecer un proyecto ya escrito.

**TypeScript 7.0.2.** Fue tu decisión, y es la versión `latest` oficial en npm. La versión mayor 7 es reciente, así que antes de añadir Next.js, NestJS, Prisma o ESLint hay que comprobar que soportan TypeScript 7. Si alguno no lo hace, lo documentaremos y decidiremos entre bajar TypeScript o esperar. Verificamos que `tsc --showConfig` acepta este archivo sin errores.

## 4. Qué hicimos

| Archivo | Resultado |
|---|---|
| `package.json` | Raíz privada con `packageManager`, `engines`, scripts hacia Turborepo y dos `devDependencies` exactas |
| `pnpm-workspace.yaml` | Declara `apps/*` y `packages/*` |
| `turbo.json` | Tareas `build`, `lint`, `typecheck`, `test` y `agentGuidance` desactivado |
| `tsconfig.base.json` | Base estricta descrita en 3.6 |
| `pnpm-lock.yaml` | Generado por `pnpm install`; se commitea |

Comando ejecutado: `pnpm install`, que descargó `turbo@2.11.7` y `typescript@7.0.2` en `node_modules/` (ignorada por Git desde el PR A).

## 5. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Nx** en lugar de Turborepo | Más potente, pero con más conceptos y configuración. Turborepo basta para este tamaño |
| **Repositorios separados** (web, API, móvil) | Compartir tipos y validaciones sería manual y propenso a desincronizarse |
| **npm o yarn workspaces** | pnpm es más rápido, ahorra disco y es estricto con lo que cada paquete declara |
| **Versiones con `^`** | Permiten cambios automáticos de versión menor. Preferimos decidir las actualizaciones |
| **Crear `apps/` y `packages/` vacías ya** | Estructura sin código; se crean cuando se necesiten (YAGNI) |
| **TypeScript 5.x** | Más probado con el ecosistema, pero elegiste 7.0.2, la versión actual. Queda el riesgo de compatibilidad indicado en 3.6 |

## 6. Cómo verificar

Todo desde la raíz del repositorio.

**a) Versiones instaladas**
```bash
pnpm exec tsc --version
pnpm exec turbo --version
```
Esperado: `Version 7.0.2` y `2.11.7`.

**b) La configuración de TypeScript es válida**
```bash
pnpm exec tsc -p tsconfig.base.json --showConfig
```
Esperado: imprime la configuración normalizada con `"strict": true` y sin errores.

**c) Las tareas raíz funcionan sin paquetes**
```bash
pnpm build
echo "exit: $?"
```
Esperado: `No tasks were executed as part of this run` y código de salida `0`.

**d) Lo generado se ignora y el lockfile no**
```bash
git status --short
```
Esperado: aparecen como nuevos `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json` y `turbo.json`. **No** aparecen `node_modules/` ni `.turbo/`.

**e) `engines` se hace cumplir**
```bash
node -p "require('./package.json').engines"
```
Esperado: `{ node: '>=24 <25', pnpm: '>=9.15.9 <10' }`. Esto solo muestra lo declarado. No probamos qué hace `pnpm install` con otra versión de Node: por defecto pnpm suele **avisar** y solo **falla** si se activa `engine-strict=true` en `.npmrc`. Si queremos que falle siempre, es una decisión para un PR posterior.

## 7. Trampas conocidas

- **Turborepo escribe un `AGENTS.md`** en la raíz al detectar un asistente de IA. Es contenido generado por la herramienta, no una decisión del proyecto. Se desactiva con `"agentGuidance": false` en `turbo.json`. **Esa opción no borra un `AGENTS.md` ya creado**: hay que borrarlo a mano y no commitearlo.
- **pnpm avisa de una versión más nueva** (12.x). Es solo información; `packageManager` y `engines` fijan la 9.x a propósito, y actualizar de versión mayor es una decisión que se toma en un PR aparte.
- **`pnpm install` en CI debe usar `--frozen-lockfile`.** Sin él, el CI podría modificar el lockfile en lugar de detectar que está desactualizado.
- **Sin paquetes, `pnpm lint` y `pnpm typecheck` no hacen nada.** Pasan en verde por vacío, y el CI aún no demuestra calidad real hasta la fase 1.
- **Versión mayor nueva de TypeScript.** Revisar la compatibilidad de cada herramienta antes de añadirla (ver 3.6).
- **No editar `pnpm-lock.yaml` a mano.**

## 8. Para repetirlo en otro proyecto

1. Crear `package.json` raíz con `private: true`, `packageManager` y `engines`.
2. Crear `pnpm-workspace.yaml` con las carpetas de paquetes.
3. Instalar `turbo` y `typescript` como `devDependencies` con versión exacta: `pnpm add -D -w turbo typescript`.
4. Crear `turbo.json` con las tareas del proyecto y `dependsOn: ["^tarea"]` donde haga falta.
5. Crear `tsconfig.base.json` estricto y hacer que cada paquete lo herede con `extends`.
6. Ejecutar `pnpm install` y commitear el `pnpm-lock.yaml`.
7. Verificar con los comandos de la sección 6.
8. Hacer el cambio por rama y PR, y documentarlo en el mismo commit.
