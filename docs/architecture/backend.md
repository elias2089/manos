# Arquitectura del backend: de la petición a la base de datos

Mapa de las herramientas de `apps/api`, ordenadas por **capas**, desde que llega una petición HTTP hasta que se guarda un dato. Para cada una: qué hace, para qué la usamos y en qué estado está.

Este documento es de **referencia** y se actualiza al cerrar cada PR. El detalle de cada decisión está en [08](../08-phase-1-technical-decisions.md), el diseño de datos y sesiones en [09](../09-phase-1-data-and-auth-design.md), y lo ya construido en [10](../10-api-base.md) y [11](../11-prisma-and-mailpit.md).

**Estado:** *Hecho* (con el PR), *En curso* (en el PR 2 que se está construyendo) o *Pendiente* (con el PR donde llega, según [09, sección 10](../09-phase-1-data-and-auth-design.md)).

## 1. El mapa

Una petición entra por arriba y baja capa por capa. La respuesta sube por el mismo camino.

```
┌─ 1. CLIENTE ─────────────────────────────────────────────────────────────
│   Navegador (web) · app móvil (fase 6) · curl y pruebas
│
▼   HTTPS + JSON
┌─ 2. SERVIDOR HTTP ───────────────────────────────────────────────────────
│   Express (@nestjs/platform-express)   recibe la petición y la entrega a Nest
│   helmet                               cabeceras de seguridad
│
▼
┌─ 3. MIDDLEWARE (se ejecuta en toda petición, antes de saber qué ruta es) ─
│   nestjs-pino / pino-http              registra la petición, sin credenciales
│   Cookies integradas de NestJS         leen y escriben las cookies de sesión
│   Validación de Origin y CORS          bloquean peticiones de otros sitios (CSRF)
│   Limitador sobre ioredis              corta los intentos repetidos (fuerza bruta)
│
▼
┌─ 4. GUARDS (¿puedes pasar?) ─────────────────────────────────────────────
│   Guard global de sesión               deny by default: toda ruta exige sesión
│   Guard de roles                       compara el rol con @Roles(...)
│   @nestjs/jwt                          verifica el token de acceso (AT)
│
▼
┌─ 5. PIPES (¿son válidos los datos?) ─────────────────────────────────────
│   ZodValidationPipe + Zod              valida la forma de los datos de entrada
│
▼
┌─ 6. CONTROLADORES (¿qué ruta es?) ───────────────────────────────────────
│   @Controller, @Get, @Post...          enlazan una ruta con un método
│                                        solo reciben, delegan y responden
▼
┌─ 7. SERVICIOS (la lógica de negocio) ────────────────────────────────────
│   Servicios de cada módulo             las reglas: auth, users, providers...
│   Clock                                la hora, siempre inyectada
│   argon2                               hash de contraseñas
│   nodemailer                           envía correo por SMTP
│
▼
┌─ 8. ACCESO A DATOS (único sitio que habla con los almacenes) ────────────
│   PrismaService                        consultas tipadas a PostgreSQL
│     Prisma Client + @prisma/adapter-pg + pg
│   Cliente de Redis (ioredis)           contadores, bloqueos y límites
│
▼
┌─ 9. ALMACENES Y SERVICIOS EXTERNOS ──────────────────────────────────────
    PostgreSQL 17      datos permanentes: cuentas, tokens, proveedores, auditoría
    Redis 8            datos temporales: contadores de intentos y bloqueos
    Mailpit (SMTP)     en desarrollo recibe los correos; en producción, un SMTP real
```

**Lo que atraviesa todas las capas** (no es una capa, se usa en cualquiera):

```
  @nestjs/config + Zod       leen las variables de entorno y se niegan a arrancar si son inválidas
  Clock                      toda fecha sale de aquí
  pino                       logs estructurados, con las credenciales redactadas
  TypeScript estricto        los tipos atrapan errores al compilar
  Vitest                     pruebas, con SWC para los decoradores
```

## 2. Qué hace cada capa

Las capas de arriba **conocen** a las de abajo, nunca al revés. Un controlador llama a un servicio; un servicio no sabe qué es una petición HTTP.

### Capa 2. Servidor HTTP

