# 11. Prisma y Mailpit: base de datos y correo local

PR 2a (#17, fusionado): rama `feat/prisma-and-mailpit`, commits 1 y 2. PR 2b: rama `feat/data-model`, commits 3 y 4 (esquema, migración y datos iniciales). PR 2c: rama `feat/db-tests`, commits 5 a 7 (pruebas contra PostgreSQL, cierre de la documentación y Cucumber). Cambios en `docker-compose.yml`, `apps/api/` (`prisma/`, `src/prisma/`, `src/test/`, `prisma.config.ts`, configuración y pruebas), `turbo.json`, el `package.json` raíz, `eslint.config.mjs`, `.gitignore`, `.prettierignore`, `.env.example` y `.github/workflows/ci.yml`.

> **Estado: en construcción.** Este documento crece con cada commit. Hoy cubre los pasos 1 a 13 (Mailpit, Prisma instalado, `DATABASE_URL`, la conexión, el esquema, la primera migración, los datos iniciales y las pruebas contra PostgreSQL, también en la CI). Al cerrar el PR 2c se completan las secciones de pendientes y de cómo repetirlo, y se quita este aviso.

## 1. Objetivo

Que la API se conecte a PostgreSQL con Prisma, que la base tenga las tablas diseñadas en 09 con su primera migración, que carguen los datos iniciales (ocho categorías y las 16 alcaldías de la Ciudad de México) y que los correos de prueba se puedan leer en Mailpit.

Orden de los commits:

| # | Commit | Qué queda funcionando |
|---|---|---|
| 1 | Mailpit en el compose | Se envía un correo de prueba por SMTP y se lee en el navegador |
| 2 | Prisma y conexión a PostgreSQL | La API arranca conectada a la base |
| 3 | Modelo de datos y primera migración | Las tablas existen en la base |
| 4 | Datos iniciales | Categorías y alcaldías, ejecutables varias veces sin duplicar |
| 5 | Pruebas contra la base | Pruebas con un PostgreSQL real, también en la CI |
| 6 | Documentación | Este documento completo y las correcciones de 08 y 09 |
| 7 | Cucumber | La prueba mínima del riesgo aplazado desde el PR 1, al final del PR |

**Decisiones del PR.** El trabajo se pensó como un solo PR, pero se partió en tres para mantener cada revisión por debajo de unas 400 líneas escritas a mano: tras fusionar los commits 1 y 2 (#17), el PR 2b (`feat/data-model`) lleva el esquema, la migración y los datos iniciales, y el PR 2c (`feat/db-tests`) las pruebas contra PostgreSQL, la CI y el cierre. Como el repositorio usa *squash merge*, la rama del PR 2c se reubica sobre `main` con `git rebase --onto main feat/data-model feat/db-tests` cuando se fusiona el 2b. Ocho categorías iniciales: Plomería, Electricidad, Limpieza, Pintura, Carpintería, Jardinería, Cerrajería y Aire acondicionado.

## 2. Glosario

| Término | Significado |
|---|---|
| **SMTP** | El protocolo con el que los programas **envían** correo. Es como el cartero que recoge el sobre |
| **Servidor de correo** | Programa que recibe esos correos y los entrega. Los reales los mandan al destinatario de verdad |
| **Mailpit** | Servidor de correo **falso**, solo para desarrollo: recibe todo, no entrega nada y muestra los mensajes en una página web local |
| **Puerto 1025 y puerto 8025** | El 1025 es donde la API entrega los correos (SMTP). El 8025 es la página web y una API para leerlos |
| **Imagen *scratch*** | Imagen que contiene solo un binario, sin `sh` ni utilidades. La de Mailpit es así |
| **Forma exec** | Escribir un comando como lista (`['CMD', '/mailpit', 'readyz']`) en lugar de una cadena que interpreta un shell |
| **Digest** | El hash `sha256:...` que hace inmutable una imagen, a diferencia de una etiqueta (tag) |
| **Healthcheck** | Comando que Docker ejecuta cada pocos segundos para saber si el servicio funciona de verdad |
| **ORM** | Librería que traduce entre el código y la base de datos. Se escribe `prisma.user.findUnique(...)` y ella genera el SQL, con consultas parametrizadas que protegen contra inyección SQL (OWASP A03) |
| **Esquema de Prisma (`schema.prisma`)** | El archivo donde se describen las tablas. De él salen el cliente y las migraciones |
| **Cliente generado** | Código TypeScript que Prisma escribe a partir del esquema. En la versión 7 se escribe dentro del proyecto (`src/generated/`), no en `node_modules` |
| **Generador (`generator`)** | El bloque del esquema que dice cómo y dónde generar el cliente |
| **Adaptador de driver (`@prisma/adapter-pg`)** | En Prisma 7 el cliente no trae su propio motor: se conecta a PostgreSQL a través del driver `pg` mediante este adaptador |
| **Migración** | Archivo SQL versionado que cambia la estructura de la base |
| **`prisma.config.ts`** | La configuración del **CLI** de Prisma: dónde está el esquema, dónde van las migraciones y cuál es la URL de la base |
| **`process.loadEnvFile`** | Función de Node que carga un archivo `.env` en `process.env`. Prisma 7 no carga el `.env` por sí solo |
| **URL de conexión** | Una cadena con todo lo necesario para llegar a la base: `postgresql://usuario:contraseña@host:puerto/base` |
| **Porcentaje-codificar** | Escribir caracteres como `@`, `/`, `#` o `:` de una contraseña como `%40`, `%2F`, `%23` y `%3A` para que la URL se interprete bien |
| **Conexión perezosa (*lazy*)** | El cliente no se conecta hasta la primera consulta |
| **Fail fast** | Que un fallo de infraestructura detenga la API antes de aceptar tráfico, no en mitad de una petición |
| **Ciclo de vida (`OnModuleInit`, `OnModuleDestroy`)** | Métodos que Nest ejecuta solos al arrancar y al cerrar un módulo |
| **`enableShutdownHooks`** | Hace que Nest cierre los módulos ordenadamente al recibir `SIGTERM` o `Ctrl+C` |
| **Enum** | Lista cerrada de valores permitidos. En PostgreSQL es un tipo propio y la base rechaza lo que no esté en la lista |
| **Clave foránea (FK)** | Columna que apunta al `id` de otra tabla; la base rechaza un valor que no exista allí |
| **`onDelete`** | Qué hace la base al borrar la fila referenciada: `Cascade` borra las dependientes, `Restrict` se niega, `SetNull` vacía la columna |
| **Tabla puente** | Resuelve una relación de muchos a muchos con una fila por cada par (proveedor, categoría) |
| **Autorrelación** | Una tabla cuya clave foránea apunta a sí misma, como `RefreshToken.replacedById` |
| **`CHECK`** | Regla que la base exige a cada fila, como `email = lower(email)` |
| **`jsonb`** | Columna que guarda un objeto JSON ya interpretado, que se puede consultar por dentro |
| **Shadow database** | Base temporal que `migrate dev` crea y borra para calcular y validar el SQL de una migración |
| **`--create-only`** | Genera la migración sin aplicarla, para leerla y editarla antes |
| **Prueba de integración** | Ejecuta varias piezas reales juntas, aquí el cliente de Prisma contra una base PostgreSQL de verdad. Una base simulada no probaría un `CHECK` ni un `ON DELETE` |
| **Aislamiento entre pruebas** | Que cada prueba empiece desde el mismo estado conocido, para que no dependan del orden |
| **`globalSetup`** | Archivo de Vitest cuya función `setup()` corre una vez, en el proceso principal, antes de crear los workers |
| **`migrate deploy`** | Aplica las migraciones pendientes sin generar nada ni preguntar. Es el comando de la CI y de producción |
| **`TRUNCATE`** | Vacía tablas de golpe. Con `CASCADE` vacía también las que las referencian |
| **Contenedor de servicio** | Contenedor que GitHub arranca junto al trabajo de la CI y mantiene mientras corren los pasos |
| **Comprobación de salud** | Comando que se repite hasta que el servicio responde. El trabajo espera a que pase |
| **Prueba de mutación** | Romper el código a propósito para confirmar que una prueba falla. Si no falla, no protege nada |
| **Tarea de Turbo (`generate`)** | Un paso con nombre que Turbo ejecuta antes de otros, para que `typecheck`, `build` y `test` siempre tengan el cliente generado |

## 3. Qué se hizo, paso a paso

### Paso 1. Mailpit en el compose

```bash
git switch -c feat/prisma-and-mailpit
```

`docker-compose.yml`, servicio nuevo después de `redis` y antes de `volumes:`:

```yaml
  mailpit:
    # Test mail server: it receives every email and delivers none.
    # Read the messages at http://127.0.0.1:8025
    image: axllent/mailpit:v1.31.5@sha256:94f6b70c1436defae6799d9ac7ff0eeff9540465b842026d5cdb018f1c0234ea
    restart: unless-stopped
    ports:
      # SMTP: where the API sends mail
      - '127.0.0.1:1025:1025'
      # Web interface and API: where the messages are read
      - '127.0.0.1:8025:8025'
    security_opt:
      - no-new-privileges:true
    healthcheck:
      # The image has no shell, so the exec form is required (CMD-SHELL would fail)
      test: ['CMD', '/mailpit', 'readyz']
      interval: 5s
      timeout: 3s
      retries: 10
```

| Parte | Qué hace |
|---|---|
| `image: ...@sha256:...` | Fija versión legible (`v1.31.5`) e imagen inmutable (digest) |
| `restart: unless-stopped` | Se reinicia si falla, salvo que se detenga a propósito |
| `127.0.0.1:1025:1025` | Publica el puerto 1025 del contenedor solo en la máquina local |
| `no-new-privileges` | El proceso no puede ganar privilegios adicionales |
| `['CMD', '/mailpit', 'readyz']` | Ejecuta `/mailpit readyz` cada 5 s: sale con código 0 si el servidor responde |
| Sin `volumes` ni `environment` | No hay nada que guardar ni que configurar |

**Qué se comprobó de la imagen** (descargada con su digest e inspeccionada):

| Dato | Resultado |
|---|---|
| Versión | `v1.31.5`, la última (publicada el 11-oct-2026), según la API de releases de GitHub |
| Digest | `sha256:94f6b70c…234ea`, obtenido con `docker buildx imagetools inspect` |
| Entrada y puertos | Entrypoint `/mailpit`; puertos 1025 (SMTP), 8025 (web) y 1110 (POP3, que no se usa) |
| Healthcheck | La imagen ya trae `/mailpit readyz`; se declara también en el compose por coherencia con los otros servicios |
| Shell | No tiene: de ahí la forma exec |

**Decisiones de diseño.**

- **Puertos solo en `127.0.0.1`**, como PostgreSQL y Redis. Sin eso, Docker los expondría a toda la red.
- **Sin volumen.** Los correos de prueba son desechables: se pierden al recrear el contenedor.
- **Sin variables en `.env`.** Mailpit no necesita credenciales en desarrollo. Las variables del correo llegarán con el módulo de correo (PR 3).
- **Healthcheck explícito**, aunque la imagen ya trae uno: deja el intervalo visible y `pnpm services:up` espera a que esté sano.
- **Solo `no-new-privileges` como endurecimiento**, igual que los demás servicios. Es una herramienta local de desarrollo.

### Paso 2. Instalar Prisma y generar el cliente

```bash
pnpm add -F @manos/api --save-exact @prisma/client@7.10.0 @prisma/adapter-pg@7.10.0 pg@8.23.1
pnpm add -F @manos/api -D --save-exact prisma@7.10.0 @types/pg@8.23.1
```

`prisma` es el CLI (solo desarrollo); `@prisma/client` y el adaptador van a producción. La etiqueta `latest` del paquete `prisma` apunta a `8.0.0-rc.22`, un candidato a release: se fija la 7.10.0 exacta, y el aviso que imprime el CLI sugiriendo `prisma@latest` se ignora.

`apps/api/prisma/schema.prisma`:

```prisma
generator client {
  provider            = "prisma-client"
  output              = "../src/generated/prisma"
  moduleFormat        = "esm"
  importFileExtension = "js"
}

datasource db {
  provider = "postgresql"
}
```

`apps/api/prisma.config.ts` (en la raíz del paquete, **no** dentro de `prisma/`):

```ts
import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env files. The path is relative to the working directory
// (apps/api when run with pnpm -F), the same one ConfigModule reads. In CI and production
// the file does not exist and the variables come from the environment.
if (existsSync('../../.env')) {
  process.loadEnvFile('../../.env');
}

const url = process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // exactOptionalPropertyTypes: an undefined url must be left out, not set to undefined
  ...(url ? { datasource: { url } } : {}),
});
```

Otros cambios del paso:

- `apps/api/package.json`: script `"generate": "prisma generate"`.
- `apps/api/tsconfig.json`: `"include": ["src", "vitest.config.ts", "prisma.config.ts"]`. `tsconfig.build.json` conserva su `include: ["src"]`.
- Se ignora el cliente generado (`apps/api/src/generated/`) en `.gitignore` y `.prettierignore`, y `'**/generated/'` en `globalIgnores` de `eslint.config.mjs`.

| Parte | Qué hace |
|---|---|
| `provider = "prisma-client"` | El generador moderno de Prisma 7 (sin `-js` al final) |
| `output` | Dónde escribe el cliente. Es **obligatorio**; la ruta es relativa al esquema |
| `moduleFormat = "esm"` e `importFileExtension = "js"` | Módulos ES con imports terminados en `.js`, como exige `nodenext` |
| `datasource` sin `url` | En Prisma 7 la URL vive en `prisma.config.ts` |
| `existsSync` + `loadEnvFile` | Carga el `.env` de la raíz solo si existe, sin instalar `dotenv` y sin un `catch` vacío |
| `...(url ? { datasource: { url } } : {})` | Con `exactOptionalPropertyTypes` no se puede asignar `undefined` a `url`; se omite el bloque entero |

**Qué se probó antes de escribirlo** (en un proyecto desechable fuera del repositorio, con las mismas banderas estrictas):

| Punto sin verificar de 09 | Resultado |
|---|---|
| `@db.Timestamptz(3)` y `@default(uuid(7))` en 7.10.0 | Válidos |
| `datasource` sin `url` | Funciona; la URL va en `prisma.config.ts` |
| El cliente generado frente a `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`... | Compila sin errores: los archivos generados llevan `// @ts-nocheck` y `/* eslint-disable */` |
| `prisma generate` sin modelos y sin `DATABASE_URL` | Funciona (importa para la CI) |
| `prisma migrate` sin URL | Falla con un mensaje claro: `The datasource.url property is required` |
| `url: process.env['DATABASE_URL']` | **No compila** con `exactOptionalPropertyTypes` (`TS2375`): de ahí el `spread` condicional |

**Decisiones de diseño.**

- **`process.loadEnvFile` en lugar de `dotenv`:** sin dependencia nueva y con la misma ruta que `ConfigModule`.
- **El cliente generado no se versiona:** es código derivado del esquema y se regenera.
- **Esquema sin modelos en este paso:** los modelos llegan con la migración.

### Paso 3. `DATABASE_URL` en la configuración validada

`apps/api/src/config/env.schema.ts` añade al esquema:

```ts
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'Expected a PostgreSQL URL like postgresql://user:password@host:5432/database',
  }),
```

`.env.example`, bajo la sección de la API (en el `.env` local va la misma línea con los valores reales):

```
# PostgreSQL connection URL. The user, password and database must match POSTGRES_* above.
# Use 127.0.0.1, not localhost: the compose file publishes the port on IPv4 only.
DATABASE_URL=postgresql://manos:change-me@127.0.0.1:5432/manos
```

`apps/api/src/config/env.schema.spec.ts` parte ahora de una configuración mínima válida (`validConfig`, con una contraseña de prueba larga y única, `secret-db-password`) y añade cuatro casos: `DATABASE_URL` obligatoria, tres URL inválidas (`mysql://...`, `not a url` y cadena vacía) y que **el mensaje de error nunca contiene la contraseña**:

```ts
  it('never prints the password of an invalid database URL', () => {
    const invalid = { ...validConfig, DATABASE_URL: `mysql://manos:${SECRET}@127.0.0.1:3306/manos` };

    expect(() => validateEnv(invalid)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(SECRET) }),
    );
  });
