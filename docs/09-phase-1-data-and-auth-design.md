# 09. Diseño de la fase 1: modelo de datos y autenticación

PR: `docs/phase-1-data-and-auth-design`. Solo documentación y escenarios: no se instala ni se escribe código de producto.

## 1. Objetivo

Decidir, **antes de programar**, cómo se guardan los datos de la fase 1, cómo funciona la autenticación (tokens, sesiones, límites de intentos, protección CSRF), qué lleva cada tabla y cada clave de Redis, y en qué orden se construye. El diseño cumple los escenarios aprobados en [07](07-behavior-specs-phase-1.md) y usa las herramientas elegidas en [08](08-phase-1-technical-decisions.md).

Además, diseñar descubrió huecos en los escenarios; se corrigieron aquí (sección 3).

## 2. Glosario

| Término | Significado |
|---|---|
| **Entidad / tabla** | Un tipo de dato que se guarda (usuario, token) y la tabla de la base donde vive |
| **Clave primaria (PK)** | El campo que identifica de forma única cada fila |
| **Clave foránea (FK)** | Un campo que apunta a la clave primaria de otra tabla |
| **Cardinalidad** | Cuántas filas de una tabla se relacionan con cuántas de otra: 1 a 1, 1 a n, n a m |
| **Tabla intermedia** | Tabla que resuelve una relación n a m con una fila por cada pareja |
| **Índice** | Estructura que acelera la búsqueda por un campo. Un índice **único** además impide duplicados |
| **UUID** | Identificador aleatorio de 128 bits, imposible de adivinar. Evita los números consecutivos (1, 2, 3…) |
| **Anonimizar** | Reemplazar los datos personales de una fila por valores que ya no identifican a nadie, conservando la fila |
| **UTC** | Hora universal coordinada: la referencia de tiempo sin zona ni horario de verano |
| **`timestamptz`** | Tipo de PostgreSQL para guardar un **instante absoluto** (no guarda la zona) |
| **Hash** | Resultado irreversible de transformar un dato. Se guarda en lugar del dato |
| **HMAC** | Hash con una clave secreta. Sin la clave, no se puede reproducir ni adivinar probando valores |
| **TTL** | Tiempo de vida de una clave de Redis: pasado ese tiempo, desaparece sola |
| **AT (token de acceso)** | JWT de vida corta que identifica a la persona en cada petición |
| **RT (token de renovación)** | Token opaco de vida más larga que solo sirve para conseguir un AT nuevo |
| **Familia de tokens** | Todos los RT nacidos de un mismo inicio de sesión. Se revocan juntos |
| **Rotación** | Cada vez que se usa un RT, se emite uno nuevo y el anterior queda inservible |
| **Inactividad (idle timeout)** | Tiempo sin renovar tras el cual la sesión muere |
| **Duración máxima (absolute timeout)** | Tiempo desde el inicio de sesión tras el cual hay que volver a iniciarla, aunque se use sin parar |
| **CSRF** | Ataque que aprovecha que el navegador envía las cookies automáticamente para hacer actuar a una persona sin que lo sepa |
| **Origen (`Origin`)** | Cabecera que el navegador añade a una petición e indica desde qué página sale |
| **SameSite** | Atributo de una cookie que limita cuándo el navegador la envía en peticiones iniciadas desde otro sitio |
| **CORS** | Mecanismo por el que el servidor autoriza (o no) a otros orígenes a leer sus respuestas |
| **Mismo sitio / mismo origen** | *Origen* = esquema + dominio + puerto. *Sitio* = solo el dominio registrable: `manos.example` y `api.manos.example` son el mismo sitio pero orígenes distintos |
| **Falla cerrada (fail closed)** | Si una protección no puede funcionar, se **deniega** la acción en lugar de permitirla |
| **Deny by default** | Todo está prohibido salvo lo que se marque expresamente como público |
| **Asignación masiva** | Que un campo que no debería poder editarse (el rol) se modifique porque llegó en la petición |
| **IDOR** | Acceder a datos ajenos cambiando un identificador en la petición |
| **Reloj inyectable (`Clock`)** | Pieza que entrega la hora actual y que en pruebas se puede sustituir por una que avanza a voluntad |

## 3. Decisiones tomadas

| # | Decisión | Resultado |
|---|---|---|
| A | Entidad Servicio | **No existe en la fase 1.** El escenario de `05` ahora habla de "perfil de proveedor" |
| B | `pending` ambiguo | Campo `reviewRequestedAt`. La lista del administrador son los `pending` con esa fecha |
| C | Renovación y pestañas concurrentes | Escenario **estricto** (reutilizar un RT revoca la familia) y la web renueva **de una en una** |
| D | CSRF | `SameSite=Lax` + validar `Origin` + solo JSON + `GET` sin efectos |
| E | Contraseñas comunes | Lista **local** incluida en el proyecto; hay que revisar su licencia antes de añadirla |
| F | Datos iniciales de zonas | Las 16 alcaldías de la Ciudad de México |
| G | Tope de sesión | **1 hora de inactividad y 7 días como duración máxima** |
| H | Si Redis cae | Las rutas protegidas por el limitador **fallan cerradas** (sección 6.6) |
| I | Facturación | **Retirada de todo el proyecto** el 11-oct-2026. La cancelación de cuenta sigue anonimizando por el registro de auditoría |

Escenarios modificados o añadidos por este diseño (de 102 a **119**): `03` (+5: uso frecuente, duración máxima, límite en la renovación, cookie restringida, Redis caído; y el escenario de 7 días pasó a 1 hora), `05` (1 corregido), `07` (+2 y 3 ajustados) y el archivo nuevo `11` (10 escenarios de CSRF).

## 4. Modelo de datos

### 4.1 Diagrama entidad-relación

```
 ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
 │ OneTimeToken │ n    1 │              │ 1    n │ RefreshToken │
 │              ├────────┤     User     ├────────┤              │
 └──────────────┘        │              │        └──────────────┘
 ┌──────────────┐ n    1 │              │
 │   AuditLog   ├────────┤              │
 │  (actorId)   │        └──────┬───────┘
 └──────────────┘               │ 1
                                │ 0..1
                       ┌────────┴────────┐
                       │ ProviderProfile │
                       └───┬─────────┬───┘
                        1  │         │  1
                        n  │         │  n
             ┌─────────────┴──┐   ┌──┴───────────┐
             │ProviderCategory│   │ ProviderZone │
             └──────┬─────────┘   └──────┬───────┘
                  n │                  n │
                  1 │                  1 │
              ┌─────┴────┐           ┌───┴────┐
              │ Category │           │  Zone  │
              └──────────┘           └────────┘

 ContactMessage   (sin relaciones)
```

