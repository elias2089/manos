# 10. API base: esqueleto de NestJS

PR: `feat/api-base`. Archivos nuevos: `apps/api/`. Cambios en `pnpm-lock.yaml`.

> **Estado: en construcción.** Este documento se completa paso a paso, en el mismo PR que el código. Cubre hasta el paso 7 (reloj inyectable). Las secciones de configuración, logs, `Clock`, `/health` y pruebas se añaden al cerrar cada paso.

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
| **Variable de entorno** | Valor que el sistema operativo entrega a un programa (`PORT=4000`). Permite cambiar la configuración sin tocar el código |
| **Esquema (Zod)** | Descripción de cómo debe verse un dato. Aquí describe el conjunto de variables de entorno |
| **Coerción** | Convertir un valor al tipo esperado. Las variables de entorno siempre llegan como texto, y `"3000"` hay que convertirlo al número `3000` |
| **Fail fast** | Fallar pronto y con un mensaje claro: es mejor que la API muera al arrancar que descubrir en producción que falta una variable (OWASP A05) |
| **`ConfigService`** | Clase de `@nestjs/config` que entrega los valores de configuración al código |
| **Prueba unitaria** | Código que ejecuta una pieza pequeña y comprueba que devuelve lo esperado |
| **Vitest** | El ejecutor de pruebas. Es el oficial para proyectos ESM de NestJS 12 |
| **SWC** | Compilador de TypeScript muy rápido que, a diferencia del de Vitest por defecto, conserva la metadata de decoradores |
| **Cobertura (coverage)** | Porcentaje del código que ejecutaron las pruebas |
| **`*.spec.ts`** | Nombre convencional de un archivo de pruebas, junto al código que prueba |
| **Clase abstracta** | Clase que declara qué métodos existen sin implementarlos. No se instancia: otras clases la extienden |
| **Token de inyección** | La "etiqueta" con la que Nest identifica qué entregar cuando una clase pide una dependencia |
| **Provider** | Algo que Nest sabe construir y entregar |
| **`useClass`** | "Cuando alguien pida este token, entrega una instancia de esta clase" |
| **Módulo global (`@Global`)** | Sus providers están disponibles en toda la app sin importar el módulo en cada sitio |
| **Reloj falso (fake)** | Versión de `Clock` para pruebas cuya hora se controla y se puede adelantar |
| **`override`** | Marca que un método reemplaza al de la clase padre. `noImplicitOverride` obliga a escribirlo |

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

### Paso 5. Configuración validada con Zod

```bash
pnpm add -F @manos/api --save-exact zod@4.6.7 @nestjs/config@12.0.1
```

`apps/api/src/config/env.schema.ts`:

```ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
```

`apps/api/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // The path is relative to the working directory (apps/api when run with pnpm -F)
      envFilePath: '../../.env',
      validate: validateEnv,
    }),
  ],
})
export class AppModule {}
```

`apps/api/src/main.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}

await bootstrap();
```

Variables nuevas en `.env.example` (y en el `.env` local, que git ignora):

```
# --- API (apps/api) ---
NODE_ENV=development
PORT=3000
```

| Parte | Qué hace |
|---|---|
| `z.enum([...])` | Solo acepta esos tres textos |
| `z.coerce.number().int().min(1).max(65535)` | Convierte el texto a número y exige un entero que sea un puerto válido |
| `.default(3000)` | Si `PORT` no existe, vale 3000 |
| `z.infer<typeof envSchema>` | Saca el tipo TypeScript del esquema: una sola definición, sin escribir el tipo a mano |
| `safeParse` | Valida sin lanzar excepción y devuelve `success` o `error` |
| `z.prettifyError` | Convierte el error en texto legible con la variable culpable |
| `validate: validateEnv` | Nest llama a esta función al arrancar. Si lanza, la aplicación aborta |
| `isGlobal: true` | `ConfigModule` queda disponible en toda la app sin importarlo en cada módulo |
| `ConfigService<Env, true>` | El `true` hace que `get` nunca devuelva `undefined`. Con `infer`, el tipo sale del esquema |
| `import type { Env }` | `Env` es solo un tipo: se importa como tipo por `verbatimModuleSyntax` |