```

| Parte | Qué hace |
|---|---|
| `z.url({ protocol })` | Exige una URL bien formada con protocolo `postgres` o `postgresql` |
| `error: '...'` | Mensaje propio, más útil que `Invalid URL`; el ejemplo lleva valores de relleno y nunca el valor recibido |
| `expect.objectContaining({ message: expect.not.stringContaining(SECRET) })` | Exige que **lance** un error **cuyo mensaje no contiene** la contraseña. Si no lanzara, la prueba también fallaría |

Con la variable nueva, las pruebas del esquema pasan de 11 a 16 y el total, de 20 a 25.

**Decisión de diseño: la contraseña, duplicada.** La contraseña queda en dos sitios del `.env`: `POSTGRES_PASSWORD` (que lee Docker para crear la base) y dentro de `DATABASE_URL` (que lee la API).

| Opción | Cómo | Por qué sí o no |
|---|---|---|
| **A. Una `DATABASE_URL` completa** (elegida) | Se escribe la URL entera en el `.env` | Es lo que existe en producción: las plataformas entregan una sola `DATABASE_URL`. El código funciona igual en local y en producción. Coste: la contraseña aparece dos veces |
| B. Construir la URL en el código con `POSTGRES_*` | La API compone la URL a partir de variables sueltas | Una sola copia, pero hay que codificar bien la contraseña, dos sitios construyen la URL (la API y `prisma.config.ts`) y en producción habría que inventar las variables sueltas |

Para que no diverjan, `.env.example` lleva un comentario que dice que la contraseña debe coincidir.

### Paso 4. `PrismaService`, el módulo y la tarea `generate` de Turbo

`apps/api/src/prisma/prisma.service.ts`:

```ts
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';

