# 08. Decisiones técnicas de la fase 1

PR: `docs/phase-1-technical-decisions`. Solo documentación: no se instala ni se escribe código de producto.

## 1. Objetivo

Dejar por escrito, **antes de programar**, qué herramientas usará la fase 1, para qué sirve cada una, qué objetivo cumple dentro del proyecto y cómo se usa, con un fragmento pequeño de código. También se registra qué alternativas se descartaron y **cuánta confianza hay** en cada dato, para que lo que se descubra al instalar (y habrá sorpresas) quede anotado en un solo sitio.

## 2. Cómo leer este documento

### Niveles de verificación

| Etiqueta | Significado |
|---|---|
| **[Doc oficial]** | Lo leí en la documentación oficial de la herramienta |
| **[npm]** | Lo leí en los metadatos del paquete (versión, requisitos), sin ejecutarlo |
| **[Sin verificar]** | Es una expectativa mía. Debe comprobarse al instalar |

### Sobre los fragmentos de código

- **Son ilustrativos.** Muestran la idea de uso, no el código final del proyecto.
- **Ninguno se ejecutó.** Se contrastaron con la documentación oficial, pero no con una instalación real. Cada fragmento lleva su nivel de verificación.
- En ESM (NestJS 12 es solo ESM) los imports relativos llevan la extensión `.js` (`'./auth.service.js'`), aunque el archivo sea `.ts`. Está así en la documentación oficial.
- Por `verbatimModuleSyntax` (ver [03](03-monorepo-setup.md)), los imports que solo son tipos se escriben con `import type`.

## 3. Glosario

| Término | Significado |
|---|---|
| **ADR** | Registro de una decisión de arquitectura: qué se decidió, por qué y qué alternativas se descartaron |
| **ORM** | Capa que permite usar la base de datos con objetos de código en lugar de escribir SQL a mano |
| **Migración** | Un cambio versionado en la estructura de la base de datos (crear tabla, añadir columna) |
| **Driver / adaptador** | Pieza que sabe hablar el protocolo de una base de datos concreta |
| **Esquema (Zod)** | Descripción de la forma que deben tener unos datos, usada para validarlos |
| **Pipe (NestJS)** | Componente que transforma o valida un dato antes de que llegue al controlador |
| **Módulo (NestJS)** | Unidad que agrupa controladores y servicios de una funcionalidad |
| **Inyección de dependencias** | Que el framework entregue a una clase lo que necesita en lugar de que la clase lo cree |
| **Decorador** | Anotación `@Algo` que añade comportamiento a una clase o método |
| **ESM** | El sistema moderno de módulos de JavaScript (`import`/`export`) |
| **SWC** | Compilador muy rápido de TypeScript. Soporta los decoradores que NestJS necesita |
| **JWT** | Token firmado que lleva datos dentro (por ejemplo, el identificador del usuario) |
| **Token opaco** | Token aleatorio sin datos dentro: solo sirve como clave para buscar algo en la base |
| **SMTP** | El protocolo estándar para enviar correo |
| **Log (registro)** | Línea que la aplicación escribe para dejar constancia de lo que ocurre |
| **Redacción (redaction)** | Reemplazar datos sensibles de un log por `[Redacted]` antes de escribirlos |
| **Reloj falso** | En pruebas, un reloj que se puede adelantar a voluntad para simular el paso del tiempo |
| **Mock** | Pieza falsa que reemplaza a una real en una prueba |

## 4. Registro de decisiones

| # | Decisión | Elegido | Alternativas descartadas |
|---|---|---|---|
| 1 | Ejecutor de pruebas | Vitest + `unplugin-swc` | Jest |
| 2 | Ejecutor de Gherkin | Cucumber-js (API, en el mismo proceso) y `playwright-bdd` (web, más adelante) | Un solo ejecutor para todo |
| 3 | Validación | Zod 4 + pipe propio | `nestjs-zod`, `class-validator` |
| 4 | Autenticación | `argon2`, JWT corto, token de renovación opaco, limitador propio sobre Redis | `@nestjs/throttler`, JWT también para la renovación |
| 5 | Correo | Mailpit + `nodemailer` | Servicio real de correo en desarrollo |
| 6 | Servidor HTTP | Express | Fastify |
| 7 | Base de datos | Prisma 7.10.0 + `@prisma/adapter-pg` + `pg` | Otro ORM; `prisma` con etiqueta `latest` (es un candidato) |
| 8 | Registros | pino + `nestjs-pino`, con redacción | `console.log`, Winston |
| 9 | Seguridad HTTP | `helmet` y las cookies integradas de NestJS | `cookie-parser` (ver 5.7) |
| 10 | Configuración | `@nestjs/config` validando con Zod | Validar con `class-validator` |