Cómo leerlo: junto a cada extremo se indica cuántas filas hay de ese lado. `n    1` significa "muchas filas de este lado se relacionan con una del otro".

| Relación | Cardinalidad | Significado |
|---|---|---|
| User ↔ ProviderProfile | 1 a 0..1 | Un usuario tiene **como máximo** un perfil de proveedor |
| User → RefreshToken | 1 a n | Un usuario puede tener varias sesiones abiertas |
| User → OneTimeToken | 1 a n | Y varios enlaces de un solo uso a lo largo del tiempo |
| User → AuditLog | 1 a n | Un administrador deja muchas decisiones registradas |
| ProviderProfile ↔ Category | n a m, por `ProviderCategory` | Un proveedor ofrece varias categorías y una categoría tiene varios proveedores |
| ProviderProfile ↔ Zone | n a m, por `ProviderZone` | Igual con las zonas |

### 4.2 Qué significa cada campo

Los tipos son orientativos. El esquema real de Prisma se escribe en el PR 2 y se valida allí.

**`User`**: una fila por cuenta.

| Campo | Tipo | Significado | Ejemplo |
|---|---|---|---|
| `id` | UUID | Identificador único, imposible de adivinar | `0192a1c4-…-0001` |
| `email` | texto, único | Correo en **minúsculas**. Es el nombre de usuario | `ana@example.com` |
| `emailVerifiedAt` | fecha, opcional | Cuándo confirmó su correo. **Vacío = sin verificar** | `2026-10-11 15:42:10+00` |
| `name` | texto, opcional | Nombre visible (opcional porque se vacía al cancelar) | `Ana Torres` |
| `phone` | texto, opcional | Teléfono mexicano normalizado a 10 dígitos | `5512345678` |
| `passwordHash` | texto, opcional | Hash de argon2id. **Nunca** la contraseña. Se vacía al cancelar | `$argon2id$v=19$m=65536,t=3,p=4$…` |
| `role` | enum | `customer`, `provider` o `admin` | `customer` |
| `locale` | enum | Idioma preferido: `es-MX` o `en` | `es-MX` |
| `privacyNoticeVersion` | texto | Versión del aviso de privacidad que aceptó | `2026-10` |
| `privacyAcceptedAt` | fecha | Cuándo lo aceptó (constancia) | `2026-10-11 15:30:00+00` |
| `status` | enum | `active` o `cancelled` | `active` |
| `createdAt`, `updatedAt` | fecha | Cuándo se creó y se modificó | |

Cómo se lee `$argon2id$v=19$m=65536,t=3,p=4$<sal>$<hash>`: algoritmo `argon2id`, versión 19, 64 MiB de memoria (`m`), 3 iteraciones (`t`), 4 hilos (`p`), la **sal** aleatoria de esa contraseña y el hash. Los parámetros viajan dentro de la cadena, y por eso `needsRehash` puede saber si hace falta recalcularla con parámetros más fuertes.

**`OneTimeToken`**: enlaces de un solo uso (verificación, recuperación, cambio de correo).

| Campo | Significado | Ejemplo |
|---|---|---|
| `userId` | Dueño del enlace | el id de Ana |
| `purpose` | `email_verification`, `password_reset` o `email_change` | `password_reset` |
| `tokenHash` | **SHA-256 del token**, único. El token real solo viaja en el correo | `9f2c41…` (64 caracteres) |
| `newEmail` | Solo en `email_change`: el correo nuevo pendiente de confirmar | `ana.nueva@example.com` |
| `expiresAt` | Cuándo vence: 24 horas en verificación, 1 hora en recuperación | |
| `usedAt` | Cuándo se usó. **Con valor = ya gastado** | |

**`RefreshToken`**: una fila por cada token de renovación emitido.

| Campo | Significado |
|---|---|
| `userId` | A quién pertenece |
| `familyId` | Identificador común a **todos los tokens de un mismo inicio de sesión** |
| `sessionStartedAt` | Cuándo empezó esa sesión. Se **copia** de un token al siguiente dentro de la familia. Sirve para aplicar la duración máxima |
| `tokenHash` | SHA-256 del token, único |
| `expiresAt` | Cuándo vence (ver 5.3) |
| `usedAt` | Cuándo se canjeó por uno nuevo |
| `replacedById` | A qué token dio lugar al canjearse |
| `revokedAt` | Si se canceló a la fuerza (cierre de sesión, reutilización detectada, cambio de contraseña) |

**`ProviderProfile`**

| Campo | Significado | Ejemplo |
|---|---|---|
| `userId` | El usuario dueño (único) | |
| `businessName` | Nombre comercial público | `Plomería Torres` |
| `description` | Texto público | `Reparaciones y mantenimiento` |
| `status` | `pending`, `verified` o `rejected` | `pending` |
| `reviewRequestedAt` | Cuándo pidió la revisión. **Vacío = aún no la pide** | |
| `rejectionReason` | Motivo del rechazo, que verá el proveedor | `Falta describir los servicios` |
| `reviewedById`, `reviewedAt` | Qué administrador decidió y cuándo | |

**`Category` y `Zone`**: catálogos que carga el administrador o los datos iniciales.

| Tabla | Campos | Ejemplo |
|---|---|---|
| `Category` | `slug` (único, para URLs), `nameEs`, `nameEn` | `plomeria`, `Plomería`, `Plumbing` |
| `Zone` | `slug` (único), `name`, `state` | `coyoacan`, `Coyoacán`, `Ciudad de México` |

**`ProviderCategory` y `ProviderZone`:** solo `providerId` y `categoryId` (o `zoneId`); juntos forman la clave primaria.

**`AuditLog`**: decisiones de negocio.

| Campo | Significado | Ejemplo |
|---|---|---|
| `actorId` | Quién lo hizo | el administrador |
| `action` | Qué hizo | `provider.approved` |
| `entityType`, `entityId` | Sobre qué | `ProviderProfile` y su id |
| `before`, `after` | Estado anterior y nuevo | `pending` → `verified` |
| `createdAt` | Cuándo | |

**`ContactMessage`:** `name`, `email`, `message`, `createdAt`. No guarda la IP: el límite de envíos vive en Redis.

### 4.3 Las tablas con datos

Los identificadores son UUID abreviados.

**`User`**