| Herramienta | Qué hace | Estado |
|---|---|---|
| **Express** | El servidor HTTP que atiende las peticiones. Nest se apoya en él | Hecho (PR 1) |
| **helmet** | Añade cabeceras de seguridad a las respuestas y quita `X-Powered-By: Express` | Pendiente (un PR posterior; antes de exponer la API) |

### Capa 3. Middleware

Funciones que se ejecutan en **todas** las peticiones, antes de decidir a qué ruta pertenecen.

| Herramienta | Qué hace | Estado |
|---|---|---|
| **nestjs-pino** y **pino-http** | Escriben una línea JSON por petición. Redactan `Authorization`, `Cookie`, `Set-Cookie` y campos como `password` o `token` (ver [10](../10-api-base.md)) | Hecho (PR 1) |
| **Cookies de NestJS 12** | Leen la cookie de renovación y escriben las de sesión (`HttpOnly`, `Secure`, `SameSite=Lax`) | Pendiente (PR 3) |
| **Validación de `Origin` y CORS** | Rechazan las peticiones que cambian datos desde un origen no permitido. Es la defensa contra CSRF (ver [09, sección 6.3](../09-phase-1-data-and-auth-design.md)) | Pendiente (PR 3) |
| **Limitador propio sobre ioredis** | Cuenta intentos fallidos por correo y por IP, y responde `429` al pasarse. Si Redis cae, las rutas protegidas **fallan cerradas** | Pendiente (PR 3) |

### Capa 4. Guards

Deciden si una petición **puede pasar**, antes de mirar sus datos.

| Herramienta | Qué hace | Estado |
|---|---|---|
| **Guard global de sesión** | *Deny by default*: toda ruta exige sesión. Las públicas se marcan con `@Public()`; olvidar la marca falla cerrado | Pendiente (PR 3) |
| **`@nestjs/jwt`** | Firma y verifica el token de acceso (AT) de 15 minutos, exigiendo el algoritmo esperado | Pendiente (PR 3) |
| **Guard de roles** | Compara el `role` del token con `@Roles('admin')` | Pendiente (PR 5) |

### Capa 5. Pipes

| Herramienta | Qué hace | Estado |
|---|---|---|
| **Zod 4** | Describe la **forma** de los datos y los valida: tipos, longitudes, formato. Rechaza campos desconocidos para evitar la asignación masiva | Hecho para las variables de entorno (PR 1 y 2); para las peticiones, pendiente (PR 3) |
| **`ZodValidationPipe`** | El adaptador propio que aplica un esquema de Zod a la entrada de una ruta y responde `400` si no cumple | Pendiente (PR 3) |

Zod valida **la forma**. Comprobar que un correo no existe ya, o que una contraseña no está en la lista de comunes, es lógica de negocio y vive en los servicios.

### Capa 6. Controladores

| Herramienta | Qué hace | Estado |
|---|---|---|
| **`@Controller`, `@Get`, `@Post`...** | Enlazan una ruta HTTP con un método. Un controlador **no tiene lógica**: recibe, delega en un servicio y responde | `GET /health` hecho (PR 1); el resto, pendiente (PR 3 en adelante) |

### Capa 7. Servicios

La lógica de negocio. Una clase por responsabilidad, con sus dependencias inyectadas por el constructor.

| Herramienta | Qué hace | Estado |
|---|---|---|
| **Servicios de cada módulo** (`auth`, `users`, `providers`, `catalog`, `admin`, `contact`) | Las reglas: quién puede qué, cuándo caduca una sesión, cómo se aprueba un proveedor | Pendiente (PR 3 al 6) |
| **`Clock`** | Entrega la hora. Toda fecha del código sale de aquí, y por eso las pruebas pueden adelantar el tiempo sin esperar | Hecho (PR 1) |
| **argon2** | Calcula el hash de las contraseñas (argon2id). Nunca se guarda la contraseña | Pendiente (PR 3) |
| **nodemailer** | Envía correos por SMTP: verificación, recuperación de contraseña, avisos | Pendiente (PR 3) |

### Capa 8. Acceso a datos

La **única** capa que habla con PostgreSQL y Redis. Un módulo no toca las tablas de otro: se las pide a su servicio.