**Decisiones de diseño.**

- **`NODE_ENV` es obligatoria, sin valor por defecto.** Si faltara en producción y se asumiera `development`, la API correría en modo desarrollo sin avisar.
- **`PORT` es opcional, con 3000 por defecto.** Un puerto por defecto no es peligroso.
- **Un solo `.env`, el de la raíz.** Docker Compose ya lo lee. Como `envFilePath` es relativo al directorio de trabajo (`apps/api` con `pnpm -F`), la ruta es `../../.env`. Si el archivo no existe (CI, producción), `@nestjs/config` lo ignora y usa las variables del entorno.
- **Cada variable entra con el commit que la usa**, como pide `.env.example`. `LOG_LEVEL` llega con pino.
- **Una variable del shell tiene prioridad sobre el `.env`**: `PORT=4000 pnpm -F @manos/api start` usa 4000.

### Paso 6. Vitest con SWC y la prueba del esquema

```bash
pnpm add -F @manos/api -D --save-exact vitest@5.0.4 unplugin-swc@2.0.0 @swc/core@1.16.18 @vitest/coverage-v8@5.0.4
```

`@swc/core` es peer dependency obligatoria de `unplugin-swc`.

`apps/api/vitest.config.ts`:

```ts
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
```

`apps/api/src/config/env.schema.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

describe('validateEnv', () => {
  it('accepts a valid configuration and converts the port to a number', () => {
    expect(validateEnv({ NODE_ENV: 'production', PORT: '4000' })).toEqual({
      NODE_ENV: 'production',
      PORT: 4000,
    });
  });

  it('uses 3000 when PORT is missing', () => {
    expect(validateEnv({ NODE_ENV: 'development' }).PORT).toBe(3000);
  });

  it('requires NODE_ENV', () => {
    expect(() => validateEnv({})).toThrow('NODE_ENV');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' })).toThrow('NODE_ENV');
  });

  it.each(['abc', '', '0', '65536', '3000.5'])('rejects the invalid port "%s"', (port) => {
    expect(() => validateEnv({ NODE_ENV: 'test', PORT: port })).toThrow('PORT');
  });
});
```

Scripts nuevos en `apps/api/package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage"
```

Cambios en los `tsconfig`:

- `tsconfig.json`: `"include": ["src", "vitest.config.ts"]`, para que la comprobación de tipos revise también la configuración de Vitest.
- `tsconfig.build.json`: añade `"include": ["src"]` y `"exclude": ["src/**/*.spec.ts"]`. Un `include` en el archivo hijo **sustituye** al del padre. Sin esto, la compilación incluiría `vitest.config.ts`, que está fuera de `rootDir`, y fallaría; con el `exclude`, las pruebas no viajan a `dist/`.

| Parte | Qué hace |
|---|---|
| `include: ['src/**/*.spec.ts']` | Vitest solo ejecuta archivos `.spec.ts` dentro de `src` |
| `coverage.provider: 'v8'` | Mide cobertura con el motor de Node, sin instrumentar el código |
| `exclude: [..., 'src/main.ts']` | `main.ts` solo arranca la app y no se prueba con pruebas unitarias |
| `swc.vite({ module: { type: 'es6' } })` | Compila con SWC y fija la salida ESM para no heredar otro ajuste |
| `toEqual` | Compara el contenido de dos objetos |
| `toThrow('NODE_ENV')` | Comprueba que el error menciona la variable culpable |
| `''` y `'3000.5'` en `it.each` | Casos límite: `Number('')` es 0 y 3000.5 no es entero |

**Decisiones de diseño.**