| id | email | role | emailVerifiedAt | status |
|---|---|---|---|---|
| `u-ana` | ana@example.com | customer | 2026-10-11 15:42 | active |
| `u-luis` | luis@example.com | provider | 2026-10-11 16:05 | active |
| `u-root` | admin@example.com | admin | 2026-10-09 10:00 | active |
| `u-sara` | sara@example.com | customer | *(vacío)* | active |

Ana es clienta con el correo verificado. Luis es proveedor. Sara se registró pero **no verificó**, por eso no puede iniciar sesión.

**`ProviderProfile`, `ProviderCategory` y `ProviderZone`**

| businessName | status | reviewRequestedAt | reviewedBy |
|---|---|---|---|
| Plomería Torres (`u-luis`) | verified | 2026-10-11 16:20 | `u-root` |
| Hogar Limpio | pending | *(vacío)* | |

| ProviderProfile | Category | | ProviderProfile | Zone |
|---|---|---|---|---|
| Plomería Torres | plomeria | | Plomería Torres | benito-juarez |
| Plomería Torres | electricidad | | Plomería Torres | coyoacan |

Plomería Torres ya fue aprobada y aparece en las búsquedas de "Plomería" en Coyoacán. Hogar Limpio está `pending` **sin `reviewRequestedAt`**: todavía no pidió la revisión, así que no aparece en la lista del administrador ni en el catálogo.

**`OneTimeToken`**

| purpose | usuario | expiresAt | usedAt |
|---|---|---|---|
| email_verification | u-sara | 2026-10-12 15:30 | *(vacío)* |
| email_verification | u-ana | 2026-10-12 15:30 | 2026-10-11 15:42 |
| password_reset | u-ana | 2026-10-11 18:00 | *(vacío)* |

El segundo ya se usó (por eso Ana está verificada), y el tercero está vigente.

**`AuditLog`**

| actor | action | entity | before → after | createdAt |
|---|---|---|---|---|
| u-root | provider.approved | Plomería Torres | pending → verified | 2026-10-11 16:25 |

Los ejemplos de `RefreshToken` están en la sección 5.4, porque dependen del flujo de sesión.

### 4.4 Esquema de Prisma (ilustrativo, sin verificar con Prisma 7.10.0)

```prisma
enum Role           { customer provider admin }
enum Locale         { es_MX @map("es-MX")  en }
enum UserStatus     { active cancelled }
enum ProviderStatus { pending verified rejected }
enum TokenPurpose   { email_verification password_reset email_change }

model User {
  id                   String       @id @default(uuid())
  email                String       @unique
  emailVerifiedAt      DateTime?    @db.Timestamptz(3)
  name                 String?
  phone                String?
  passwordHash         String?
  role                 Role         @default(customer)
  locale               Locale       @default(es_MX)
  privacyNoticeVersion String
  privacyAcceptedAt    DateTime     @db.Timestamptz(3)
  status               UserStatus   @default(active)
  createdAt            DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt            DateTime     @updatedAt @db.Timestamptz(3)

  provider      ProviderProfile?
  refreshTokens RefreshToken[]
  oneTimeTokens OneTimeToken[]
  auditLogs     AuditLog[]
}

model RefreshToken {
  id               String    @id @default(uuid())
  userId           String
  familyId         String
  sessionStartedAt DateTime  @db.Timestamptz(3)
  tokenHash        String    @unique
  expiresAt        DateTime  @db.Timestamptz(3)
  usedAt           DateTime? @db.Timestamptz(3)
  replacedById     String?
  revokedAt        DateTime? @db.Timestamptz(3)
  createdAt        DateTime  @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
  @@index([expiresAt])
}
```
Los demás modelos siguen el mismo patrón. **Puntos a verificar al instalar Prisma:**
- Que `@db.Timestamptz(3)` funcione igual en 7.10.0 (la documentación consultada mezcla la 7 y la candidata 8).
- Si `@default(uuid(7))` existe en 7.10.0. La versión 7 es ordenable por tiempo y da mejores índices; si no está, se usa `uuid()` (v4).
- Que el `datasource` no lleve `url` en Prisma 7 y la conexión viva en `prisma.config.ts`.
- La forma de normalizar el correo a minúsculas: en la aplicación y, si Prisma 7.10 lo soporta, con una restricción `CHECK` en la base.

### 4.5 Reglas del modelo

| Regla | Motivo |
|---|---|
| **Fechas siempre `timestamptz`** (ver sección 7) | Un instante sin ambigüedad |
| **El estado del correo se deduce de `emailVerifiedAt`** | Evita dos campos que se contradigan |
| **Los tokens se guardan solo como hash SHA-256** | Si se filtra la base, no se obtienen tokens utilizables |
| **Enums con guion** (`es-MX`) se escriben `es_MX` con `@map("es-MX")` | Prisma no admite guiones en los nombres |
| **Los usuarios no se borran, se anonimizan** | El `AuditLog` y las decisiones del administrador apuntan a usuarios |
| **Claves foráneas de tokens con `onDelete: Cascade`**, las demás con restricción | Los tokens no tienen sentido sin su usuario |
| **Índices** en `RefreshToken(userId, familyId, expiresAt)`, `OneTimeToken(userId, purpose)`, `ProviderProfile(status)`, `ProviderCategory(categoryId)` y `ProviderZone(zoneId)` | Las consultas de renovación, la lista del administrador y la búsqueda filtran por esos campos |
| **Contadores y bloqueos no van a la base** | Son temporales, y para eso está Redis |

### 4.6 Cancelar una cuenta (derecho de Cancelación, ARCO)

La fila de `User` **no se borra**: se **anonimiza**.

| Campo | Después de cancelar |
|---|---|
| `email` | Un valor técnico irrepetible, como `cancelled-<id>@manos.invalid` (`.invalid` es un dominio reservado que nunca existirá) |
| `name`, `phone`, `passwordHash` | Se vacían |
| `status` | `cancelled` |
| Perfil de proveedor | Deja de ser público y se vacían sus textos |
| Todas las familias de `RefreshToken` | Se revocan |

Se conserva la fila porque `AuditLog.actorId` y `ProviderProfile.reviewedById` apuntan a ella. La facturación **ya no forma parte del proyecto**, así que ese no es el motivo.

## 5. Autenticación y sesiones

### 5.1 Los dos tokens