## 5. Las herramientas, una por una

### 5.1 NestJS 12 (con Express)

- **Qué es.** Framework para construir APIs en Node con TypeScript. Organiza el código en módulos, controladores y servicios, e incluye inyección de dependencias.
- **Para qué la usamos.** Es la API de Manos: cuentas, sesiones, catálogo, administración.
- **Objetivo.** Un código ordenado por funcionalidades (monolito modular) y fácil de probar, donde cada pieza recibe lo que necesita.
- **Versión.** `@nestjs/core` 12.1.2 [npm].
- **Dos hechos que condicionan todo [Doc oficial]:** NestJS 12 se publica **solo en ESM**, y su CLI y sus esquemas **exigen TypeScript 6**. Eso encaja con nuestro TypeScript 6.0.3.
- **Servidor:** Express (`@nestjs/platform-express`). Se descartó Fastify: más documentación para Express y aquí la velocidad no es un problema.

```ts
// health.controller.ts (ilustrativo)
import { Controller, Get, Module } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

**Trampas.**
- Los imports relativos llevan `.js` (ver sección 2).
- La inyección de dependencias por tipo necesita `emitDecoratorMetadata`. Nuestro `tsconfig.base.json` activa `verbatimModuleSyntax`, y esa combinación **puede dar errores** con los decoradores. **[Sin verificar]**: se comprueba al crear `apps/api` y se anota en este documento.
- `apps/api` usará su propio `tsconfig` (la documentación de Nest recomienda `module: nodenext` para ESM), que extiende la base.

### 5.2 Prisma 7.10.0 (con `@prisma/adapter-pg` y `pg`)

- **Qué es.** Un ORM: describes tus tablas en un archivo y Prisma genera un cliente con tipos para consultar la base y las migraciones para modificarla.
- **Para qué la usamos.** Acceso a PostgreSQL: usuarios, proveedores, servicios, zonas, tokens.
- **Objetivo.** Consultas **parametrizadas** (protegen contra inyección SQL, OWASP A03) y tipos que atrapan errores al compilar. Las migraciones versionan la estructura de la base.
- **Versión.** `prisma` y `@prisma/client` en la **misma** versión, **7.10.0**. **Trampa [npm]:** la etiqueta `latest` del paquete `prisma` apunta a `8.0.0-rc.22`, un candidato a release, no a una versión estable. Se fija la versión exacta.
- **Cómo funciona en la 7 [Doc oficial]:** el generador `prisma-client` no usa Rust y escribe el cliente **dentro de tu código** (`output` propio), no en `node_modules`. Se conecta con un **adaptador** (`@prisma/adapter-pg` más el driver `pg`). La configuración vive en `prisma.config.ts`.

```prisma
// schema.prisma (ilustrativo)
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum Role {
  customer
  provider
  admin
}

model User {
  id    String @id @default(uuid())
  email String @unique
  role  Role   @default(customer)
}
```

```ts
// prisma.service.ts (ilustrativo)
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
```

**Trampas y puntos sin verificar.**
- **[Doc oficial]** En Prisma 7, `prisma migrate dev` **no regenera el cliente**: hay que ejecutar `prisma generate` después de cada cambio del esquema, o los modelos nuevos no existen en tiempo de ejecución.
- **[Sin verificar]** La documentación muestra **dos formas** de construir el adaptador: `new PrismaPg(cadena)` y `new PrismaPg({ connectionString })`, y dos maneras de escribir `prisma.config.ts`. Cuál aplica a 7.10.0 se confirma al instalar.
- **[Sin verificar]** La ruta exacta de importación del cliente generado (`./generated/prisma/client.js` es una suposición).
- El cliente generado **no se versiona**: va a `.gitignore`, y también hay que excluirlo de ESLint y Prettier.

### 5.3 Zod 4

- **Qué es.** Librería para describir la **forma de los datos** una sola vez, validarlos y obtener su tipo de TypeScript.
- **Para qué la usamos.** Validar todo lo que entra a la API (registro, login, búsqueda) y los formularios de la web, con **los mismos esquemas** compartidos desde `packages/shared`.
- **Objetivo.** Una sola definición de las reglas, para que web y API no puedan discrepar. Es la primera defensa contra datos maliciosos (OWASP A03).
- **Versión.** 4.6.6 [npm].

```ts
// packages/shared: registro.schema.ts (ilustrativo)
import { z } from 'zod';

