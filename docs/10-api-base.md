# 10. API base: esqueleto de NestJS

PR: `feat/api-base`. Archivos nuevos: `apps/api/`. Cambios en `pnpm-lock.yaml`.

> **Estado: en construcción.** Este documento se completa paso a paso, en el mismo PR que el código. Cubre hasta el paso 4 (primera aplicación que arranca). Las secciones de configuración, logs, `Clock`, `/health` y pruebas se añaden al cerrar cada paso.

## 1. Objetivo

Crear la aplicación `apps/api` con NestJS 12: un esqueleto que compila, arranca y responde a `GET /health`, con configuración validada, registros sin datos sensibles, un reloj inyectable y pruebas con Vitest. No incluye base de datos, Redis, correo, autenticación ni Cucumber.

**Cucumber queda fuera de este PR por decisión del proyecto.** El riesgo de cargar TypeScript con decoradores desde Cucumber (ver 08, sección 5.13) **sigue sin resolverse** y debe resolverse **antes del PR 3**, el primero que necesita escenarios ejecutables.

## 2. Glosario

| Término | Significado |
|---|---|
| **Monorepo** | Un solo repositorio con varios proyectos (`apps/api`, más adelante `apps/web`) |
| **Workspace (pnpm)** | La lista de carpetas que pnpm trata como paquetes. Está en `pnpm-workspace.yaml` (`apps/*`, `packages/*`) |
| **`package.json`** | La ficha de un paquete: nombre, scripts y dependencias |
| **Scope (`@manos/`)** | Prefijo del nombre de un paquete que evita choques de nombres |
| **ESM** | El sistema moderno de módulos de JavaScript (`import ... from`). NestJS 12 solo se publica en ESM |
| **`dependencies`** | Paquetes que la aplicación necesita para ejecutarse |
| **`devDependencies`** | Paquetes que solo se usan para desarrollar (compilar, probar). No viajan a producción |
| **Peer dependency** | Un paquete que declara "funciono si tú instalas también este otro" |
| **Versión exacta** | `"12.1.3"` en lugar de `"^12.1.3"`. El `^` permite actualizaciones menores automáticas |
| **Decorador** | Anotación como `@Controller()` que añade comportamiento a una clase |
| **Metadata de decoradores** | Información de tipos que TypeScript guarda para que Nest sepa qué inyectar en un constructor |
| **Inyección de dependencias** | Una clase recibe lo que necesita (por constructor) en lugar de crearlo ella misma |
| **`tsconfig.json`** | Instrucciones para el compilador de TypeScript |
| **`nodenext`** | Modo de TypeScript que imita las reglas reales de módulos de Node |
| **Módulo (`@Module`)** | Caja que agrupa piezas relacionadas (controladores, servicios). `AppModule` es el módulo raíz |
| **`NestFactory`** | Construye la aplicación a partir del módulo raíz. `create()` arma las dependencias y `listen()` abre el puerto |
| **Bootstrap** | El arranque de la aplicación. Por convención, una función `bootstrap()` en `main.ts` |
| **Top-level await** | Usar `await` fuera de una función. Funciona porque el proyecto es ESM y el `target` es moderno |
| **`dist/`** | Carpeta con el JavaScript compilado, lo único que Node ejecuta. Está en `.gitignore` |

## 3. Qué se hizo, paso a paso

### Paso 1. Rama y paquete

```bash
git switch -c feat/api-base
mkdir -p apps/api
```

`apps/api/package.json`:

```json
{
  "name": "@manos/api",
  "version": "0.0.0",
  "private": true,
  "description": "Manos REST API",
  "type": "module",
  "engines": { "node": ">=24 <25" }
}
```

| Campo | Para qué sirve |
|---|---|
| `name` | Identificador. `@manos/` evita choques de nombres |
| `private: true` | Impide publicarlo en npm por accidente |
| `type: "module"` | Hace que los `.js` se traten como ESM. NestJS 12 lo requiere |
| `engines` | La misma restricción de Node que la raíz |

No lleva `scripts` ni `dependencies` todavía: se añaden cuando hay algo que ejecutar (YAGNI). `pnpm install` registra el paquete en `pnpm-lock.yaml` (`apps/api: {}`).