| | **AT** (token de acceso) | **RT** (token de renovación) |
|---|---|---|
| Qué es | JWT firmado con `sub` (usuario), `role` y `sid` (la familia) | Cadena aleatoria opaca de 32 bytes |
| Dura | **15 minutos** | **1 hora de inactividad**, con tope de **7 días** desde el inicio de sesión |
| Cookie | `access` | `refresh` |
| Se envía a | Toda la API | Solo a `/v1/auth/…` |
| Se comprueba en la base | **No** (firma y fecha) | **Sí**, siempre |
| Para qué sirve | Probar quién eres en cada petición | Conseguir un AT nuevo sin la contraseña |

**Imagen para recordarlo:** el AT es la entrada del día; el RT es la pulsera que te permite pedir otra entrada.

Valores configurables por variables de entorno: `ACCESS_TOKEN_SECONDS=900`, `SESSION_IDLE_SECONDS=3600`, `SESSION_ABSOLUTE_SECONDS=604800`.

### 5.2 Las cookies

| Atributo | Valor | Por qué |
|---|---|---|
| `HttpOnly` | Sí | El JavaScript de la página no puede leerla (defensa contra robo por XSS) |
| `Secure` | Sí | Solo viaja por HTTPS |
| `SameSite` | `Lax` | No se envía en peticiones que cambian datos iniciadas desde otro sitio |
| `Path` de `access` | `/` | Se usa en toda la API |
| `Path` de `refresh` | **`/v1/auth`** | Solo viaja a las rutas de autenticación (renovar, cerrar sesión). El resto de la API nunca la ve |
| `maxAge` de `access` | 900 s | Igual que el AT |
| `maxAge` de `refresh` | 3600 s, renovado con cada rotación | Igual que la inactividad |

En NestJS 12 el `maxAge` de las cookies va en **segundos** (ver [08](08-phase-1-technical-decisions.md)).

**Por qué `Path=/v1/auth` y no solo `/v1/auth/refresh`.** El cierre de sesión necesita leer el RT para revocar la familia, y vive en `/v1/auth/logout`. Si la cookie solo viajara a `/refresh`, cerrar sesión con el AT ya vencido no podría identificar la sesión.

**No verificado:** cómo se comporta `Secure` con `http://localhost` en desarrollo en cada navegador.

### 5.3 Cómo se calcula cuándo vence un RT

```
expiresAt = el MENOR entre (ahora + 1 hora)  y  (sessionStartedAt + 7 días)
```

Cada rotación copia `sessionStartedAt` al token nuevo. Ejemplo cerca del límite: Ana inició sesión el día 0. El día 6, a las 23:30, renueva:
- Ahora + 1 hora = día 7, 00:30.
- Inicio + 7 días = día 7, 00:00.
- `expiresAt` = **día 7, 00:00**. A esa hora debe iniciar sesión otra vez.

**El matiz de la inactividad.** El RT solo se usa cuando el AT caduca (cada 15 minutos). La hora de inactividad cuenta **desde la última renovación**, no desde la última actividad. Por eso la inactividad tolerada está **entre 45 y 60 minutos**:

| Situación | ¿Sobrevive la sesión? |
|---|---|
| Usa la web cada 10 minutos | Sí, siempre |
| Última renovación 10:00, vuelve a las 10:50 | **Sí**: el AT venció y el RT vale hasta 11:00 |
| Última actividad 10:14 (con el AT aún válido) y vuelve a las 11:05 | **No**: el RT venció a las 11:00, con solo 51 minutos de inactividad real |
| Vuelve a las 11:10 sin haber hecho nada desde las 10:00 | **No** |

Para que fuera "1 hora exacta desde la última actividad" habría que renovar el RT con cada petición, con más escrituras en la base. Se acepta el margen y se documenta.

### 5.4 Qué pasa en cada caso (tabla `RefreshToken`)

Datos de los ejemplos: Ana inicia sesión el 11-oct a las 10:00 UTC.

#### Caso 1: AT válido y RT activo
**10:05.** Ana abre su perfil con `access=AT1`. El servidor comprueba la firma y que no venció: `200`.

| id | familia | expiresAt | usedAt | replacedById | revokedAt |
|---|---|---|---|---|---|
| `r1` | `F1` | 11-oct 11:00 | | | |

**La tabla no cambia.** El servidor no consulta la base para validar un AT.

#### Caso 2: el AT caduca y el RT sigue activo
**10:20.** El AT venció a las 10:15.

```
Navegador                                Servidor
   │── GET /v1/me  (access=AT1) ───────────▶│ AT1 vencido
   │◀────────────── 401 token_expired ──────│
   │── POST /v1/auth/refresh (refresh=R1) ─▶│ ¿r1 existe, no usado, no revocado, no vencido? Sí
   │◀── 200 + cookies nuevas: AT2 y R2 ─────│ r1 → usado; se crea r2
   │── GET /v1/me  (access=AT2) ───────────▶│
   │◀────────────── 200 ────────────────────│
```

| id | familia | expiresAt | usedAt | replacedById | revokedAt |
|---|---|---|---|---|---|
| `r1` | `F1` | 11-oct 11:00 | **10:20** | **`r2`** | |
| `r2` | `F1` | **11-oct 11:20** | | | |

Ana no nota nada: la web renueva y reintenta sola. `r1` quedó gastado y apuntando a su reemplazo; `r2` está vivo con otra hora de plazo.

#### Caso 3: uso continuo
Mientras Ana use la web, cada 15 minutos se repite el caso 2 y la cadena crece: `r1 → r2 → r3 → …`. La sesión sigue viva **hasta los 7 días**, momento en que `expiresAt` se queda en el tope.
- **Crecimiento de la tabla:** con uso constante son unas 96 filas por día y persona. Los tokens gastados **deben conservarse hasta su `expiresAt`** porque permiten detectar reutilizaciones. Una tarea periódica borrará las filas vencidas. Con 1 hora de vida, las filas viejas se pueden limpiar rápido.

#### Caso 4: el RT caduca por inactividad
Ana renovó por última vez a las 10:20 (el `r2` del caso 2) y se va. Vuelve a las 12:30. `r2` venció a las 11:20.

| id | familia | expiresAt | usedAt | replacedById | revokedAt |
|---|---|---|---|---|---|
| `r2` | `F1` | **11:20** (pasado) | | | |

Falla de dos formas, con el mismo resultado:
- **El navegador borró la cookie** (`maxAge` de 1 hora): no se envía nada, y el servidor responde `401`.
- **La cookie llegó, pero** `expiresAt` está en el pasado: `401 session_expired`.

Ana ve la pantalla de inicio de sesión y al iniciar se crea una **familia nueva** (`F2`). **No se revoca nada y no hay alarma**: un token vencido no es un ataque, es tiempo.