- **Sin funciones globales.** La receta oficial de Nest activa `globals: true`; aquí se importan `describe`, `it` y `expect` de `vitest`. Evita configuración extra en el `tsconfig` y deja claro de dónde viene cada cosa.
- **Pruebas junto al código** (`env.schema.spec.ts`), regla del proyecto.
- **SWC desde ahora.** Esta prueba no lo necesita, pero las clases con inyección sí. Configurarlo ahora evita tocarlo después.

**La prueba demuestra que detecta fallos.** Al cambiar temporalmente `.min(1)` por `.min(0)`, fallaron exactamente las pruebas de los puertos `""` y `"0"`, las únicas que dependen de ese límite. Al deshacerlo, volvieron las 9 a verde.

### Paso 7. El reloj inyectable (`Clock`)

**El problema.** Docs/09 define reglas con tiempo: sesión que caduca tras 1 hora de inactividad, bloqueos de 15 minutos, verificaciones de 24 horas. Si el código llama a `new Date()` en medio de la lógica, la única forma de probar "pasó una hora" es esperar una hora. Si pide la hora a un `Clock`, las pruebas inyectan un reloj falso y lo adelantan a voluntad.

```bash
pnpm add -F @manos/api -D --save-exact @nestjs/testing@12.1.3
```

`@nestjs/testing` aporta `Test.createTestingModule`, que arma una mini-aplicación Nest para la prueba.

`apps/api/src/common/clock.ts`:

```ts
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  override now(): Date {
    return new Date();
  }
}
```

`apps/api/src/common/clock.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';

import { Clock, SystemClock } from './clock.js';

@Global()
@Module({
  providers: [{ provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class ClockModule {}
```

`apps/api/src/app.module.ts` importa `ClockModule` en su lista `imports`, junto a `ConfigModule`.

`apps/api/src/common/clock.spec.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { Clock, SystemClock } from './clock.js';
import { ClockModule } from './clock.module.js';

class FakeClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

@Injectable()
class ExpiryChecker {
  constructor(private readonly clock: Clock) {}

  isExpired(expiresAt: Date): boolean {
    return this.clock.now().getTime() >= expiresAt.getTime();
  }
}

const HOUR = 60 * 60 * 1000;

describe('SystemClock', () => {
  it('returns the current time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    const after = Date.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});

describe('ClockModule', () => {
  it('provides the system clock by default', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule],
    }).compile();

    expect(moduleRef.get(Clock)).toBeInstanceOf(SystemClock);
  });

  it('lets a test replace the clock and move time forward', async () => {
    const fake = new FakeClock(new Date('2026-01-01T10:00:00Z'));
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule],
      providers: [ExpiryChecker],
    })
      .overrideProvider(Clock)
      .useValue(fake)
      .compile();
    const checker = moduleRef.get(ExpiryChecker);
    const expiresAt = new Date('2026-01-01T11:00:00Z');

    expect(checker.isExpired(expiresAt)).toBe(false);

    fake.advance(HOUR);

    expect(checker.isExpired(expiresAt)).toBe(true);
  });
});
```

| Parte | Qué hace |
|---|---|
| `abstract class Clock` | Declara que cualquier reloj tiene un `now()` que devuelve una fecha, sin decir cómo |
| `SystemClock` | El reloj real |
| `{ provide: Clock, useClass: SystemClock }` | Cuando alguien pida `Clock`, Nest entrega un `SystemClock` |
| `exports: [Clock]` | Hace visible el provider fuera del módulo |
| `new Date(this.current)` | Devuelve una copia: un `Date` es mutable y no debe poder alterarse desde fuera |
| `ExpiryChecker` | Clase mínima que recibe un `Clock` por constructor. Imita lo que harán las sesiones reales |
| `.overrideProvider(Clock).useValue(fake)` | En la prueba, sustituye el reloj real por el falso |
| `fake.advance(HOUR)` | "Pasa una hora" sin esperar |
| `new Date('...Z')` | La `Z` indica UTC: la prueba da igual en cualquier zona horaria (ver 09, fechas en UTC) |