### Paso 2. Dependencias de ejecución

Desde la raíz del repositorio:

```bash
pnpm add -F @manos/api --save-exact @nestjs/core@12.1.3 @nestjs/common@12.1.3 @nestjs/platform-express@12.1.3 reflect-metadata@0.2.2 rxjs@7.8.2
```

`-F` (filter) elige el paquete; `--save-exact` evita el `^`, como en el resto del repositorio (ver 03).

| Paquete | Qué es | Por qué |
|---|---|---|
| `@nestjs/core` | El motor: inyección de dependencias y ciclo de vida | Es el framework |
| `@nestjs/common` | Decoradores, pipes, excepciones | Se usa en casi cada archivo |
| `@nestjs/platform-express` | Conecta Nest con Express | Sin él Nest no atiende peticiones. Se eligió Express frente a Fastify (ver 08, decisión 6) |
| `reflect-metadata` | Permite guardar metadata en clases | Nest la lee para inyectar. Peer dependency obligatoria |
| `rxjs` | Programación reactiva | Nest la usa internamente. Peer dependency obligatoria |

`class-validator` y `class-transformer` aparecen como peers de `@nestjs/common`, pero son **opcionales**. No se instalan: la validación se hará con Zod.

### Paso 3. Tipos de Node y `tsconfig`

```bash
pnpm add -F @manos/api -D --save-exact @types/node@24.19.2
```

`@types/node` describe la API de Node (`process`, `Buffer`...). La versión 24 coincide con el Node del proyecto. `@types/express` no se instala todavía porque ningún código lo usa.

`apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src"]
}
```

| Campo | Para qué sirve |
|---|---|
| `extends` | Hereda las opciones estrictas de la raíz |
| `module` y `moduleResolution` | Sustituyen a `ESNext` y `Bundler`. Deben cambiarse **juntos** |
| `experimentalDecorators` | Activa la sintaxis de decoradores que usa Nest |
| `emitDecoratorMetadata` | Guarda los tipos del constructor, base de la inyección |
| `types` | Carga solo los tipos de Node, no todos los `@types/*` instalados |
| `noEmit` | Solo comprueba tipos. El `tsconfig` que genera archivos llega con el paso 4 |

**Por qué no sirve el `tsconfig.base.json` tal cual.** Tiene `module: ESNext` y `moduleResolution: Bundler`, pensados para proyectos con empaquetador (Next.js, Vite). Con `Bundler`, TypeScript acepta `import './app.module'` y deja el import **sin extensión** en el JavaScript, y Node en modo ESM exige `./app.module.js`. NestJS no usa empaquetador: Node ejecuta el código compilado. La documentación oficial de NestJS 12 pide `nodenext` y extensión `.js` en los imports relativos. El cambio se hace solo en `apps/api`, sin tocar la base compartida.

### Paso 4. La primera aplicación que arranca

`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';

@Module({})
export class AppModule {}
```

`apps/api/src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

await bootstrap();
```