export const registroSchema = z.object({
  correo: z.email(),
  nombre: z.string().min(1),
  contrasena: z.string().min(12).max(128),
  aceptaAviso: z.literal(true),
});

export type Registro = z.infer<typeof registroSchema>;

const resultado = registroSchema.safeParse(datosRecibidos);
if (!resultado.success) {
  // resultado.error.issues: lista con code, path y message de cada fallo
}
```

**[Doc oficial]** En Zod 4 el formato de correo se escribe `z.email()`. `safeParse` no lanza excepciones y devuelve `success` y, si falla, `error.issues`.

**Un pipe propio para NestJS** (en lugar de `nestjs-zod`, que **[npm]** declara compatibilidad solo con Nest 10 y 11):
```ts
// zod-validation.pipe.ts (ilustrativo)
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new BadRequestException(result.error.issues);
    return result.data;
  }
}
```
**[Sin verificar]** La guía de migración de Nest 12 habla de "firmas de pipes refinadas"; la firma exacta de `transform` puede diferir.

**Límite.** Zod valida **la forma**. Comprobar que una contraseña no está en la lista de comunes o que un correo no existe ya es lógica de negocio de la API.

### 5.4 `@nestjs/config` 12.0.1

- **Qué es.** El módulo de configuración de NestJS: lee variables de entorno y las entrega al código.
- **Para qué la usamos.** Leer `DATABASE_URL`, `REDIS_URL`, secretos y tiempos de expiración.
- **Objetivo.** **Fallar al arrancar** si falta o está mal una variable, en lugar de descubrirlo en plena ejecución. Cubre también OWASP A05 (mala configuración).

```ts
// app.module.ts (ilustrativo)
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().min(1),
});

@Module({
  imports: [ConfigModule.forRoot({ validate: (config) => envSchema.parse(config) })],
})
export class AppModule {}
```
**[Doc oficial]** `validate` es una función que recibe las variables y devuelve el resultado validado; si lanza un error, la aplicación aborta el arranque. Que use Zod en lugar de `class-validator` es mi elección.

### 5.5 `argon2` 0.45.1

- **Qué es.** Binding de Node a Argon2, un algoritmo de **hash de contraseñas** diseñado para ser costoso de atacar.
- **Para qué lo usamos.** Guardar las contraseñas de las cuentas y comprobarlas al iniciar sesión.
- **Objetivo.** Que, si se filtra la base de datos, no se puedan recuperar las contraseñas (OWASP A02). Es el escenario "la contraseña nunca se guarda en claro".

```ts
// password.service.ts (ilustrativo)
import argon2 from 'argon2';

const hash = await argon2.hash(contrasena, { type: argon2.argon2id });

const valida = await argon2.verify(hash, contrasena);
if (valida && argon2.needsRehash(hash)) {
  // volver a calcular el hash con parámetros más fuertes y guardarlo
}
```
**[Doc oficial]** `hash`, `verify` y `needsRehash` existen. Los parámetros por defecto de la librería son 3 iteraciones, 64 MiB de memoria y 4 hilos. `type` se fija explícitamente a `argon2id` para no depender del valor por defecto. Los parámetros definitivos se ajustan midiendo el tiempo de cálculo en la máquina objetivo.

**[Sin verificar]**
- La forma de importar (`import argon2 from 'argon2'`) en ESM.
- Que instale sin problemas con Node 24 (es una librería **nativa**: usa binarios precompilados o compila con herramientas de C++). Si falla, la alternativa es `@node-rs/argon2` (2.2.2).

### 5.6 `@nestjs/jwt` 12.0.2 y el token de renovación

- **Qué es.** Módulo de NestJS para firmar y verificar JWT.
- **Para qué lo usamos.** El **token de acceso**: lleva el identificador de la persona y su rol, y vive poco tiempo.
- **Objetivo.** Saber quién hace cada petición sin consultar la base en cada una.

```ts
// auth.module.ts y auth.service.ts (ilustrativo)
JwtModule.register({
  secret: process.env.JWT_SECRET,
  signOptions: { expiresIn: '15m', algorithm: 'HS256' },
});