| Herramienta | Qué hace | Estado |
|---|---|---|
| **Prisma** (Client + `@prisma/adapter-pg` + `pg`) | Traduce el código TypeScript a consultas SQL parametrizadas, que protegen contra inyección SQL, y da tipos a cada resultado. El adaptador y el driver `pg` hacen la conexión | Hecho (PR 2a y 2b): `PrismaService` global, 10 modelos y 5 enums |
| **Migraciones de Prisma** | Archivos SQL versionados que cambian la estructura de la base | Hecho (PR 2b): migración `init`, con un `CHECK` añadido a mano |
| **Datos iniciales (seed)** | Cargan las categorías y las 16 alcaldías, sin duplicar si se repiten | Hecho (PR 2b) |
| **ioredis** | Cliente de Redis para los contadores y bloqueos del limitador | Pendiente (PR 3) |

### Capa 9. Almacenes y servicios externos

| Herramienta | Qué guarda | Estado |
|---|---|---|
| **PostgreSQL 17** | Lo que no puede perderse: cuentas, tokens (solo su hash), proveedores, catálogo, auditoría | Hecho en el compose (fase 0); sin tablas hasta el PR 2 |
| **Redis 8** | Lo temporal o reconstruible: contadores de intentos y bloqueos | Hecho en el compose (fase 0); sin uso hasta el PR 3 |
| **Mailpit** | Servidor SMTP de pruebas: recibe los correos y los muestra en `http://127.0.0.1:8025`, sin entregar ninguno | Hecho (PR 2, commit 1) |

Regla del proyecto: lo que no se puede perder va a PostgreSQL; lo transitorio, a Redis.

## 3. El viaje de una petición

Ejemplo de **diseño** (aún no construido): `POST /v1/auth/register`. Cada paso corresponde a una capa del mapa.

| Paso | Capa | Qué ocurre |
|---|---|---|
| 1 | 1 Cliente | El navegador envía el correo, el nombre y la contraseña |
| 2 | 2 Servidor | Express recibe la petición y se la pasa a Nest |
| 3 | 3 Middleware | Se valida el `Origin`, el limitador cuenta el intento por IP y pino empieza a registrar la petición |
| 4 | 4 Guards | La ruta está marcada `@Public()`, así que no se exige sesión |
| 5 | 5 Pipes | Zod valida los datos; si fallan, responde `400` y aquí termina |
| 6 | 6 Controlador | Recibe los datos válidos y llama al servicio de autenticación |
| 7 | 7 Servicio | Comprueba que el correo no existe, calcula el hash con argon2 y pide guardar la cuenta; pide un token de verificación y el envío del correo |
| 8 | 8 Acceso a datos | Prisma guarda la cuenta y el hash del token en PostgreSQL; nodemailer entrega el correo al SMTP |
| 9 | 9 Almacenes | PostgreSQL guarda; Mailpit recibe el correo (en desarrollo) |
| 10 | Respuesta | Sube por las mismas capas; pino registra el evento **sin la contraseña**; el cliente recibe `201` |

## 4. Reglas que mantienen ordenado el sistema

| Regla | Por qué |
|---|---|
| Las capas de arriba conocen a las de abajo, nunca al revés | Un servicio no depende de HTTP, y por eso se prueba sin levantar un servidor |
| Un controlador no tiene lógica | La lógica vive en servicios, donde se prueba y se reutiliza |
| Solo la capa de acceso a datos habla con PostgreSQL y Redis | Un único sitio donde ver y cambiar las consultas |
| Un módulo no toca las tablas de otro | Mantiene separado el monolito modular. Se pide a su servicio |
| Toda fecha sale del `Clock` | Permite probar el paso del tiempo sin esperar |
| Nada sensible llega a los logs | Los logs acaban en un servicio externo que no se puede vaciar |
| Validar en la entrada, autorizar en cada recurso | Un dato inválido no debe llegar al servicio; un recurso ajeno devuelve `404`, no `403` |

## 5. Herramientas de desarrollo y calidad

No participan cuando la API atiende una petición, pero sostienen todo lo anterior.