**Esta prueba también valida SWC.** Si no se generara la metadata de decoradores, Nest no sabría que `ExpiryChecker` necesita un `Clock` y fallaría con `Nest can't resolve dependencies`.

**Decisiones de diseño.**

- **Clase abstracta en lugar de interfaz.** Las interfaces de TypeScript desaparecen al compilar, así que Nest no puede usarlas como token: habría que inventar un `Symbol` y escribir `@Inject(SIMBOLO)` en cada uso. Una clase abstracta existe en tiempo de ejecución y sirve directamente como token.
- **Módulo global.** `Clock` se usará en casi todos los módulos (sesiones, límites, verificación). Importarlo en cada uno solo añade ruido.
- **`now()` devuelve un `Date` nuevo cada vez**, para que nadie modifique el estado interno del reloj.
- **El reloj falso vive en el archivo de pruebas.** Solo hay un uso. Se moverá a un archivo compartido cuando haya un segundo (YAGNI), probablemente con los escenarios de sesión.
- **Ubicación en `src/common/`**, según docs/09, sección 9.

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
| `NODE_ENV` con valor por defecto `development` | En producción, una variable ausente pasaría inadvertida y la API correría en modo desarrollo |
| Un `.env` propio en `apps/api` | Habría dos archivos de variables. El de la raíz ya lo usa Docker Compose |
| Validar `process.env` a mano, sin `@nestjs/config` | Se perdería `ConfigService` y su inyección (ver 08, decisión 10) |
| `class-validator` para validar la configuración | Ya se eligió Zod para validar en toda la API (ver 08, decisión 3) |
| `globals: true` en Vitest | Obliga a añadir tipos globales al `tsconfig` y oculta de dónde viene cada función |
| Llamar a `new Date()` directamente | No se puede probar el paso del tiempo sin esperarlo |
| Falsear el tiempo con `vi.useFakeTimers()` | Funciona para pruebas unitarias, pero no sirve para los escenarios de aceptación ni deja la hora como dependencia explícita |
| Interfaz `Clock` con un `Symbol` como token | Obliga a escribir `@Inject(SIMBOLO)` en cada uso. La clase abstracta es su propio token |
| Mover `FakeClock` a un archivo compartido ahora | Hay un solo uso (YAGNI) |
| Jest en lugar de Vitest | Vitest es el ejecutor por defecto de los proyectos ESM de Nest 12 (ver 08, decisión 1) |

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

Configuración y pruebas (pasos 5 y 6):

```bash
PORT=4000 pnpm -F @manos/api start     # curl -i localhost:4000 -> 404
NODE_ENV=staging pnpm -F @manos/api start
PORT=abc pnpm -F @manos/api start
pnpm -F @manos/api test
pnpm -F @manos/api test:cov
ls apps/api/dist/config
pnpm test
```

Esperado:

- Con `PORT=4000` la API responde en ese puerto, lo que demuestra que la variable del shell gana al `.env`.
- Con `NODE_ENV=staging` la API **no arranca** y muestra `Invalid environment variables:`, `✖ Invalid option: expected one of "development"|"test"|"production"` y `→ at NODE_ENV`.
- Con `PORT=abc` el error señala `→ at PORT`.
- `test` termina con `1 passed` en archivos y `9 passed` en pruebas.
- `test:cov` muestra 100% en `env.schema.ts`. La carpeta `coverage/` está en `.gitignore`.
- `dist/config` contiene `env.schema.js` y su `.map`, **sin ningún `.spec.js`**.
- `pnpm test` desde la raíz ejecuta las pruebas a través de Turbo. En la segunda ejecución, Turbo las toma de la caché (`FULL TURBO`).
- **Prueba del `Clock` (paso 7):** `test` muestra `2 passed` en archivos y `12 passed` en pruebas. `dist/common` contiene `clock.js` y `clock.module.js`, sin ningún `.spec.js`. `pnpm lint:root` no da errores y la API sigue arrancando con `ClockModule` cargado.
- **Prueba que falla a propósito:** cambiar `.min(1)` por `.min(0)` en el esquema hace fallar las pruebas de los puertos `""` y `"0"`. Debe deshacerse el cambio después.