const token = this.jwtService.sign({ sub: user.id, role: user.role });
```
**[Doc oficial]** `JwtModule.register({ secret, signOptions: { expiresIn } })` y `jwtService.sign(payload)`. **[Sin verificar]** que `algorithm` se acepte en `signOptions` y que la verificación admita fijar los algoritmos permitidos (importante: al verificar hay que **exigir el algoritmo esperado**, para evitar ataques de confusión de algoritmo).

**El token de renovación NO es un JWT.** Es un valor **aleatorio y opaco**, y en la base se guarda solo su **hash**:
```ts
// refresh-token.ts (ilustrativo, módulos de Node)
import { createHash, randomBytes } from 'node:crypto';

const token = randomBytes(32).toString('base64url');          // se entrega a la persona
const guardado = createHash('sha256').update(token).digest('hex'); // se guarda en la base
```
**Por qué opaco.** Los escenarios exigen **rotarlo** (cada uso emite uno nuevo), **revocarlo** (cerrar sesión) y **detectar su reutilización**. Con un JWT no se puede revocar antes de que expire sin guardar una lista, que es justo lo que hace un token opaco. Guardar solo el hash significa que quien robe la base no obtiene tokens utilizables.

### 5.7 Cookies integradas de NestJS 12 (en lugar de `cookie-parser`)

- **Qué es.** NestJS 12 incluye manejo de cookies en el propio framework.
- **Para qué lo usamos.** Entregar los tokens **solo en cookies** `HttpOnly`, `Secure` y `SameSite`, sin que el JavaScript de la página pueda leerlos (XSS).
- **Objetivo.** El escenario "los tokens se entregan solo en cookies y no son legibles desde JavaScript".

```ts
// auth.controller.ts (ilustrativo, adaptado de la documentación de Nest 12)
this.adapterHost.httpAdapter.setCookie(res, 'access', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 15 * 60, // en SEGUNDOS
});

this.adapterHost.httpAdapter.clearCookie(res, 'access');
```
**[Doc oficial]** `setCookie`, `clearCookie` y opciones como `httpOnly`, `secure`, `sameSite` y `maxAge`. **Trampa documentada:** aquí `maxAge` va en **segundos**; en Express a secas va en **milisegundos**.

**Corrección a lo propuesto.** En la propuesta anterior incluí `cookie-parser`. La documentación de NestJS 12 trae soporte propio, así que **se descarta `cookie-parser`** salvo que algo lo haga necesario.

### 5.8 `ioredis` 6.0.0 y el limitador de intentos propio

- **Qué es.** Cliente de Redis para Node.
- **Para qué lo usamos.** Contadores con caducidad: intentos fallidos de login por cuenta y por dirección, registros por IP, reenvíos de correo. Más adelante, colas (BullMQ).
- **Objetivo.** Implementar los **límites de intentos** que aprobaste (5 fallos en 15 minutos, 3 reenvíos por hora, etc.) contra fuerza bruta (OWASP A07).

```ts
// rate-limiter.service.ts (ilustrativo)
const clave = `login:fallos:${correo}`;
const intentos = await redis.incr(clave);
if (intentos === 1) await redis.expire(clave, 15 * 60);
if (intentos > 5) throw new HttpException('Demasiados intentos', HttpStatus.TOO_MANY_REQUESTS);
```
**[Doc oficial]** `incr`, `expire` y `ttl` existen en ioredis, y también `multi`/`pipeline` con `exec()`.

**Trampa real en este mismo fragmento:** `incr` y `expire` son **dos operaciones separadas**. Si el proceso se cae entre ambas, el contador queda **sin caducidad** y esa cuenta se bloquearía para siempre. La implementación final debe hacerlas **atómicas** (una transacción `multi` o un script Lua).

**Por qué propio y no `@nestjs/throttler`.** Es un limitador pensado para límites generales por ruta. Nuestras reglas son específicas (por cuenta, por IP, con ventanas distintas y desbloqueo por tiempo). `@nestjs/throttler` 6.7.1 sí declara compatibilidad con Nest 12 [npm]; lo descarto por ajuste, no por incompatibilidad.

**[Sin verificar]** La forma de importar el cliente en ioredis 6 (`import { Redis } from 'ioredis'` o por defecto).

### 5.9 `nodemailer` 10.1.0 y Mailpit

- **`nodemailer`: qué es.** Librería para enviar correo por SMTP desde Node.
- **Mailpit: qué es.** Un servidor SMTP de **pruebas**: recibe correos y **no entrega ninguno**; los guarda y los muestra en una página web local.
- **Para qué los usamos.** Enviar el correo de verificación, el de recuperación de contraseña, los avisos de cambio de contraseña y las decisiones sobre proveedores, sin enviar nada real.
- **Objetivo.** Probar los flujos de correo de punta a punta en desarrollo y en las pruebas automáticas.

```ts
// mail.service.ts (ilustrativo)
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({ host: '127.0.0.1', port: 1025 });