#### Caso 5: duración máxima de 7 días
Ana usa la web a diario y la sesión empezó el 11-oct 10:00. El 18-oct a las 09:50 renueva.
- Ahora + 1 hora = 10:50.
- Inicio + 7 días = 10:00.
- El nuevo `expiresAt` es **18-oct 10:00**: vence a los 10 minutos.

A las 10:00, aunque Ana esté activa, la renovación se rechaza (`session_max_age_exceeded`) y debe iniciar sesión.

#### Caso 6: cierre de sesión
**11:00.** Ana pulsa "Cerrar sesión".

| id | familia | revokedAt |
|---|---|---|
| `r1`…`r3` | `F1` | **11:00** |

Se **revoca toda la familia** y el servidor responde con cookies de caducidad inmediata. **Matiz:** el AT ya emitido sigue siendo técnicamente válido hasta que venza (máximo 15 minutos), porque se valida sin base de datos. Como el navegador borró la cookie, Ana no lo envía; un AT robado sí funcionaría esos minutos. Es el límite que se acepta al usar un AT sin estado.

#### Caso 7: robo de un RT
**7a. La persona legítima renueva primero.** Alguien copia `r2`. Ana renueva y se crea `r3`. Después el atacante presenta `r2`:

| id | familia | usedAt | replacedById | revokedAt |
|---|---|---|---|---|
| `r2` | `F1` | 10:20 | `r3` | **10:45** |
| `r3` | `F1` | | | **10:45** |

El servidor ve que `r2` **ya estaba usado**: eso solo ocurre si dos partes tienen el mismo token. **Revoca toda la familia**, incluido `r3`, y rechaza. El atacante pierde el acceso; Ana tendrá que iniciar sesión otra vez (un precio pequeño a cambio de cortar el robo).

**7b. El atacante renueva primero.** Consigue `r3'`. Cuando Ana presenta `r2`, el servidor ve que ya está usado y revoca la familia, incluido `r3'`. Igual resultado.

Un RT **que no existe** (inventado) simplemente se rechaza, **sin** revocar ninguna familia, porque no sabemos a cuál pertenecería.

#### Caso 8: dos pestañas renuevan a la vez (falso positivo)
Ambas piden renovar con el mismo `r2`. La primera gana y crea `r3`; la segunda llega con `r2`, ya usado, y el servidor lo trata como robo y revoca la familia: **Ana queda desconectada sin que nadie la ataque.**

**Decisión C:** la web **serializa las renovaciones**, de modo que solo una pestaña renueva a la vez y las demás esperan. Existe un mecanismo de navegador (la API Web Locks) pensado para esto, que **no verifiqué**. Es un detalle del PR de la web.

#### Caso 9: dos dispositivos
Teléfono (`F1`) y portátil (`F2`) son **familias independientes**. Cerrar sesión en uno no afecta al otro.

#### Caso 10: cambiar o recuperar la contraseña, o cancelar la cuenta
Se **revocan todas las familias** del usuario. Todos los dispositivos deben iniciar sesión otra vez. Al **cambiar** la contraseña estando conectado, se conserva la familia de la sesión actual (lo pide el escenario de `06`).

#### Resumen: qué hace el servidor con cada RT recibido

| Lo que ve el servidor | Resultado | ¿Se revoca algo? |
|---|---|---|
| No existe | `401` | No |
| Existe, vencido por inactividad | `401 session_expired` | No |
| Existe, pasó la duración máxima | `401 session_max_age_exceeded` | No |
| Existe, revocado | `401` | No |
| Existe, **ya usado** | `401` | **Sí: toda la familia** |
| Existe, vigente y no usado | Rota: AT y RT nuevos | Marca el actual como usado |

### 5.5 Flujos de las cuentas

**Registro.** Validar con Zod → calcular el hash argon2id (**siempre**, exista o no el correo, para que tarde lo mismo) → si el correo no existe, crear la cuenta y el `OneTimeToken` de verificación; si existe, no crear nada y enviar un correo avisando que ya tiene cuenta → **la respuesta es idéntica en ambos casos** → limitar por IP.

**Inicio de sesión.**
1. Si falta el servicio de contadores, **rechazar** (falla cerrada, ver 6.6).
2. Consultar la marca de bloqueo de la cuenta y el contador por IP. Si hay bloqueo, rechazar e indicar el tiempo restante.
3. Buscar la cuenta. Si no existe, **verificar igualmente un hash de relleno** para igualar el tiempo.
4. Verificar la contraseña. Si falla, sumar al contador y, al quinto fallo, crear el bloqueo de 15 minutos. Mensaje siempre igual.
5. Si el correo no está verificado, rechazar y ofrecer reenviar el enlace.
6. Emitir AT y RT (nueva familia, `sessionStartedAt = ahora`) y borrar el contador de fallos.

**Verificación de correo.** Al abrir el enlace: buscar el hash del token, comprobar que no venció ni se usó, marcar `usedAt` y rellenar `emailVerifiedAt`, en una sola transacción. Pedir un reenvío invalida los enlaces anteriores.

**Recuperación de contraseña.** Respuesta uniforme exista o no el correo. Enlace de 1 hora y un solo uso. Al restablecer: nueva contraseña, enlace gastado, **todas las familias revocadas** y aviso por correo. Una contraseña inválida **no gasta** el enlace.

**Cambio de correo.** Crea un `OneTimeToken` con `purpose = email_change` y `newEmail`. El correo de la cuenta **no cambia** hasta confirmar. Se avisa al correo anterior.

## 6. Seguridad

### 6.1 Autorización

| Medida | Cómo |
|---|---|
| **Deny by default** | Un guard global exige sesión en **todas** las rutas. Las públicas se marcan con `@Public()`. Olvidar la anotación falla cerrado |
| **Roles** | `@Roles('admin')` y un guard que compara con el `role` del AT |
| **Recursos propios** | Las consultas incluyen al dueño en el `where`. Un recurso ajeno devuelve **404**, no 403, para no confirmar que existe |
| **Asignación masiva** | Esquemas Zod **estrictos** que rechazan campos desconocidos. Nunca se pasa el cuerpo tal cual a Prisma |
| **Cambio de rol / estado** | No son campos editables desde el perfil. El estado del proveedor solo lo cambian las rutas de administración |
| **Validez del AT** | Se exige el algoritmo esperado al verificar (contra ataques de confusión de algoritmo) |

### 6.2 Qué es CSRF