| Herramienta | Para qué sirve | Estado |
|---|---|---|
| **pnpm** y **Turborepo** | Monorepo: instalan las dependencias y ejecutan `build`, `typecheck` y `test` de cada paquete con caché | Hecho (fase 0) |
| **TypeScript 6** estricto | Los tipos atrapan errores al compilar. `nodenext` para que Node ejecute el resultado | Hecho (PR 1) |
| **ESLint** y **Prettier** | Calidad y formato del código | Hecho (fase 0) |
| **husky**, **lint-staged** y **commitlint** | Revisan los archivos y el mensaje en cada commit | Hecho (fase 0) |
| **gitleaks** | Busca secretos en cada commit y en todo el historial | Hecho (fase 0) |
| **Vitest** y **SWC** | Pruebas unitarias y de integración, con soporte de decoradores. Las de integración usan una base PostgreSQL real, `manos_test` | Hecho (PR 1 y PR 2c) |
| **Cucumber** | Ejecuta los escenarios Gherkin de `docs/features/` contra la API | Pendiente, sin fecha (ver 08, sección 5.13) |
| **GitHub Actions** | La CI: formato, lint, tipos, build, pruebas y escaneo de secretos en cada PR. Las pruebas tienen su propio servicio PostgreSQL desechable | Hecho (fase 0 y PR 2c) |
| **Dependabot** | Propone actualizaciones de dependencias | Hecho (fase 0); su configuración frente a `apps/api` está sin verificar |
| **Docker Compose** | Levanta PostgreSQL, Redis y Mailpit en local | Hecho (fase 0 y PR 2) |

## 6. Comandos del día a día

Todos se ejecutan **desde la raíz del repositorio**. `pnpm -F @manos/api <script>` ejecuta un script solo de la API (`-F` es *filter*: elige el paquete).

La columna **¿Modifica archivos?** importa: los comandos que escriben (`--write`, `--fix`, `generate`, `build`) cambian el disco; los que solo comprueban, no.

### 6.1 Servicios locales (PostgreSQL, Redis y Mailpit)

| Comando | Qué hace | ¿Modifica archivos? | Cuándo |
|---|---|---|---|
| `pnpm services:up` | Levanta los tres contenedores y **espera** a que estén `healthy` | No (crea contenedores) | Al empezar a trabajar, y cada vez que se reinicie WSL o Docker: los contenedores se paran |
| `pnpm services:down` | Detiene y **elimina** los contenedores. Los datos de PostgreSQL y Redis persisten en sus volúmenes; los correos de Mailpit se pierden | No | Al terminar, o para recrearlos desde cero |
| `pnpm services:logs` | Muestra los logs de los contenedores en directo | No | Para diagnosticar un servicio |
| `docker compose ps` | Lista los servicios y su estado | No | Para comprobar que están `healthy` |
| `docker compose stop postgres` | Detiene solo un servicio, sin eliminarlo | No | Para probar qué hace la API con la base caída. Se restablece con `pnpm services:up` |

### 6.2 Dependencias

| Comando | Qué hace | ¿Modifica archivos? | Cuándo |
|---|---|---|---|
| `pnpm install` | Instala lo que dicen los `package.json` y el lockfile, y activa los hooks de git | `node_modules` y, si cambió algo, el lockfile | Tras clonar o al cambiar de rama con dependencias distintas |
| `pnpm install --frozen-lockfile` | Igual, pero **falla** si el lockfile no coincide con los `package.json` en lugar de reescribirlo | `node_modules` | Es lo que usa la CI. Conviene probarlo antes de abrir un PR |
| `pnpm add -F @manos/api --save-exact <paquete>@<versión>` | Añade una dependencia de ejecución con versión exacta (sin `^`) | `package.json` y lockfile | Al incorporar una librería. Antes se comprueba la versión con `npm view` |
| `pnpm add -F @manos/api -D --save-exact <paquete>@<versión>` | Igual, como dependencia de desarrollo | `package.json` y lockfile | Para herramientas que no viajan a producción |

### 6.3 Prisma