await transporter.sendMail({
  from: 'no-reply@manos.local',
  to: 'ana@example.com',
  subject: 'Verifica tu correo',
  text: `Abre este enlace: ${enlace}`,
});
```
**[Doc oficial]** `createTransport({ host, port, ... })` y `sendMail({ from, to, subject, text })`. En producción solo cambian los datos de conexión (variables de entorno): el código no cambia.

```yaml
# docker-compose.yml (ilustrativo)
  mailpit:
    image: axllent/mailpit:v1.31.5
    restart: unless-stopped
    ports:
      - '127.0.0.1:1025:1025'   # SMTP: donde la API envía
      - '127.0.0.1:8025:8025'   # página web: donde lees los correos
```
**[Doc oficial]** Mailpit escucha por defecto en `0.0.0.0:8025` (web) y `0.0.0.0:1025` (SMTP). Dentro del contenedor eso es lo normal; lo que protege es **publicar los puertos solo en `127.0.0.1`**, como en PostgreSQL y Redis. La imagen y su versión 1.31.5 existen [npm/GitHub]; no la he ejecutado.

**API de Mailpit para las pruebas [Doc oficial]:** `GET http://127.0.0.1:8025/api/v1/messages?limit=10` lista los mensajes, y `DELETE /api/v1/messages` sin cuerpo los **borra todos** (útil entre escenarios).

**Trampas.** Según recuerdo (**[sin verificar]**), Mailpit guarda los mensajes de forma temporal salvo que se le indique un archivo de base de datos con `MP_DATABASE` (esa variable existe [Doc oficial]); al recrear el contenedor se pierden, y para desarrollo está bien. Un correo nunca debe construirse con texto sin controlar: los saltos de línea en el nombre pueden inyectar encabezados (escenario de `10-paginas-informativas`).

### 5.10 pino y `nestjs-pino`

- **Qué es.** pino es una librería de registros muy rápida que escribe **JSON**. `nestjs-pino` 5.3.1 la integra con NestJS.
- **Para qué la usamos.** Dejar constancia de las peticiones, los errores y los eventos de seguridad (intentos fallidos, bloqueos, decisiones del administrador).
- **Objetivo.** Poder investigar fallos y ataques (OWASP A09) **sin filtrar datos sensibles**: contraseñas, tokens y cookies se ocultan antes de escribir.

```ts
// app.module.ts (ilustrativo)
import { LoggerModule } from 'nestjs-pino';

LoggerModule.forRoot({
  pinoHttp: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  },
});
```
```ts
// main.ts
import { Logger } from 'nestjs-pino';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
```
**[Doc oficial]** `LoggerModule.forRoot({ pinoHttp })` y el par `bufferLogs: true` más `app.useLogger(app.get(Logger))`. La opción `redact` se pasa dentro de `pinoHttp` (viene indicado en la documentación de `nestjs-pino`).

**[Verificado en el PR 1, ver 10]** `nestjs-pino` funciona con NestJS 12. `pino-http` **no registra el cuerpo de las peticiones**, así que una ruta como `req.body.contrasena` nunca existiría en el log; sí registra las cabeceras, la URL, la query y la dirección IP. Se redactan las cabeceras de credenciales y los nombres de campo sensibles, y pruebas automáticas comprueban que ninguno aparece en la salida. Lo que protege de verdad una contraseña es **no registrar cuerpos**; la redacción es la red de seguridad.

**Pendiente.** Un token en la query de la URL (`?token=...`) aparecería en el log. Se trata con los enlaces de verificación y de recuperación (PR 3 y 4). La retención de las direcciones IP se decide en la fase 7.

### 5.11 `helmet` 8.3.0

- **Qué es.** Un conjunto de cabeceras HTTP de seguridad que se aplican a todas las respuestas.
- **Para qué lo usamos.** Endurecer la API y la web (OWASP A05).
- **Objetivo.** Reducir ataques comunes del navegador (inyección de contenido, `clickjacking`) con una línea de configuración.