Es un ataque que **aprovecha que el navegador envía las cookies automáticamente**. Como nuestros tokens van en cookies, nos afecta.

1. Ana inicia sesión en `manos.example`. Su navegador guarda la cookie de sesión.
2. Ana abre otra pestaña con una página maliciosa, `evil.example`.
3. Esa página tiene un formulario oculto que envía una petición a `api.manos.example/v1/me/cancel`.
4. El navegador envía esa petición **con la cookie de Ana**, porque el destino es `manos.example`. El servidor ve una sesión válida y cancela la cuenta.

Ana no hizo nada y el atacante nunca vio la cookie: solo hizo que el navegador de Ana la usara.

### 6.3 La defensa por capas

| Capa | Qué hace | Qué detiene |
|---|---|---|
| **1. `SameSite=Lax`** | El navegador no envía la cookie en peticiones que modifican datos iniciadas desde otro **sitio** | El ejemplo anterior: normalmente la cookie ni viaja |
| **2. Validar `Origin`** | Las peticiones que cambian datos deben traer un `Origin` de la lista permitida | Navegadores sin `SameSite`, y ataques desde otro **origen** dentro del mismo **sitio** |
| **3. Solo JSON** | Las rutas que cambian datos rechazan otro `Content-Type` con `415` | Los formularios clásicos de otra página, que no pueden enviar JSON sin que el navegador pregunte antes (CORS) |
| **4. `GET` sin efectos** | Nada que modifique estado se hace por `GET` | `Lax` sí envía cookies en navegaciones `GET` |
| **5. CORS estricto** | Solo el origen de la web puede leer respuestas y enviar cookies | Que otra página lea datos de una persona |

**Regla exacta de la validación de `Origin`** (aplica a `POST`, `PATCH`, `PUT` y `DELETE`):

| ¿Trae `Origin`? | ¿Trae cookie de sesión? | Resultado |
|---|---|---|
| Sí, y está permitido | Cualquiera | Se procesa |
| Sí, y **no** está permitido | Cualquiera (incluido el inicio de sesión) | **Rechazada** (`csrf_origin_rejected`) |
| **No** | Sí | **Rechazada** |
| **No** | No | Se procesa (herramientas de pruebas, clientes que no son navegadores) |

**Por qué esta combinación y no tokens CSRF** (un valor secreto que la página devuelve en cada petición):
- Con las capas 1 y 2 se obtiene la protección práctica **sin estado ni coordinación**: no hay que generar, guardar, entregar y reenviar un token en cada formulario.
- Nuestra web y nuestra API tienen **orígenes conocidos y fijos**, que es cuando validar `Origin` funciona bien.
- Menos piezas, menos código donde equivocarse (KISS).
- **Por qué no basta `SameSite` solo:** `api.manos.example` y `manos.example` son el **mismo sitio**, y `SameSite` no los distingue. Una página en un subdominio comprometido sí enviaría las cookies; la validación de `Origin` ve que el origen es distinto.

**Dónde no protege:**
- **Con XSS** (si alguien ejecuta su código dentro de `manos.example`) todas las capas fallan, porque el código malicioso ya sale desde un origen permitido. Por eso `HttpOnly`, `helmet`, una política de contenido (CSP) y escapar los textos son defensas aparte.
- **Una app móvil** (fase 6) no manda `Origin` ni usará cookies: usará un token en una cabecera, que no es vulnerable a CSRF porque el navegador no lo envía solo. Se decide al llegar a esa fase.
- **Herramientas sin navegador** (curl, pruebas) no mandan `Origin`: la regla solo las bloquea si traen la cookie de sesión.

**Fuente:** la mecánica de `SameSite` y de `Origin` es conocimiento estándar de seguridad web. La recomendación de combinarlas con otras capas la recuerdo de la guía de OWASP sobre CSRF, pero **no la consulté en esta sesión**.

### 6.4 Eventos de seguridad

Van a los **registros de pino** (no a la base). Se escribe el identificador de la cuenta cuando se conoce, y para correos desconocidos solo un HMAC, nunca el correo en claro.

| Evento | Cuándo |
|---|---|
| `auth.login_failed` | Contraseña o correo incorrectos |
| `auth.locked` | Se alcanza el bloqueo |
| `auth.refresh_reuse_detected` | Se presenta un RT ya usado |
| `authz.denied` | Rechazo por permisos |
| `csrf.origin_rejected` | Origen no permitido |
| `limiter.unavailable` | Redis no responde |

### 6.5 Límites de intentos en Redis

En Redis solo hay **contadores y marcas temporales con caducidad**. Si Redis se vaciara, no se perdería ningún dato del negocio.

**Convención:** prefijo `manos:` y `:` como separador. **El correo no se escribe en la clave**: se usa `HMAC-SHA256(correo, RATE_LIMIT_SECRET)`. Así, quien mire Redis no ve correos, y al ser un HMAC no se puede adivinar probando correos conocidos. `RATE_LIMIT_SECRET` es una variable nueva (se añadirá a `.env.example` en el PR que la use).

| Clave (ejemplo) | Tipo | Valor | TTL | Para qué |
|---|---|---|---|---|
| `manos:rl:login:acct:7c1e…` | contador | `3` | 900 s | Fallos de login de esa cuenta en 15 min |
| `manos:lock:login:acct:7c1e…` | marca | `1` | 900 s | La cuenta está **bloqueada** |
| `manos:rl:login:ip:203.0.113.5` | contador | `12` | 900 s | Fallos desde esa IP (límite 20) |
| `manos:rl:register:ip:203.0.113.5` | contador | `4` | 3600 s | Registros por IP (límite 10 por hora) |
| `manos:rl:resend:7c1e…` | contador | `2` | 3600 s | Reenvíos de verificación (límite 3) |
| `manos:rl:forgot:7c1e…` | contador | `1` | 3600 s | Recuperaciones de contraseña (límite 3) |
| `manos:rl:contact:ip:203.0.113.5` | contador | `1` | 3600 s | Mensajes de contacto (límite 3) |

Lo que se vería con `redis-cli` (salida ilustrativa):
```
127.0.0.1:6379> GET manos:rl:login:acct:7c1e…
"3"
127.0.0.1:6379> TTL manos:rl:login:acct:7c1e…
(integer) 612
127.0.0.1:6379> EXISTS manos:lock:login:acct:7c1e…
(integer) 0
```
3 fallos y quedan 612 segundos de ventana; la cuenta aún no está bloqueada.