| Comando | Qué hace | ¿Modifica archivos? | Cuándo |
|---|---|---|---|
| `pnpm generate` | Ejecuta, vía Turbo, `prisma generate` en cada paquete que lo tenga: crea el cliente de Prisma en `src/generated/` a partir de `schema.prisma` | Sí: `src/generated/` (no se versiona) | Tras clonar, y **cada vez que cambie `schema.prisma`**. Los scripts `build`, `typecheck` y `test` de la raíz lo ejecutan solos |
| `pnpm -F @manos/api generate` | Lo mismo, solo en la API y sin Turbo | Sí: `src/generated/` | Si ejecutas un script de la API directamente y el cliente no existe |
| `pnpm -F @manos/api exec prisma validate` | Comprueba que el esquema es válido, sin tocar la base | No | Tras editar `schema.prisma` y antes de generar o migrar |
| `pnpm -F @manos/api exec prisma migrate dev --create-only --name <nombre>` | Genera una migración nueva **sin aplicarla**, para leer el SQL y editarlo | Sí: `prisma/migrations/` | Tras cambiar `schema.prisma`. Si hay algo que Prisma no expresa (un `CHECK`), se añade a mano **antes** de aplicarla |
| `pnpm -F @manos/api exec prisma migrate dev` | Aplica las migraciones pendientes a la base de desarrollo (y crea una temporal, la *shadow database*, para validarlas) | Sí: la base | Tras `--create-only` y la revisión del SQL |
| `pnpm -F @manos/api exec prisma migrate deploy` | Aplica las pendientes, sin generar nada ni preguntar | Sí: la base | CI, producción y el `globalSetup` de las pruebas |
| `pnpm -F @manos/api exec prisma migrate status` | Dice si la base está al día con las migraciones | No | Para comprobar el estado de una base |
| `pnpm -F @manos/api seed` | Carga las 8 categorías y las 16 alcaldías; repetirlo no duplica nada ni pisa lo editado | Sí: la base | Tras aplicar las migraciones. Requiere `pnpm build` antes: ejecuta lo compilado |

Prisma 7 **no** regenera el cliente al migrar, y **tampoco siembra** al migrar: `generate` y `seed` se ejecutan aparte. Una migración ya aplicada no se edita (Prisma guarda su checksum): los cambios van en una migración nueva.

### 6.4 Calidad del código

| Comando | Qué hace | ¿Modifica archivos? | Cuándo |
|---|---|---|---|
| `pnpm format` | Prettier **reescribe** todo el repositorio con el formato del proyecto | **Sí** | Rara vez: es mejor formatear solo lo que tocaste |
| `pnpm exec prettier --write <ruta>` | Reescribe solo esa ruta | **Sí** | Cuando `format:check` marca un archivo |
| `pnpm format:check` | Comprueba el formato de todo el repositorio sin tocar nada | No | Antes de commitear y antes de abrir el PR. Lo ejecuta la CI |
| `pnpm exec prettier --check <ruta>` | Comprueba solo esa ruta | No | Tras escribir un archivo nuevo |
| `pnpm lint:root` | ESLint revisa todo el repositorio | No | Antes de commitear. Lo ejecuta la CI |
| `pnpm lint` | Ejecuta, vía Turbo, el script `lint` de cada paquete. Hoy no hay ninguno: no hace nada | No | Lo ejecuta la CI; cobrará sentido cuando un paquete defina su `lint` |
| `pnpm typecheck` | Turbo ejecuta `generate` y luego `tsc` sobre cada paquete, **sin generar archivos** | No (salvo `generate`) | Tras cambiar código TypeScript y antes de commitear. Lo ejecuta la CI |
| `pnpm -F @manos/api typecheck` | Lo mismo, solo en la API, sin pasar por `generate` | No | Para repetir rápido mientras escribes. Requiere el cliente ya generado |

Prettier **no** entiende `.env.example` ni `.gitignore`, y el proyecto lo configura para ignorar los `.md` (las tablas se alinean a mano). No se incluyen en `prettier --check`.

### 6.5 Compilar y ejecutar

| Comando | Qué hace | ¿Modifica archivos? | Cuándo |
|---|---|---|---|
| `pnpm build` | Turbo ejecuta `generate` y compila cada paquete a `dist/` | Sí: `dist/` (no se versiona) | Antes de `start`. Lo ejecuta la CI |
| `pnpm -F @manos/api build` | Compila solo la API | Sí: `dist/` | Tras cambiar el código y antes de `start` |
| `pnpm -F @manos/api start` | Ejecuta `node dist/main.js`: la versión **compilada** | No | Con los servicios arriba y **después de un `build`**. Si no, ejecuta código desactualizado |
| `curl -i localhost:3000/health` | Comprueba que la API responde | No | Con la API arrancada |

La API no recarga sola al cambiar el código: hay que volver a compilar y a arrancar.