```ts
// main.ts (ilustrativo)
import helmet from 'helmet';

app.use(helmet());
```
**[Sin verificar]** El uso exacto con NestJS 12 en ESM. La política de contenido (CSP) para la web se diseñará aparte, con el diseño de la web.

### 5.12 Vitest + `unplugin-swc` + `@swc/core` + `@vitest/coverage-v8`

- **Qué es.** Vitest es un ejecutor de pruebas. SWC es un compilador de TypeScript muy rápido que, a diferencia del que usa Vitest por defecto, **conserva la metadata de decoradores** que NestJS necesita para su inyección de dependencias. `@vitest/coverage-v8` mide cuánto código ejercitan las pruebas.
- **Para qué lo usamos.** Pruebas unitarias y de integración de la API.
- **Objetivo.** Que las reglas del código (hash de contraseñas, vigencia de tokens, límites) se comprueben en segundos y en el CI.
- **Versiones.** `vitest` 5.0.3 (exige Vite 6.4, 7 u 8 [npm]), `unplugin-swc` 2.0.0, `@swc/core` 1.16.18.
- **Por qué esta combinación [Doc oficial]:** es la receta oficial de NestJS, y Vitest es el ejecutor por defecto de los proyectos ESM de NestJS 12. Con Jest, los paquetes ESM de Nest 12 solo cargan en Node 24.9 o superior (tienes 24.16, funcionaría, pero no es el camino oficial).

```ts
// vitest.config.ts (de la receta oficial de NestJS)
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, root: './' },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
```
```ts
// password.service.spec.ts (ilustrativo)
describe('PasswordService', () => {
  it('no guarda la contraseña en claro', async () => {
    const hash = await service.hash('una-clave-larga-123');
    expect(hash).not.toContain('una-clave-larga-123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });
});
```
Con `globals: true`, `describe`, `it` y `expect` están disponibles sin importarlos.

**Para probar endpoints (E2E)** se usa `supertest` 7.3.1 sobre una app de Nest creada con `Test.createTestingModule`. **[Sin verificar]** la forma de importar `supertest` bajo Vitest (la guía de Nest avisa de que puede requerir importación por defecto).

### 5.13 `@cucumber/cucumber` 13.3.0

- **Qué es.** El ejecutor de Gherkin para JavaScript. Lee los `.feature` y los vincula con código.
- **Para qué lo usamos.** Ejecutar los escenarios de la **API** (cuentas, sesiones, permisos, verificación de proveedores) como criterio de aceptación de la fase.
- **Objetivo.** Que los 119 escenarios aprobados dejen de ser texto y pasen a ser pruebas que se ponen en rojo cuando alguien rompe una regla.
- **Por qué dentro del mismo proceso.** Muchos escenarios dependen del tiempo (enlace vencido a las 24 h, bloqueo de 15 minutos, sesión de 1 hora de inactividad y 7 días como máximo). Dentro del mismo proceso que la API se le entrega un **reloj falso** que se adelanta; desde fuera de una API ya arrancada no se puede mover su reloj.

```ts
// features/steps/login.steps.ts (ilustrativo)
import { Given, When, Then, World, setWorldConstructor } from '@cucumber/cucumber';

class ManosWorld extends World {
  respuesta?: { status: number };
}
setWorldConstructor(ManosWorld);

Given('que hubo {int} intentos fallidos para {string} en los últimos 15 minutos',
  async function (this: ManosWorld, intentos: number, correo: string) {
    // simula los intentos fallidos
  });

When('inicia sesión con {string} y la contraseña correcta',
  async function (this: ManosWorld, correo: string) {
    // llama a la API
  });

Then('el inicio de sesión es rechazado por exceso de intentos',
  async function (this: ManosWorld) {
    // comprueba this.respuesta?.status === 429
  });
```
**[Doc oficial]** Los pasos se escriben con **`Given`, `When` y `Then`**, aunque los `.feature` estén en español: las palabras `Dado`, `Cuando` y `Entonces` son del archivo Gherkin, y no se usan en el código. Las expresiones `{string}` e `{int}` capturan valores del texto. Hay que usar `function` normal y **no** funciones flecha, porque Cucumber vincula `this` al "mundo" del escenario.