import type { Env } from '../config/env.schema.js';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    const adapter = new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) });
    super({ adapter });
  }

  // With the pg adapter, $connect() does not open a connection. A real query makes the API
  // fail at startup when the database is unreachable instead of at the first request.
  async onModuleInit() {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

`apps/api/src/app.module.ts` importa `PrismaModule` en `imports`, entre `ClockModule` y `HealthModule`. `apps/api/src/main.ts` llama a `app.enableShutdownHooks();` justo después de `app.useLogger(...)`.

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "agentGuidance": false,
  "tasks": {
    "generate": {
      "outputs": ["src/generated/**"]
    },
    "build": {
      "dependsOn": ["^build", "generate"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck", "generate"]
    },
    "test": {
      "dependsOn": ["^build", "generate"],
      "outputs": ["coverage/**"]
    }
  }
}
```

El `package.json` raíz añade `"generate": "turbo run generate"`.

| Parte | Qué hace |
|---|---|
| `import { ..., type OnModuleDestroy }` | Con `verbatimModuleSyntax` las **interfaces** se importan con `type`; el ejemplo oficial de Nest, escrito sin esa bandera, no compilaría aquí |
| `import { ConfigService }` sin `type` | Es un valor: Nest lo necesita en tiempo de ejecución para inyectarlo |
| Código antes de `super(...)` | Permitido porque no usa `this` |
| `$queryRaw\`SELECT 1\`` | La consulta más barata que existe: comprueba que hay base de datos |
| `onModuleDestroy` + `$disconnect()` | Cierra el pool de conexiones al apagar |
| `@Global()` | `PrismaService` queda disponible en toda la app sin importar el módulo cada vez |
| `generate: { outputs }` | Turbo guarda lo que genera en su caché y lo restaura si el esquema no cambió |
| `"dependsOn": ["^build", "generate"]` | `^build` es "primero el `build` de mis dependencias"; `generate` es "primero mi propio `generate`" |

**Hallazgo: con el adaptador `pg`, `$connect()` no conecta.** Se comprobó en un proyecto desechable: contra un puerto cerrado, `$connect()` se resuelve sin error (es perezoso) y la primera consulta falla con `Can't reach database server`. El ejemplo oficial de Nest conecta solo con `$connect()`, y con este adaptador no detectaría una base caída al arrancar. Por eso `onModuleInit` hace una consulta real.

**Verificado con la base caída.** Con los contenedores parados (WSL se reinició), la API **no arrancó**: error `Can't reach database server at 127.0.0.1:5432` y código de salida 1. Con una contraseña incorrecta, el error es `password authentication failed for user "manos"` (código `28P01`). En ninguno de los dos casos aparece la URL ni la contraseña en la salida.

**Decisiones de diseño.**

- **`PrismaService extends PrismaClient`:** el patrón de la documentación de Nest y de Prisma 7.
- **`@Global()`:** todo servicio de datos lo necesitará, como `ConfigModule` y `ClockModule`.
- **La URL sale de `ConfigService`**, ya validada con Zod: no se lee `process.env` a mano.
- **Tarea `generate` en Turbo y no un `postinstall`:** se regenera sola cuando cambia el esquema y cubre la CI sin tocar el workflow. Un `postinstall` sería redundante y haría la instalación más lenta.
- **Desventaja conocida:** un comando directo (`pnpm -F @manos/api test`) en una instalación limpia no pasa por Turbo y no encuentra el cliente. Basta con `pnpm generate` o con cualquier script de la raíz.

### Paso 5. El esquema: 5 enums y 10 modelos

```bash
git switch main && git pull
git switch -c feat/data-model
```

El esquema vive en `apps/api/prisma/schema.prisma` y sigue 09, sección 4. Ese archivo es la fuente de verdad; aquí se explican las decisiones que no se deducen leyéndolo. Se escribió por bloques (enums y `User`, tokens, proveedor y catálogos, auditoría y contacto) y se validó con `pnpm -F @manos/api exec prisma validate` tras cada uno. Los campos de relación inversa (`User.refreshTokens`...) se añaden a la vez que el modelo del otro lado: Prisma no valida una relación con un solo extremo.

| Decisión | Resultado | Motivo |
|---|---|---|
| Tipo de los identificadores | `@id @default(uuid(7)) @db.Uuid` en todos los `id` y claves foráneas | Columna `uuid` nativa de 16 bytes en lugar de `text` de 36; la versión 7 es ordenable por tiempo y da mejores índices. Prisma la genera en el cliente: la columna **no tiene `DEFAULT`** en SQL |
| Fechas | `@db.Timestamptz(3)` | Un instante sin ambigüedad (09, sección 7). `@updatedAt` tampoco tiene `DEFAULT`: lo rellena el cliente |
| Índices de `RefreshToken` | `(userId, familyId)`, `(familyId)` y `(expiresAt)` | Revocar una familia filtra solo por `familyId`, y un compuesto no la serviría. `expiresAt` permite limpiar tokens vencidos |
| `RefreshToken.replacedById` | Autorrelación con clave foránea, `@unique` y `onDelete: SetNull` | Garantiza integridad. `@unique` porque un token se canjea una sola vez, y Prisma lo exige en una relación 1 a 1. Se probó que borrar un usuario con tokens encadenados no se bloquea |
| Borrado | `Cascade` en los tokens y `Restrict` en las demás | Los tokens no tienen sentido sin su usuario; los usuarios no se borran, se anonimizan |
| `ProviderProfile.reviewedById` | `Restrict` escrito a mano | Al ser opcional, Prisma usaría `SetNull` por defecto y se perdería quién decidió |
| `User` y `ProviderProfile` | Dos relaciones con nombre: `ProviderOwner` y `ProviderReviewer` | Sin nombre, Prisma no distingue al dueño del revisor |
| `AuditLog.before` y `after` | `Json?` (`jsonb`) | El estado cambia de forma según la acción |
| `AuditLog.entityId` | `@db.Uuid` **sin** clave foránea | Apunta a cualquier tabla; la aplicación es la responsable de que exista |
| Nombres | Los de Prisma por defecto, sin `@@map` | Coinciden con 09. Obligan a escribir las tablas entre comillas en SQL a mano |
| Textos | `text` sin límite | Los límites se validan con Zod en la API |
| `ProviderProfile.description` | Opcional | Un perfil nuevo en `pending` puede existir sin texto |

### Paso 6. La primera migración

```bash
docker compose ps
pnpm -F @manos/api exec prisma migrate dev --create-only --name init
```

`--create-only` genera `apps/api/prisma/migrations/<fecha>_init/migration.sql` **sin aplicarlo**. Se hace así porque Prisma no sabe expresar una restricción `CHECK`, y esta debe estar en el archivo antes de aplicarlo: una migración ya aplicada no se puede editar (Prisma guarda su checksum). El SQL se revisó línea a línea: enums, tablas, índices y claves foráneas coinciden con las decisiones de arriba. Se añadió a mano, al final:

```sql
-- AddCheck
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" = lower("email"));
```

Junto con el `UNIQUE` de `email`, impide dos cuentas que solo se diferencien en mayúsculas aunque la aplicación se equivoque. Después:

```bash
pnpm -F @manos/api exec prisma migrate dev
pnpm generate
```

`migrate dev` aplica la migración (usa una *shadow database* temporal para validarla). En Prisma 7 **no regenera el cliente**, por eso `pnpm generate`.

**Comprobado contra la base real**, dentro de transacciones deshechas con `ROLLBACK`:

- El `CHECK` rechaza `Ana@Example.com` con `violates check constraint "User_email_lowercase_check"`.
- Borrar un usuario con dos `RefreshToken` encadenados por `replacedById` funciona: se borran los dos.
- Borrar un usuario con `ProviderProfile` falla por `RESTRICT`.
- Dos tokens con el mismo `replacedById` violan `RefreshToken_replacedById_key`.

**Sin índice a propósito:** `ProviderProfile.reviewedById` y `AuditLog.actorId` no tienen. PostgreSQL no indexa las claves foráneas por sí solo, pero ninguna consulta de la fase 1 filtra por ellas. Si aparece una pantalla de "decisiones de este administrador", se añade en una migración nueva.

### Paso 7. Los datos iniciales

`apps/api/src/prisma/seed-data.ts` contiene solo datos: las 8 categorías (Plomería, Electricidad, Limpieza, Pintura, Carpintería, Jardinería, Cerrajería y Aire acondicionado, con nombre en español y en inglés) y las 16 alcaldías de la Ciudad de México. El `slug` va en minúsculas, ASCII y con guiones, y el de las categorías **en inglés** (`plumbing`, `electrical`, `air-conditioning`) porque aparecerá en las rutas de la API. El de las alcaldías es el nombre sin acentos (`coyoacan`), por ser nombres propios. [Sin verificar] Los nombres de las alcaldías contra el catálogo oficial del INEGI.

`seed-data.spec.ts` comprueba, sin base de datos, que hay 8 y 16 filas, que todas las zonas son de la Ciudad de México y que los slugs son únicos y cumplen el formato `^[a-z]+(-[a-z]+)*$`. Un slug repetido se descubriría de otro modo al sembrar, por el `UNIQUE` de la base.

### Paso 8. La función que siembra y el programa que la ejecuta

Dos archivos, para poder probar la lógica sin lanzar un seed por accidente:

- `seed-catalogs.ts` exporta `seedCatalogs(prisma)`. Inserta las dos listas con `createMany({ skipDuplicates: true })` dentro de `$transaction([...])`: o entran las dos o ninguna. `skipDuplicates` es un solo `INSERT ... ON CONFLICT DO NOTHING`, así que es idempotente y **no pisa** lo que el administrador edite después. Devuelve cuántas filas se insertaron de verdad.
- `seed.ts` es el punto de entrada: crea un `PrismaClient` con el adaptador `pg` y `DATABASE_URL` del entorno, llama a la función y se desconecta en un `finally`. No arranca Nest.

| Decisión | Resultado | Motivo |
|---|---|---|
| Dónde vive el seed | `src/prisma/`, compilado con el `build` | Node no puede ejecutar el cliente generado: importa `./enums.js` y en disco solo existe `enums.ts` (`ERR_MODULE_NOT_FOUND`). Compilar evita añadir `tsx`, pasa por `typecheck` y lint, y funciona en producción sin dependencias de desarrollo |
| `data: [...CATEGORIES]` | Copia con spread | `createMany` espera un array normal y la constante es `readonly` |
| Seed automático en `migrate dev` | No existe | En Prisma 7 `migrate dev` y `migrate reset` ya no siembran: hay que ejecutarlo explícitamente |

### Paso 9. El script `seed`

En `apps/api/package.json`:

```json
"seed": "node --env-file-if-exists=../../.env dist/prisma/seed.js"
```

`--env-file-if-exists` carga el `.env` de la raíz solo si existe (la ruta es relativa a `apps/api`, igual que en `prisma.config.ts`); en producción y en la CI las variables vienen del entorno. Se ejecuta lo compilado, así que hay que hacer `pnpm build` antes y de nuevo si cambia `seed-data.ts`.

```bash
pnpm build
pnpm -F @manos/api seed
pnpm -F @manos/api seed
```

La primera ejecución imprime `Seed done: 8 categories and 16 zones inserted` y la segunda `Seed done: 0 categories and 0 zones inserted`.

### Paso 10. La base de pruebas y la configuración de Vitest

Las pruebas de integración no pueden usar la base de desarrollo, porque vacían las tablas. Se usa una base separada, `manos_test`, en el mismo contenedor, que se crea una sola vez:

```bash
docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" manos_test'
```

`TEST_DATABASE_URL` va en el `.env` (y su plantilla en `.env.example`) con las mismas credenciales que `DATABASE_URL` y la base `manos_test`.

| Pieza | Qué hace |
|---|---|
| `src/test/test-database-url.ts` | Carga el `.env` si existe y devuelve `TEST_DATABASE_URL`. Falla con un mensaje claro si falta o si el nombre de la base no termina en `_test` |
| `vitest.global-setup.ts` | Antes de cualquier prueba ejecuta `prisma migrate deploy` contra la base de pruebas. De paso demuestra que las migraciones se aplican a una base vacía |
| `vitest.config.ts` | Registra el `globalSetup` y desactiva `fileParallelism`: los archivos comparten una base y no pueden correr a la vez |
| `turbo.json` | Declara `TEST_DATABASE_URL` en la tarea `test`: Turbo 2 en modo estricto solo entrega las variables declaradas |
| `tsconfig.json` y `tsconfig.build.json` | El primero incluye el setup para `typecheck` y ESLint; el segundo excluye `src/test/` para que no se compile a `dist/` |

| Decisión | Resultado | Motivo |
|---|---|---|
| Base de las pruebas | Una base separada, `manos_test` | Limpiar la de desarrollo borraría el catálogo sembrado |
| Falta `TEST_DATABASE_URL` | La ejecución falla | Una prueba que se omite sola da una falsa confianza: una CI mal configurada saldría en verde |
| Nombre de la base | Debe terminar en `_test` | Evita vaciar por error la base de desarrollo si alguien pone su URL |
| Preparar el esquema | `prisma migrate deploy` en el `globalSetup` | Aplica las migraciones desde cero en cada base nueva |

**Hallazgos.**

- `process.loadEnvFile` **no pisa** las variables que ya existen en el entorno. Por eso `migrate deploy` usa la URL de pruebas aunque `prisma.config.ts` cargue el `.env`.
- El mensaje de error de `new URL(...)` incluye la entrada completa, contraseña incluida. El ayudante lo captura y lanza un mensaje fijo, para no filtrar la contraseña en la terminal ni en los registros de la CI.
- `globalSetup` corre una vez, antes de crear los workers, y también al lanzar una sola prueba: desde ahora **toda** ejecución de Vitest necesita la base arriba.

### Paso 11. El ayudante de las pruebas de base de datos

`src/test/test-database.ts` exporta dos funciones:

- `resetDatabase(prisma)` vacía todas las tablas excepto `_prisma_migrations`. Lo hace un bloque `DO $$ ... $$` que lee la lista de tablas de `pg_tables` y ejecuta un único `TRUNCATE ... CASCADE`. La sentencia es un texto fijo, sin interpolación, y una tabla nueva queda cubierta sin tocar el archivo. Una lista escrita a mano se olvidaría de alguna y las pruebas se contaminarían entre sí.
- `useTestDatabase()` crea un `PrismaClient` con el adaptador `pg` apuntando a la base de pruebas, registra un `beforeEach` que la vacía y un `afterAll` que cierra la conexión. Cada archivo de pruebas lo llama una vez.

Su propia prueba comprueba que se vacían también las filas enlazadas por claves foráneas y que `_prisma_migrations` se conserva. Con `noUncheckedIndexedAccess`, el resultado de `$queryRaw` se lee con `rows[0]?.applied`, no con `const [{ applied }]`.

### Paso 12. Las pruebas contra la base real

| Archivo | Qué demuestra |
|---|---|
| `seed-catalogs.spec.ts` (4 pruebas) | El seed inserta todo, no inserta nada la segunda vez, **conserva un nombre editado** después y completa solo las filas que faltan |
| `data-model.spec.ts` (7 pruebas) | El `CHECK` del correo, el correo único, la cascada de tokens encadenados, `replacedById` usado una sola vez, `Restrict` sobre el dueño del perfil y sobre el administrador que lo revisó, y el par proveedor-categoría sin repetir |

Los errores de la base se observaron contra `manos_test` antes de escribir las aserciones: un `CHECK` fallido llega como `P2039` (el mensaje contiene el nombre de la restricción), una clave única como `P2002` y una clave foránea como `P2003`. La prueba del administrador revisor protege el `Restrict` de `reviewedById` que hubo que escribir a mano, porque Prisma habría usado `SetNull` por defecto.

En total, 8 archivos y 42 pruebas.

### Paso 13. El servicio PostgreSQL en la CI

En `.github/workflows/ci.yml`, el trabajo `quality` arranca un contenedor `postgres` con la misma imagen y el mismo digest que `docker-compose.yml`, con `POSTGRES_DB=manos_test` y una comprobación de salud con `pg_isready`: el trabajo espera a que la base acepte conexiones antes de lanzar los pasos. `TEST_DATABASE_URL` se da **solo al paso `pnpm test`**.

- La contraseña del workflow **no es un secreto**: protege una base desechable que vive unos minutos en una máquina que GitHub destruye después, sin datos reales. Un secreto del repositorio no aportaría nada.
- **Desventaja:** Dependabot solo vigila `docker-compose.yml` (ecosistema `docker-compose`), así que la imagen del workflow no se actualiza sola. Un comentario en el archivo recuerda mantener ambas en sincronía.
- Se simuló en local con un contenedor temporal en otro puerto: la migración se aplicó a una base vacía y pasaron las 42 pruebas con `pnpm test` desde la raíz, es decir, con el modo estricto de Turbo.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un servicio real de correo en desarrollo | Enviaría correos de verdad y exigiría cuentas y credenciales |
| `CMD-SHELL` en el healthcheck | La imagen no tiene shell: el servicio quedaría `unhealthy` para siempre |
| Un volumen para conservar los correos | Son de usar y tirar; un volumen solo acumularía basura |
| Usuario sin privilegios y sistema de archivos de solo lectura | Es una herramienta local; más restricciones no aportan y habría que probar que Mailpit sigue funcionando |
| Dejar el healthcheck solo en la imagen | Funciona, pero deja el intervalo implícito y distinto al de los otros servicios |
| Publicar los puertos sin `127.0.0.1` | Expondría el servidor de correo de pruebas a toda la red |
| `dotenv` en `prisma.config.ts` | Una dependencia más para algo que Node 24 hace con `process.loadEnvFile` |
| Un `catch` vacío al cargar el `.env` | Silenciaría errores reales. Se comprueba con `existsSync` |
| Versionar el cliente generado | Es código derivado del esquema; ensuciaría los diffs y quedaría desactualizado |
| `prisma@latest` | Apunta a `8.0.0-rc.22`, un candidato a release, no a una versión estable |
| `prisma.config.ts` dentro de `prisma/` | Prisma 7 lo busca en la raíz del paquete: no lo carga y `migrate` no vería la URL |
| Construir la URL de la base con `POSTGRES_*` en el código | Dos sitios que construyen la URL y variables inexistentes en producción (ver paso 3) |
| Solo `$connect()` al arrancar | Con el adaptador `pg` no abre ninguna conexión: una base caída no se detectaría |
| Un `postinstall` con `prisma generate` | Redundante con la tarea de Turbo y alarga cada instalación |
| `PrismaModule` sin `@Global()` | Habría que importarlo en cada módulo de datos |
| Identificadores `text` (por defecto de Prisma) | Ocupan 36 bytes en lugar de 16 y aceptan cualquier cadena |
| Un solo índice compuesto `(userId, familyId, expiresAt)` en `RefreshToken` | No sirve para revocar una familia, que filtra solo por `familyId` |
| `replacedById` sin clave foránea | Permitiría ids que no existen |
| `snake_case` con `@@map` y `@map` | Es la convención habitual de PostgreSQL, pero llena el esquema de ruido y se aleja de 09 |
| `@db.VarChar(n)` por campo | Obliga a fijar ahora 15 o más longitudes; Zod ya las valida en la API |
| Validar el correo en minúsculas solo en la aplicación | La base no se protegería sola de un `INSERT` mal hecho |
| `prisma migrate dev` sin `--create-only` | Aplicaría la migración antes de poder añadirle el `CHECK` |
| `tsx` para ejecutar el seed en TypeScript | Una dependencia más, y el archivo quedaría fuera de `tsconfig`, de ESLint y del `build` |
| `upsert` por `slug` actualizando los nombres | Sobrescribiría lo que el administrador edite en los catálogos |
| `upsert` con `update: {}` | Hace lo mismo que `skipDuplicates`, con una sentencia por fila |
| `migrations.seed` en `prisma.config.ts` | Una segunda vía de ejecución que nadie necesita todavía |
| Slugs de categorías en español | Las rutas de la API van en inglés: `/categories/plumbing` |
| Limpiar la base de desarrollo en las pruebas | Borraría el catálogo sembrado y cualquier dato de trabajo |
| Testcontainers (un contenedor nuevo por ejecución) | Una dependencia más, más lento y complica la CI, sin ventaja sobre una base separada |
| Omitir las pruebas de base de datos si falta la variable | Una CI mal configurada saldría en verde sin comprobar el `CHECK` ni las claves foráneas |
| Cada prueba dentro de una transacción que se deshace | Obliga a pasar el cliente transaccional a todo, y no sirve para `seedCatalogs`, que abre su propia transacción |
| Una lista escrita a mano en el `TRUNCATE` | Si falta una tabla nueva, las pruebas se contaminan en silencio |
| `$executeRawUnsafe` con los nombres de tabla concatenados | Hace falta un texto fijo: el bloque `DO` lo construye la propia base |
| Una prueba por cada regla repetida (tabla de zonas, `AuditLog.actorId`) | Usan el mismo mecanismo que las ya probadas |
| La contraseña de la CI como secreto del repositorio | Protege una base desechable sin datos reales: no aporta nada |
| Servicio de la CI sin comprobación de salud | Las pruebas podrían empezar antes de que la base acepte conexiones |

## 5. Cómo verificar

Desde la raíz del repositorio:

```bash
docker compose config --quiet && echo OK
pnpm services:up
docker compose ps
printf 'From: Manos <no-reply@manos.local>\r\nTo: ana@example.com\r\nSubject: Prueba de Mailpit\r\n\r\nHola desde curl.\r\n' | curl -s --url smtp://127.0.0.1:1025 --mail-from no-reply@manos.local --mail-rcpt ana@example.com -T -
curl -s 'http://127.0.0.1:8025/api/v1/messages?limit=1'
ss -ltn | grep -E ':(1025|8025)\b'
curl -s -X DELETE http://127.0.0.1:8025/api/v1/messages
pnpm exec prettier --check docker-compose.yml
```

Esperado:

- `docker compose config` imprime `OK`.
- `docker compose ps` muestra `postgres`, `redis` y `mailpit` en estado `healthy`; `mailpit` publica `127.0.0.1:1025->1025/tcp` y `127.0.0.1:8025->8025/tcp`.
- El envío por SMTP termina con código 0.
- La API devuelve un JSON con `"Subject":"Prueba de Mailpit"` y `"Snippet":"Hola desde curl."`. En el navegador, `http://127.0.0.1:8025` muestra el mensaje.
- `ss` muestra las dos líneas con `127.0.0.1:`, nunca `0.0.0.0:`.
- El borrado responde `ok` y la lista queda con `"total":0`.
- Prettier dice `All matched files use Prettier code style!`.

**Pasos 2 a 4** (con los servicios arriba: `pnpm services:up`):

```bash
pnpm -F @manos/api generate
ls apps/api/src/generated/prisma
git check-ignore -v apps/api/src/generated/prisma/client.ts
pnpm -F @manos/api exec prisma validate
pnpm -F @manos/api typecheck
pnpm -F @manos/api build
pnpm -F @manos/api test
pnpm lint:root
rm -r apps/api/src/generated && pnpm typecheck
pnpm -F @manos/api start
```

Esperado:

- `generate` imprime `Loaded Prisma config from prisma.config.ts.` y `✔ Generated Prisma Client (7.10.0)`. Si falta la primera línea, el config está en la carpeta equivocada.
- `git check-ignore` muestra la regla de `.gitignore` que ignora el cliente generado, y `git status` no lo lista.
- `prisma validate` dice `The schema at prisma/schema.prisma is valid`.
- `typecheck`, `build` y `lint:root` pasan sin errores. `dist/prisma` contiene `prisma.service.js` y `prisma.module.js`.
- `test` muestra `4 passed` en archivos y `25 passed` en pruebas.
- Tras borrar el cliente, `pnpm typecheck` desde la raíz ejecuta `@manos/api:generate` antes del `typecheck` y vuelve a crearlo. Es lo que hará la CI.
- `start` imprime `PrismaModule dependencies initialized` y termina con `Nest application successfully started`; `GET /health` responde 200.
- Con la URL de un protocolo distinto (`DATABASE_URL='mysql://...' pnpm -F @manos/api start`) la API no arranca y muestra `→ at DATABASE_URL`, sin la contraseña.
- Con la base caída (`docker compose stop postgres`) la API no arranca: `Can't reach database server at 127.0.0.1:5432`, código de salida 1. Se restablece con `pnpm services:up`.
**Pasos 5 y 6** (con Postgres arriba):

```bash
pnpm -F @manos/api exec prisma validate
grep -c '^model ' apps/api/prisma/schema.prisma
grep -c '^enum ' apps/api/prisma/schema.prisma
pnpm -F @manos/api exec prisma migrate status
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"'
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d \"User\""'
```

Esperado:

- `validate` dice `valid`; los `grep` cuentan `10` modelos y `5` enums.
- `migrate status` dice `Database schema is up to date!`.
- `\dt` lista 11 tablas: las 10 del modelo y `_prisma_migrations`.
- `\d "User"` muestra al final `"User_email_lowercase_check" CHECK (email = lower(email))`.
- Para probar el `CHECK`, un `INSERT` con `'Ana@Example.com'` dentro de `BEGIN ... ROLLBACK` falla con `violates check constraint`.

**Pasos 7 a 9:**

```bash
pnpm -F @manos/api test
pnpm build
pnpm -F @manos/api seed
pnpm -F @manos/api seed
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT slug FROM \"Category\" ORDER BY slug" -c "SELECT count(*) FROM \"Zone\""'
```

Esperado:

- Los tests pasan: 5 archivos y 29 pruebas. Si salen 25, el archivo de datos está fuera de `src`.
- La primera ejecución del seed imprime `8 categories and 16 zones inserted` y la segunda `0 categories and 0 zones inserted`.
- La consulta lista 8 categorías con slug en inglés (de `air-conditioning` a `plumbing`) y cuenta `16` zonas.

**Pasos 10 a 13** (con Postgres arriba y `manos_test` creada):

```bash
pnpm -F @manos/api test
TEST_DATABASE_URL= pnpm -F @manos/api test
TEST_DATABASE_URL=not-a-url pnpm -F @manos/api test
pnpm format:check
```

Esperado:

- Las pruebas pasan: 8 archivos y 42 pruebas. La primera vez, Prisma aplica la migración `init` a `manos_test`; después dice `No pending migrations to apply`.
- Con la variable vacía falla con `TEST_DATABASE_URL is not set`, y con `not-a-url` con `TEST_DATABASE_URL is not a valid URL`, sin imprimir el valor. Con una URL cuya base no termine en `_test` falla con `must point to a database whose name ends in _test`.
- `format:check` pasa y valida también el YAML de `ci.yml`.

Para simular la CI en local, con un contenedor temporal en otro puerto y sin datos previos:

```bash
docker run -d --rm --name manos-ci-sim -e POSTGRES_USER=manos -e POSTGRES_PASSWORD=ci-only-password -e POSTGRES_DB=manos_test -p 127.0.0.1:55432:5432 postgres:17-alpine
TEST_DATABASE_URL=postgresql://manos:ci-only-password@127.0.0.1:55432/manos_test pnpm test
docker stop manos-ci-sim
```

Debe aplicar la migración `init` desde cero y pasar las 42 pruebas. La prueba definitiva es el trabajo `Quality` del pull request en GitHub.

- **Pruebas con fallo provocado:** al quitar `protocol` del esquema fallan las pruebas de `mysql://` y la de la contraseña; al hacer que el error imprima `JSON.stringify(config)`, falla solo la prueba "never prints the password".

## 6. Trampas conocidas

- **`CMD-SHELL` en el healthcheck de Mailpit.** La imagen no tiene shell; hay que usar la forma exec.
- **`port is already allocated` (1025 u 8025).** Otro programa usa el puerto, por ejemplo otro capturador de correo o un contenedor anterior.
- **Los correos desaparecen al ejecutar `pnpm services:down`.** Es intencional: no hay volumen.
- **El digest debe copiarse exacto.** Un carácter distinto y Docker no encuentra la imagen.
- **YAML.** La sangría es de 2 espacios y los guiones de las listas deben alinearse. Un tabulador rompe el archivo.
- **Un `curl` de SMTP necesita `\r\n`** al final de cada línea de cabecera; con solo `\n`, algunos servidores rechazan el mensaje.
- **Prettier no entiende `.env.example` ni `.gitignore`.** No se incluyen en `prettier --check`.
- **`prisma.config.ts` en la carpeta equivocada.** Dentro de `prisma/` no se carga: `generate` no imprime `Loaded Prisma config` y `migrate` no ve la URL. Va junto al `package.json`.
- **Un espacio al principio de una línea de `.gitignore`.** Forma parte del patrón, no coincide con nada y la carpeta sigue apareciendo en `git status`. Se detecta con `git check-ignore -v`.
- **`TS2375` en `prisma.config.ts`.** Con `exactOptionalPropertyTypes` no se puede escribir `url: process.env['DATABASE_URL']`; el bloque se omite si no hay URL.
- **El cliente no se actualiza al cambiar el esquema.** En Prisma 7, `migrate dev` no regenera el cliente: hay que ejecutar `generate`.
- **El aviso de `prisma@latest`.** Sugiere la 8.0.0-rc: se ignora.
- **`DATABASE_URL` ausente al actualizar el código.** La API no arranca hasta que el `.env` la tenga. Es lo esperado.
- **Contraseña con caracteres especiales en la URL.** Deben ir codificados (`%40` para `@`...). Con `openssl rand -hex 24` no hace falta.
- **`localhost` en lugar de `127.0.0.1`.** Puede resolver a IPv6 (`::1`), y el compose publica solo en IPv4.
- **Una relación declarada en un solo modelo.** `validate` falla con "missing an opposite relation field". Se añaden los dos lados a la vez.
- **Dos relaciones entre los mismos modelos sin nombre.** `Ambiguous relation detected`: cada una lleva un nombre idéntico en ambos extremos (`ProviderOwner`, `ProviderReviewer`, `TokenReplacement`).
- **`SetNull` implícito en claves foráneas opcionales.** Si debe ser `Restrict`, se escribe.
- **Editar una migración ya aplicada.** Prisma lo detecta por el checksum. Los cambios van antes de aplicar (`--create-only`) o en una migración nueva.
- **`migrate reset` y `db push` para "arreglar" la base.** Los dos la modifican y se saltan el historial: no se usan sin entender antes el error.
- **`TEST_DATABASE_URL is not set` aunque la variable está en el `.env`.** El nombre tiene un error de escritura, el valor repite el nombre (`TEST_DATABASE_URL=TEST_DATABASE_URL=...`), la línea no se guardó, o hay una variable **vacía** exportada en la terminal: `loadEnvFile` no pisa variables ya definidas, ni siquiera vacías. Se prueba con la forma de una sola línea, `TEST_DATABASE_URL= pnpm ...`, nunca con `export`.
- **`ERR_INVALID_URL`.** El valor no empieza por `postgresql://`, o aún lleva los marcadores `usuario:contraseña`.
- **`P1000: Authentication failed` al aplicar las migraciones de prueba.** La contraseña de `TEST_DATABASE_URL` no coincide con la del servidor, que es la misma que la de `DATABASE_URL` porque la base de pruebas vive en el mismo contenedor. Se copia la línea de `DATABASE_URL` y se cambian solo el nombre y la base.
- **`database "manos_test" does not exist`.** Falta el `createdb` del paso 10.
- **El mensaje de un error de URL imprime la contraseña.** Es el comportamiento de `new URL`; por eso se captura y se lanza uno propio.
- **`TS2339` al leer el resultado de `$queryRaw`.** Con `noUncheckedIndexedAccess`, `const [{ x }] = ...` no compila: se usa `rows[0]?.x`.
- **`replacedById: undefined` no compila** con `exactOptionalPropertyTypes`. Se pasa `null` para "sin valor".
- **Un editor que reindenta a 4 espacios.** `format:check` falla y la CI también. Se arregla con `prettier --write` sobre el archivo y revisando la configuración del editor.
- **Una sola prueba también necesita la base.** `globalSetup` corre siempre: sin Postgres arriba ninguna prueba se ejecuta.
- **Servicio de la CI con otra imagen que el compose.** Dependabot no actualiza la del workflow: hay que cambiarla a mano a la vez.
- **El seed y su prueba fuera de `src/`.** `tsconfig` y Vitest solo ven `src`: el archivo no se compila, no pasa `typecheck` y la prueba no se ejecuta (se nota porque los tests siguen siendo 25).
- **`Type 'readonly ...[]' is not assignable` en `createMany`.** Falta copiar la lista con `[...CATEGORIES]`.
- **`DATABASE_URL is not set` al sembrar.** El `.env` de la raíz no la tiene, o se ejecutó el programa a mano sin `--env-file-if-exists`. Se usa `pnpm -F @manos/api seed`.
- **`Cannot find module '.../dist/prisma/seed.js'`, o datos viejos.** Falta `pnpm build`, o no se repitió tras cambiar `seed-data.ts`.
- **Un editor que quita el salto de línea final** de `package.json`. `prettier --check` falla y la CI también.
- **`INSERT` en SQL a mano en el modelo.** Hay que dar `id` y `updatedAt`, que no tienen `DEFAULT`. Con el cliente de Prisma no hace falta.
- **`Nest can't resolve dependencies of the PrismaService (?)`.** Se importó `ConfigService` con `import type`: debe ser un `import` normal.
- **`TS1484` con `OnModuleInit` u `OnModuleDestroy`.** Las interfaces se importan con `type` por `verbatimModuleSyntax`.
- **La API dice "arrancó" con la base apagada.** Queda solo `$connect()` en `onModuleInit`; con el adaptador `pg` no conecta.
- **Los contenedores se paran al reiniciarse WSL.** Con `pnpm services:up` vuelven; la API no arranca mientras tanto, que es el comportamiento buscado.
- **Turbo no ejecuta `generate`.** El nombre de la tarea o su `dependsOn` no coinciden con el script del paquete.
- **Turbo 2 y las variables de entorno.** En modo estricto no pasa a las tareas las variables que no se declaran. Hoy ninguna tarea necesita `DATABASE_URL`; las pruebas contra la base (commit 5) sí, y entonces se declarará en `turbo.json`.
- **`timeout` encadenado con `grep` pierde la salida.** Para capturar el arranque de la API conviene escribir el log en un archivo.