**Cómo funciona el bloqueo:**
1. Antes de verificar la contraseña se consulta `manos:lock:login:acct:…`. Si existe, se rechaza y su `TTL` indica cuánto falta.
2. Si falla la contraseña: `SET <clave> 0 NX EX 900` y luego `INCR <clave>`.
3. Al llegar a 5: `SET manos:lock:login:acct:… 1 EX 900`. El bloqueo dura 15 minutos **desde ese instante**. Una ventana fija desde el primer fallo podría dejar el bloqueo en apenas un minuto.
4. Un login correcto borra el contador.

**Por qué `SET … NX EX` y luego `INCR`.** `SET NX EX` crea la clave **ya con su caducidad** si no existía, y `INCR` no la cambia. Así nunca queda un contador sin TTL, que era el fallo de usar `INCR` y `EXPIRE` por separado (ver 08, sección 5.8).

**Riesgo conocido del bloqueo por cuenta:** alguien podría bloquear a otra persona a propósito intentando entrar con su correo. Se acepta con la política aprobada y se mitiga con el límite de 15 minutos y el aviso por correo.

**Direcciones IP.** Confiar en `X-Forwarded-For` solo detrás de un proxy conocido; si no, un atacante cambiaría la cabecera en cada petición para evadir el límite. Se configura al desplegar.

### 6.6 Si Redis se cae

Las rutas **protegidas por el limitador** (registro, inicio de sesión, reenvíos, recuperación y contacto) **fallan cerradas**: devuelven un error temporal (`503`, código `rate_limit_unavailable`) y no continúan. Sin el contador no hay defensa contra la fuerza bruta.

Siguen funcionando las rutas que **no usan el limitador**: el catálogo público, la renovación de sesión y las rutas autenticadas, porque dependen solo de la base de datos.

Con `maxmemory-policy noeviction` (ver [06](06-local-services.md)), si Redis se llenara **rechaza escrituras en lugar de borrar claves**. Como todas nuestras claves caducan y son pequeñas, no debería llenarse.

## 7. Fechas: UTC o la zona del cliente

**Mejor práctica: guardar siempre el instante en UTC y convertirlo a la zona de quien mira solo al mostrarlo.**

| Dónde | Cómo |
|---|---|
| **Base de datos** | `timestamptz`: un instante absoluto. Aunque diga "con zona", **no guarda la zona**; al leer lo muestra según la zona de la sesión. Es no ambiguo, a diferencia de `timestamp` sin zona |
| **Servidor y base** | Configurados en UTC |
| **API** | Texto ISO 8601 con la `Z` de UTC: `2026-10-11T15:30:00Z` |
| **Pantalla** | La web convierte a la zona del navegador con `Intl.DateTimeFormat` y al idioma elegido: *"11 de octubre de 2026, 9:30"* |

**Por qué no guardar la hora del cliente:**

| Problema | Qué pasa |
|---|---|
| El reloj del cliente se puede cambiar o estar mal | Alguien podría hacer que un enlace "no venza" |
| Cada persona estaría en una zona distinta | No se pueden comparar ni ordenar los datos |
| Los viajes | La misma persona cambia de zona |
| Cambios de horario de verano | Una hora puede repetirse o no existir |

**Regla adicional:** todas las caducidades (24 h, 15 min, 1 h, 7 días) se calculan con el **reloj del servidor** (el `Clock` inyectable), nunca con una hora enviada por el cliente.

**Cuándo sí hace falta guardar una zona:** cuando algo se programa para una **hora de pared** futura, como "a las 9:00 hora de la Ciudad de México". Ahí se guarda el instante y además el nombre de zona IANA (`America/Mexico_City`). Llega en la fase 5, con los mensajes programados. Según recuerdo, México suprimió el horario de verano en 2022 salvo en municipios fronterizos; no lo verifiqué, y por eso se usan siempre datos IANA actualizados.

## 8. Superficie de la API

Prefijo `/v1`. Los errores devuelven un `code` estable (igual en todos los idiomas) y un `message` traducido.

```json
{ "code": "invalid_credentials", "message": "Correo o contraseña incorrectos", "details": [] }
```

| Estado | Uso |
|---|---|
| `400` | Datos inválidos (Zod) |
| `401` | Sin sesión, sesión expirada |
| `403` | Sin permiso; origen no permitido (CSRF) |
| `404` | No existe, **o existe pero no es tuyo** |
| `405` | Método no permitido (por ejemplo, `GET` en una ruta que cambia datos) |
| `409` | El estado ya cambió (dos administradores) |
| `415` | Tipo de contenido no admitido |
| `429` | Demasiados intentos. Incluye la cabecera `Retry-After` |
| `503` | Servicio temporalmente no disponible (Redis caído en rutas con límite) |

| Grupo | Rutas |
|---|---|
| Autenticación | `POST /v1/auth/register`, `verify-email`, `resend-verification`, `login`, `refresh`, `logout`, `forgot-password`, `reset-password` |
| Mi cuenta | `GET` y `PATCH /v1/me`, `POST /v1/me/email`, `POST /v1/me/email/confirm`, `POST /v1/me/password`, `POST /v1/me/cancel` |
| Mi perfil de proveedor | `GET` y `PATCH /v1/me/provider`, `POST /v1/me/provider/review-request` |
| Catálogo (público) | `GET /v1/providers` (con `category`, `zone`, `q`, `page`), `GET /v1/providers/:id`, `GET /v1/categories`, `GET /v1/zones` |
| Administración | `GET /v1/admin/providers?status=pending`, `POST /v1/admin/providers/:id/approve`, `POST /v1/admin/providers/:id/reject` |
| Contacto | `POST /v1/contact` |

**Búsqueda:** el texto (`q`) se compara con una consulta **parametrizada**, con los comodines `%` y `_` escapados. La paginación es por página (20 resultados) y devuelve el total. Orden estable por nombre. Más adelante, un índice de trigramas la acelerará.

## 9. Estructura de la API

```
apps/api/src/
  common/      guards, decorators, pipes, errores, Clock
  config/  prisma/  redis/  mail/  rate-limit/  audit/
  auth/  users/  providers/  catalog/  admin/  contact/
```

**Regla:** un módulo **no toca las tablas de otro**; le pide lo que necesita a su servicio. Es lo que mantiene separado un monolito modular. Toda fecha sale del `Clock` inyectable, y por eso Cucumber podrá adelantar el tiempo.

## 10. Orden de los PRs de la fase 1