**Riesgo sin resolver (importante).** Esta decisión tiene un punto que no sé cómo resolver todavía: **cómo carga Cucumber el TypeScript de la API con la metadata de decoradores**. La inyección de NestJS depende de ella, y herramientas rápidas como `tsx` (esbuild) **no** la generan. **Se aplazó del PR 1** por decisión del proyecto y **debe resolverse antes del PR 3**, el primero que necesita escenarios ejecutables. Opciones a evaluar, con una prueba mínima antes de comprometerse:
1. Cucumber sobre código compilado con SWC.
2. Un cargador de TypeScript basado en SWC.
3. Ejecutar los `.feature` con Vitest (existe `vitest-cucumber`; no verifiqué su madurez), que ya usaría `unplugin-swc`.

Si ninguna funciona bien, esta decisión se revisa y se anota aquí.

### 5.14 `playwright-bdd` 9.2.1 (con `@playwright/test`)

- **Qué es.** Convierte archivos Gherkin en pruebas de Playwright, que **controla un navegador de verdad**.
- **Para qué lo usaremos.** Los escenarios de la **web**: teclado, selector de idioma, formularios y accesibilidad (`@a11y`).
- **Objetivo.** Comprobar lo que solo se ve en un navegador. **Se instala más adelante**, con el PR de la web.

```ts
// playwright.config.ts [Doc oficial]
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  language: 'es',
  features: 'docs/features/**/*.feature',
  steps: 'e2e/steps/**/*.ts',
});

export default defineConfig({ testDir });
```
```ts
// e2e/steps/idioma.steps.ts (ilustrativo; la estructura es de la documentación oficial,
// el selector del idioma es inventado y dependerá del diseño real de la web)
import { createBdd } from 'playwright-bdd';
import { test } from './fixtures.js'; // el "test" de Playwright que se pasa a createBdd

const { When } = createBdd(test);

When('cambia el idioma a {string}', async ({ page }, idioma: string) => {
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption(idioma);
});
```
**[Doc oficial]** `defineBddConfig({ features, steps, language })`, `createBdd(test)` y el comando `bddgen` que genera las pruebas. **Nota:** en la fase 1 se ejecutan con este ejecutor **solo** los escenarios que necesiten navegador; los de API van con Cucumber (5.13).

## 6. Cómo encajan: el registro de una cuenta

```
Navegador ──► Next.js ──► NestJS (apps/api)
                           │  1. ZodValidationPipe valida con el esquema de packages/shared
                           │  2. argon2 calcula el hash de la contraseña
                           │  3. Prisma guarda la cuenta en PostgreSQL
                           │  4. ioredis cuenta el intento (límite por IP)
                           │  5. nodemailer envía el correo ──► Mailpit (verlo en el navegador)
                           │  6. pino registra el evento, sin la contraseña
                           ▼
                      Respuesta al navegador (con cookies HttpOnly si aplica)
```

## 7. Riesgos y puntos sin verificar

| Punto | Estado | Cuándo se resuelve |
|---|---|---|
| `emitDecoratorMetadata` frente a `verbatimModuleSyntax` en el `tsconfig` | Verificado en el PR 1 (ver 10): `apps/api` usa `nodenext` y decoradores experimentales, y compila con ambas banderas. Las clases que se inyectan por constructor se importan como valor, no con `import type` | |
| Cargar TypeScript con decoradores desde Cucumber | **Riesgo sin resolver** (aplazado desde el PR 1) | **Antes del PR 3**, con una prueba mínima |
| Forma exacta de `PrismaPg` y de `prisma.config.ts` en 7.10.0 | Sin verificar (la documentación muestra dos) | Al instalar Prisma |
| Instalación de `argon2` (nativa) con Node 24 | Sin verificar | Al instalar |
| Importaciones en ESM (`argon2`, `ioredis`, `helmet`) | Sin verificar. `supertest` ya está verificado en el PR 1: funciona con `import request from 'supertest'` | Al escribir cada servicio |
| `nestjs-pino` con Nest 12 y rutas de `redact` | Verificado en el PR 1 (ver 10), con pruebas automáticas | |
| `@nestjs/jwt`: `algorithm` en `signOptions` y fijar algoritmos al verificar | Sin verificar | Al implementar la autenticación |
| Firma de `PipeTransform` en Nest 12 | Sin verificar | Al escribir el pipe |
| Mailpit: imagen v1.31.5 ejecutándose en el compose | Sin verificar | PR que añada Mailpit |
| Dependabot frente a los paquetes nuevos | Sin verificar | Revisar los `ignore` al añadir dependencias |

## 8. Correcciones respecto a lo propuesto antes