`apps/api/tsconfig.build.json` (hereda de `tsconfig.json` y sí genera archivos):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true
  }
}
```

Bloque `scripts` de `apps/api/package.json`:

```json
"scripts": {
  "build": "tsc -p tsconfig.build.json",
  "typecheck": "tsc -p tsconfig.json",
  "start": "node dist/main.js"
}
```

| Parte | Qué hace |
|---|---|
| `@Module({})` | Marca la clase como módulo. El objeto vacío significa que aún no tiene controladores ni servicios |
| `'./app.module.js'` | Extensión `.js` aunque el archivo sea `.ts`: es el nombre del archivo **compilado** |
| `NestFactory.create(AppModule)` | Construye la aplicación (Express por debajo, por `@nestjs/platform-express`) |
| `app.listen(3000)` | Abre el puerto 3000. El `3000` es **provisional**: el paso siguiente lo sustituye por configuración validada |
| `await bootstrap()` | Ejecuta el arranque. Si la creación falla, Nest termina el proceso con código 1 |
| `noEmit: false` | Anula el `true` heredado: aquí sí se genera JavaScript |
| `rootDir: ./src` | Deja el resultado en `dist/main.js` y no en `dist/src/main.js` |
| `sourceMap` | Los errores señalan el `.ts` original, no el JavaScript compilado |
| `build` y `typecheck` | Son los nombres que Turbo ya busca: `pnpm build` y `pnpm typecheck` desde la raíz funcionan sin tocar `turbo.json` |

**Por qué `tsc` y no el CLI de Nest.** `@nestjs/cli` añadiría una herramienta que aquí no aporta nada. `tsc` genera la metadata de decoradores, algo que `tsx` y esbuild no hacen.

**Dónde se resuelve `tsc`.** `apps/api` no instala TypeScript: pnpm usa el binario de la raíz (6.0.3). Verificado con `pnpm -F @manos/api exec which tsc`.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Cambiar `tsconfig.base.json` a `nodenext` | La web (Next.js) usa un empaquetador y sí necesita `Bundler`. El cambio queda en cada app |
| Dependencias con `^` | Las actualizaciones deben ser una decisión revisable en un PR (ver 03) |
| Instalar `class-validator` y `class-transformer` | Son opcionales y la validación va con Zod (ver 08, decisión 3) |
| Instalar `@types/express` ahora | Ningún código lo usa todavía (YAGNI) |
| `@nestjs/cli` para compilar y arrancar | Añade una herramienta sin aportar nada: `tsc` y `node` bastan |
| `tsx` o esbuild para ejecutar | No generan la metadata de decoradores que Nest necesita |
| Un único `tsconfig.json` que emita archivos | Se separa la comprobación de tipos (incluirá las pruebas) de la compilación (solo `src/`) |

## 5. Cómo verificar

Hasta el paso 4, desde la raíz del repositorio:

```bash
pnpm -r list --depth -1
pnpm -F @manos/api typecheck
pnpm exec tsc -p apps/api/tsconfig.json --showConfig
pnpm -F @manos/api build
head -5 apps/api/dist/main.js
pnpm -F @manos/api start      # en otra terminal: curl -i localhost:3000
pnpm exec prettier --check apps/api docs
git status -sb
```

Esperado:

- `pnpm -r list` muestra `manos` y `@manos/api`.
- `typecheck` termina **sin salida**: en la terminal, silencio es éxito.
- `--showConfig` muestra `"module": "nodenext"`, `"moduleResolution": "nodenext"`, `"strict": true` y `"verbatimModuleSyntax": true`.
- `build` crea `dist/main.js`, con el import `./app.module.js`.
- `start` imprime `Nest application successfully started`, y `curl` devuelve `404 Not Found` con `{"message":"Cannot GET /","error":"Not Found","statusCode":404}`. Un 404 con ese JSON confirma que Express y Nest atienden peticiones: solo falta una ruta.
- `prettier --check` dice `All matched files use Prettier code style!`.
- `dist/` **no** aparece en `git status` (está ignorada).

## 6. Trampas conocidas

- **Sangría del editor.** Si el editor indenta con 4 espacios o expande arrays, `prettier --check` falla y la CI también (`format:check`). Se arregla con `pnpm exec prettier --write <archivo>` y configurando el editor a 2 espacios.
- **`TS18003: No inputs were found`.** `tsc -p apps/api/tsconfig.json`, incluso con `--showConfig`, falla mientras `src/` esté vacía. No es un error de configuración.
- **`ERR_MODULE_NOT_FOUND ... app.module`.** Falta la extensión `.js` en un import relativo.
- **`EADDRINUSE: address already in use :::3000`.** Otro proceso usa el puerto o quedó abierto el servidor anterior.
- **`Cannot find module './dist/main.js'`.** Se ejecutó `start` antes de `build`.
- **JSON roto en `package.json`.** Una coma de más o de menos al añadir `scripts`. pnpm lo señala con `ERR_PNPM_JSON_PARSE`.
- **`nodenext` con `Bundler`.** TypeScript da error si se mezclan. Hay que cambiar `module` y `moduleResolution` a la vez.
- **`verbatimModuleSyntax` y decoradores.** Las clases que se inyectan por constructor deben importarse con `import`, **no** con `import type`, porque Nest necesita el valor en tiempo de ejecución.
- **TypeScript 7.** Existe en npm, pero el repositorio usa 6.0.3 por incompatibilidad con `typescript-eslint` (ver 04).