### 6.6 Pruebas

| Comando | Qué hace | ¿Modifica archivos? | Cuándo |
|---|---|---|---|
| `pnpm test` | Turbo ejecuta `generate` y las pruebas de cada paquete | `coverage/` si se pide | Antes de commitear y antes del PR. Lo ejecuta la CI |
| `pnpm -F @manos/api test` | Ejecuta las pruebas de la API una vez | No | Tras cada cambio de código |
| `pnpm -F @manos/api test:watch` | Las vuelve a ejecutar al guardar cada archivo | No | Mientras escribes una prueba |
| `pnpm -F @manos/api test:cov` | Pruebas más informe de cobertura | `coverage/` (no se versiona) | Para ver qué código no ejercitan las pruebas |

Todas las pruebas necesitan **PostgreSQL arriba** y `TEST_DATABASE_URL` en el `.env`, apuntando a la base `manos_test` (el nombre debe terminar en `_test`). Antes de ejecutarlas, Vitest aplica las migraciones a esa base, y antes de cada prueba la vacía: nunca toca la de desarrollo. Se crea una vez con `docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" manos_test'`.

### 6.7 Seguridad

| Comando | Qué hace | ¿Modifica archivos? | Cuándo |
|---|---|---|---|
| `sh scripts/gitleaks.sh staged` | gitleaks revisa los archivos **preparados** para el commit, en un contenedor con versión fijada | No | Lo ejecuta solo el hook de commit. Necesita Docker |
| `sh scripts/gitleaks.sh history` | Revisa **todo el historial** de git | No | Lo ejecuta la CI en cada PR |

No ejecutes gitleaks apuntando a carpetas sueltas: el modo `dir` escanea toda la raíz, incluido tu `.env` local (que git ignora y no se sube, pero contiene contraseñas).

## 7. En qué orden ejecutarlos

### 7.1 Tras clonar el repositorio

1. `pnpm install`
2. Copiar `.env.example` a `.env` y rellenar los valores (incluidas `DATABASE_URL` y `TEST_DATABASE_URL`, esta con la base `manos_test`)
3. `pnpm services:up`
4. Crear la base de pruebas, una sola vez: `docker compose exec postgres sh -c 'createdb -U "$POSTGRES_USER" manos_test'`
5. `pnpm generate`
6. `pnpm -F @manos/api exec prisma migrate deploy` (aplica las migraciones a la base de desarrollo)
7. `pnpm build` y `pnpm -F @manos/api seed` (carga los catálogos)
8. `pnpm -F @manos/api start`

### 7.2 Cada día

1. `pnpm services:up` (si WSL o Docker se reiniciaron)
2. Escribir código
3. `pnpm -F @manos/api test` (o `test:watch`) y `pnpm -F @manos/api typecheck`
4. Para ver la API: `pnpm -F @manos/api build`, luego `pnpm -F @manos/api start`

### 7.3 Al cambiar `schema.prisma`

1. `pnpm -F @manos/api exec prisma validate`
2. `pnpm generate`
3. `pnpm -F @manos/api typecheck`, para ver qué código se rompió con el cambio
4. `pnpm -F @manos/api exec prisma migrate dev --create-only --name <nombre>`, leer el `migration.sql` generado y añadirle a mano lo que Prisma no exprese
5. `pnpm -F @manos/api exec prisma migrate dev` para aplicarla, y `pnpm generate` otra vez
6. `pnpm -F @manos/api test`: las pruebas de la base comprueban las reglas del modelo

### 7.4 Antes de cada commit

1. `pnpm exec prettier --check <lo que tocaste>` (y `--write` si marca algo)
2. `pnpm lint:root`
3. `pnpm typecheck`
4. `pnpm test`
5. `git add <archivos concretos>` y `git commit`. Los hooks hacen el resto: **pre-commit** (gitleaks sobre lo preparado y `lint-staged`, que ejecuta ESLint `--fix` y Prettier `--write` sobre esos archivos) y **commit-msg** (`commitlint`: el mensaje debe seguir Conventional Commits, con el encabezado de 100 caracteres como máximo, sin mayúscula inicial y sin punto final)

### 7.5 Antes de abrir el PR: la misma secuencia que la CI

Se ejecuta en este orden, de lo más barato a lo más caro. Si uno falla, se corrige antes de seguir:

| # | Comando | Qué detecta |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | Un lockfile que no coincide con los `package.json` |
| 2 | `pnpm format:check` | Formato |
| 3 | `pnpm lint:root` | Errores y malas prácticas de código |
| 4 | `pnpm lint` | Lo que definan los paquetes (hoy nada) |
| 5 | `pnpm typecheck` | Errores de tipos (genera antes el cliente de Prisma) |
| 6 | `pnpm build` | Que el código compila |
| 7 | `pnpm test` | Que las pruebas pasan, contra PostgreSQL real (`TEST_DATABASE_URL`) |

La CI ejecuta además un segundo trabajo, **Secrets**, con `sh scripts/gitleaks.sh history`. El trabajo de calidad arranca su propio PostgreSQL desechable (servicio en `ci.yml`, con la misma imagen que el compose), así que no hace falta nada más en GitHub.

### 7.6 El grafo de dependencias de Turbo

`generate` va antes de las tres tareas que necesitan el cliente de Prisma:

```
generate ──┬──► typecheck
           ├──► build
           └──► test   (también espera al build de los paquetes de los que depende)
```

Por eso en una instalación limpia basta con `pnpm typecheck`, `pnpm build` o `pnpm test` desde la raíz. En cambio, `pnpm -F @manos/api test` **no pasa por Turbo** y necesita el cliente ya generado.

### 7.7 Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La API no arranca: `Can't reach database server at 127.0.0.1:5432` | Los contenedores están parados | `pnpm services:up` |
| La API no arranca: `Invalid environment variables ... DATABASE_URL` | Falta o es inválida la variable en el `.env` | Revisar el `.env` con `.env.example` al lado |
| `Cannot find module './generated/prisma/client.js'` o `typecheck` falla por el cliente | Falta el cliente generado | `pnpm generate` |
| `Cannot find module './dist/main.js'` | Se ejecutó `start` sin compilar | `pnpm -F @manos/api build` |
| Los cambios del código no se notan al arrancar | `start` ejecuta `dist/`, que quedó antiguo | `build` y volver a arrancar |
| `format:check` falla en un archivo | El editor indentó con 4 espacios o formateó distinto | `pnpm exec prettier --write <archivo>` |
| El commit se rechaza con `subject may not be empty`, `header must not be longer than 100` o similar | El mensaje no cumple Conventional Commits | Reescribirlo: encabezado corto en minúscula y el detalle en un segundo `-m` |
| El commit se rechaza por gitleaks | Algo parece un secreto, a veces un `curl` con cabecera `Authorization` en un documento | Cambiar el texto (con palabras o un valor de relleno claro); no silenciar la regla |
| `port is already allocated` al levantar los servicios | Otro programa usa 5432, 6379, 1025 u 8025 | Pararlo o liberar el puerto |
| Las pruebas fallan con `TEST_DATABASE_URL is not set` | Falta la variable en el `.env`, tiene un error de escritura o hay una variable vacía exportada en la terminal | Revisar la línea del `.env` (debe empezar por `postgresql://`) y, si hace falta, `unset TEST_DATABASE_URL` |
| Las pruebas fallan con `P1000: Authentication failed` | La contraseña de `TEST_DATABASE_URL` no es la del servidor | Copiar la línea de `DATABASE_URL` y cambiar solo el nombre y la base (`manos_test`) |
| Las pruebas fallan con `database "manos_test" does not exist` | Falta crear la base de pruebas | El `createdb` de la sección 7.1 |
| `seed` imprime datos viejos o no encuentra `dist/prisma/seed.js` | El seed ejecuta lo compilado y no se hizo `build` | `pnpm build` y repetir |

## 8. Cómo mantener este documento

- Al cerrar un PR, cambiar el estado de las herramientas que llegaron (*Pendiente* por *Hecho*, con el número del PR).
- Si una herramienta nueva entra al backend, añadirla a la capa que le corresponde y al mapa.
- Si se añade, renombra o elimina un script (en el `package.json` raíz, en el de la API o en `turbo.json`), actualizar la sección 6 y, si cambia el orden, la 7.
- Si una decisión cambia el orden o la responsabilidad de una capa, actualizar el mapa y la sección de reglas, y enlazar el documento numerado que explica el cambio.