1. **Cucumber no usa `Dado`, `Cuando` ni `Entonces` en el código.** En una explicación anterior mostré un ejemplo con esas funciones; era inexacto. Se usan `Given`, `When` y `Then` (5.13).
2. **Se descarta `cookie-parser`.** NestJS 12 trae manejo de cookies propio (5.7).
3. **Aparece un riesgo nuevo sobre Cucumber:** la carga de TypeScript con decoradores (5.13). Antes lo presenté como una decisión sin reservas.
4. **El riesgo de Cucumber se aplazó del PR 1.** Debe resolverse antes del PR 3 (5.13 y sección 7).
5. **`pino-http` no registra el cuerpo de las peticiones.** La ruta `req.body.contrasena` de 5.10 no tenía sentido: se sustituyó por la redacción de cabeceras y de nombres de campo sensibles (ver 10).
6. **Versiones instaladas en el PR 1** que difieren en un parche de las citadas arriba: `@nestjs/*` 12.1.3, `zod` 4.6.7 y `vitest` 5.0.4. El detalle está en 10.

## 9. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Jest | Funciona con Node 24.9 o superior, pero el camino oficial de Nest 12 es Vitest |
| Un solo ejecutor de Gherkin | Una API ya arrancada desde fuera no permite mover el reloj de los escenarios dependientes del tiempo |
| `nestjs-zod` | **[npm]** declara compatibilidad solo con Nest 10 y 11 |
| `class-validator` | Obliga a duplicar las reglas con decoradores en lugar de compartir los esquemas con la web |
| `@nestjs/throttler` | Pensado para límites por ruta; nuestras reglas son por cuenta y por IP |
| JWT también para la renovación | No se puede revocar sin guardar una lista, que es lo que hace un token opaco |
| `cookie-parser` | NestJS 12 trae cookies propias |
| Fastify | Más documentación para Express; la velocidad no es un problema aquí |
| `prisma` con la etiqueta `latest` | Apunta a un candidato a release (8.0.0-rc.22) |
| Correo real en desarrollo | Riesgo de enviar mensajes por error y dependencia externa |

## 10. Cómo verificar

Lo único que se puede comprobar hoy, sin instalar nada, son los requisitos de cada paquete:
```bash
npm view @nestjs/core version
npm view prisma dist-tags --json          # latest apunta a un candidato (rc)
npm view nestjs-zod peerDependencies      # @nestjs/common ^10 || ^11, sin la 12
npm view vitest peerDependencies          # vite ^6.4 || ^7 || ^8
npm view @cucumber/cucumber engines.node  # 22 || 24 || >=26
```
Todo lo demás es **sin verificar** hasta que se instale (sección 7). Cada PR de la fase 1 que instale una herramienta debe actualizar este documento con lo que descubra.

## 11. Trampas conocidas

- **Los fragmentos son ilustrativos.** No se ejecutaron. No copiarlos tal cual: se validan al implementar.
- **`maxAge` de las cookies de Nest va en segundos.** En Express va en milisegundos.
- **`prisma migrate dev` no regenera el cliente en Prisma 7.** Después, `prisma generate`.
- **Versión de `prisma`.** Instalar siempre con versión exacta, nunca con `latest`.
- **`redact` solo protege lo que se nombra.** Una ruta mal escrita deja pasar la contraseña sin avisar; hay una prueba para eso.
- **`incr` y `expire` no son atómicos** (5.8).
- **Funciones flecha en pasos de Cucumber.** No se puede usar `this`.
- **Imports sin `.js` en ESM** fallan en tiempo de ejecución aunque compilen.
- **Mailpit pierde los mensajes** al recrear el contenedor si no se le da un archivo de base de datos.

## 12. Para repetirlo en otro proyecto

1. Listar las decisiones técnicas y las alternativas de cada una antes de instalar nada.
2. Comprobar los requisitos de cada paquete (`npm view <paquete> peerDependencies engines`) y la documentación oficial de la versión que se va a usar.
3. Etiquetar cada dato por su nivel de verificación y no mezclar lo leído con lo supuesto.
4. Escribir para cada herramienta: qué es, para qué se usa, qué objetivo cumple y un fragmento pequeño.
5. Reunir en una tabla lo que queda sin verificar y asignarle el momento en que se resolverá.
6. Actualizar el documento con cada sorpresa que aparezca al instalar.
7. Hacer el cambio por rama y PR, y documentarlo en el mismo commit.