| PR | Contenido |
|---|---|
| 1 | API base: esqueleto, configuración, registros, `/health`, Vitest **y la prueba mínima que resuelve el riesgo de Cucumber** (ver 08) |
| 2 | Prisma: esquema, primera migración, datos iniciales (categorías y las 16 alcaldías); **Mailpit** en el compose |
| 3 | Registro, verificación, inicio de sesión, renovación y cierre de sesión; limitador de intentos y protección CSRF |
| 4 | Recuperación de contraseña, perfil y cancelación de cuenta |
| 5 | Roles, perfil de proveedor y verificación por el administrador, con auditoría |
| 6 | Catálogo y búsqueda |
| 7 | Base de la web (Next.js, idioma, componentes accesibles, Lighthouse y axe en CI) |
| 8 | Pantallas y páginas informativas |

Cada PR lleva su documento (`10-…` en adelante) y deja en verde los escenarios que le corresponden.

## 11. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Sesión en el servidor (cookie con un identificador y consulta a Redis en cada petición) | Da revocación inmediata y es más simple, pero obliga a reescribir los escenarios de `03` y el documento 08. El AT con RT es una habilidad muy pedida en proyectos freelance |
| RT de 7 días sin tope de inactividad | Una sesión robada o abandonada duraba días |
| Solo inactividad de 1 hora, sin tope absoluto | Una persona activa nunca tendría que volver a iniciar sesión |
| "Recordarme" (sesión larga opcional) | Más lógica; no es necesario en la fase 1 |
| Ventana de gracia al reutilizar un RT | Contradice el escenario aprobado. Se resuelve con renovaciones de una en una |
| Tokens CSRF | Más piezas y estado; `Origin` basta con orígenes conocidos |
| Entidad Servicio | Ningún escenario la usa (YAGNI) |
| Contadores de intentos en PostgreSQL | Son temporales y de alta frecuencia; Redis es el lugar adecuado |
| Fallar abierto cuando Redis cae | Sin límite no hay defensa contra la fuerza bruta |
| Hash simple (SHA-256) del correo en las claves de Redis | Se podría adivinar probando correos conocidos |
| Borrar la fila al cancelar una cuenta | Rompería el historial de auditoría |
| Guardar la hora local del cliente | Ver sección 7 |

## 12. Riesgos y puntos sin verificar

| Punto | Estado | Cuándo se resuelve |
|---|---|---|
| Forma exacta del esquema de Prisma 7.10.0 (`@db.Timestamptz`, `uuid(7)`, `datasource` sin `url`) | Sin verificar | PR 2 |
| `Set-Cookie` con `Secure` y prefijos en `http://localhost` | Sin verificar | PR 3 |
| API Web Locks para serializar renovaciones entre pestañas | Sin verificar | PR de la web |
| La guía de OWASP sobre CSRF | Recordada, no consultada | Antes de cerrar el PR 3 |
| Lista de contraseñas comunes: **licencia** y fuente | Pendiente | PR 3 |
| Bloqueo por cuenta usable para molestar a otra persona | Riesgo aceptado | Observar al implementar |
| Cookie `refresh` con `Path=/v1/auth` | Decisión de diseño sin probar | PR 3 |
| El AT no se puede revocar antes de 15 minutos | Riesgo aceptado | |
| Cómo carga Cucumber TypeScript con decoradores | **Sin resolver** (ver 08) | PR 1 |
| Escribir `Set-Cookie` con `Path` distinto de la petición para borrar cookies | Sin verificar | PR 3 |

## 13. Cómo verificar

**a) Los escenarios son Gherkin válido y la cuenta coincide**
```bash
mkdir -p /tmp/gherkincheck && cd /tmp/gherkincheck
npm init -y >/dev/null && npm install --silent @cucumber/gherkin @cucumber/messages
# con un script que recorra docs/features/*.feature con el analizador (ver 07, sección 7)
grep -cE '^\s*(Escenario|Esquema del escenario):' docs/features/*.feature
```
Esperado: 11 archivos en español y una suma de **119** escenarios.

**b) No quedan menciones a la facturación.**
```bash
grep -rniE "factura|invoice|CFDI" README.md docs/ --include=*.md --include=*.feature
```
Esperado: ninguna coincidencia fuera de este documento y del 07, donde se registra que se retiró.

**c) Los números del 07 coinciden con los archivos.** Contar etiquetas: `grep -c "@seguridad" docs/features/*.feature` debe sumar 54.

**d) Revisión humana:** leer el modelo y los casos de tokens y comprobar que cada escenario de `03`, `05` y `07` tiene su parte en el diseño.

## 14. Trampas conocidas

- **Los fragmentos y el esquema son ilustrativos.** Se validan al implementar.
- **La inactividad real es de 45 a 60 minutos**, no una hora exacta (5.3).
- **Un RT vencido no es un ataque:** no revoca nada. Un RT **ya usado** sí lo es.
- **El AT no se revoca al cerrar sesión:** sigue válido hasta 15 minutos.
- **`SameSite` no distingue subdominios** del mismo sitio; por eso se valida también `Origin`.
- **`INCR` y `EXPIRE` por separado no son atómicos:** se usa `SET NX EX` y luego `INCR`.
- **Nunca guardar el correo en claro en las claves de Redis.**
- **Responder igual exista o no la cuenta** incluye el **tiempo** de respuesta, no solo el mensaje.
- **Los tokens gastados se conservan** hasta su `expiresAt`: son la prueba para detectar reutilizaciones.
- **El estado del correo se deduce de `emailVerifiedAt`:** no crear un campo aparte.
- **Los usuarios no se borran**, se anonimizan.

## 15. Para repetirlo en otro proyecto

1. Partir de los escenarios aprobados y bajarlos a tablas; anotar los huecos que aparezcan y resolverlos antes de programar.
2. Dibujar el diagrama entidad-relación, definir cada campo y rellenar tablas de ejemplo para detectar errores.
3. Decidir qué va a la base y qué va a Redis según si el dato es permanente o temporal.
4. Fijar la política de sesión con **dos límites** (inactividad y duración máxima) y calcular `expiresAt` como el menor de los dos.
5. Elegir la defensa CSRF según los orígenes (conocidos y fijos), y documentar dónde no protege.
6. Decidir qué hace cada protección cuando falla (abierta o cerrada) y escribirlo como escenario.
7. Guardar las fechas como instantes en UTC y convertir al mostrar.
8. Escribir el orden de los PRs, y marcar cada punto sin verificar con el momento en que se resolverá.
9. Actualizar el documento de escenarios con los cambios que nazcan del diseño.
10. Hacer el cambio por rama y PR, y documentarlo en el mismo commit.