## 6. Trampas conocidas

- **Sangría del editor.** Si el editor indenta con 4 espacios o expande arrays, `prettier --check` falla y la CI también (`format:check`). Se arregla con `pnpm exec prettier --write <archivo>` y configurando el editor a 2 espacios.
- **`TS18003: No inputs were found`.** `tsc -p apps/api/tsconfig.json`, incluso con `--showConfig`, falla mientras `src/` esté vacía. No es un error de configuración.
- **`ERR_MODULE_NOT_FOUND ... app.module`.** Falta la extensión `.js` en un import relativo.
- **`EADDRINUSE: address already in use :::3000`.** Otro proceso usa el puerto o quedó abierto el servidor anterior.
- **`Cannot find module './dist/main.js'`.** Se ejecutó `start` antes de `build`.
- **`NODE_ENV` no definida.** Si falta en el `.env` local, la API no arranca. Es el comportamiento buscado, no un fallo.
- **Valor inválido en la plantilla.** Escribir `NODE_ENV=dev` en `.env.example` produce una API que no arranca para quien copie la plantilla. Los valores válidos son `development`, `test` y `production`.
- **`envFilePath` depende del directorio de trabajo.** `node apps/api/dist/main.js` ejecutado desde la raíz no encuentra el `.env`. Se debe usar `pnpm -F @manos/api start`.
- **Prettier no entiende `.env.example`.** `prettier --write .env.example` falla con `No parser could be inferred`. Ese archivo se revisa a ojo y `pnpm format:check` ya lo ignora.
- **Secretos en los mensajes de error.** Hoy `NODE_ENV` y `PORT` no son secretos. Al añadir contraseñas o claves hay que comprobar que el mensaje de error no las imprima.
- **`Cannot find package '@swc/core'`.** Falta instalarlo: es peer dependency de `unplugin-swc`.
- **`vitest.config.ts` rompe `pnpm build`.** Ocurre si `tsconfig.build.json` no sustituye el `include` heredado: el archivo queda fuera de `rootDir`.
- **Una prueba que nunca falla no demuestra nada.** Conviene romper el código a propósito una vez y comprobar que la prueba lo detecta.
- **`import type { Clock }` rompe la inyección.** Un `import type` se borra al compilar y Nest necesita la clase real en tiempo de ejecución: falla con `Nest can't resolve dependencies`. Las clases que se inyectan por constructor se importan con `import` normal (efecto de `verbatimModuleSyntax`).
- **Olvidar `override`.** `noImplicitOverride` exige marcar el método que reemplaza al de la clase padre.
- **`Nest can't resolve dependencies of the ExpiryChecker`.** Falta `providers: [ExpiryChecker]` en el módulo de prueba o falta `@Injectable()`.
- **`export class ClockModule { }` con un espacio dentro de las llaves.** `prettier --check` lo marca; el formato correcto es `{}`. Las clases vacías con decorador son habituales en Nest y es fácil escribirlas con espacio.
- **JSON roto en `package.json`.** Una coma de más o de menos al añadir `scripts`. pnpm lo señala con `ERR_PNPM_JSON_PARSE`.
- **`nodenext` con `Bundler`.** TypeScript da error si se mezclan. Hay que cambiar `module` y `moduleResolution` a la vez.
- **`verbatimModuleSyntax` y decoradores.** Las clases que se inyectan por constructor deben importarse con `import`, **no** con `import type`, porque Nest necesita el valor en tiempo de ejecución.
- **TypeScript 7.** Existe en npm, pero el repositorio usa 6.0.3 por incompatibilidad con `typescript-eslint` (ver 04).
