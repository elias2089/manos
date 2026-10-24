# 12. Convenciones de la API: prefijo, errores, validación y protección de peticiones

PR 3a-1: rama `feat/api-conventions`. Cambios en `apps/api/src/` (`app.setup.ts`, `main.ts`, `common/errors/` y `common/pipes/`).

PR 3a-2: rama `feat/csrf-protection`. Cambios en `app.setup.ts`, `config/env.schema.ts`, `common/errors/error-codes.ts` y `common/middleware/`: cabeceras de seguridad, CORS estricto y la protección contra CSRF.

## 1. Objetivo

Que la API tenga sus reglas comunes **antes** de que exista cualquier ruta de negocio:

- Las rutas de negocio viven bajo `/v1`; `/health` queda fuera.
- **Todo fallo** responde con la misma forma: `{ code, message, details }`. El cliente se apoya en el `code` estable, nunca en el texto.
- Un pipe aplica un esquema de Zod a la entrada de una ruta y responde `400` si no se cumple.
- Las respuestas llevan cabeceras de seguridad y no revelan el framework.
- Solo la aplicación web (`WEB_ORIGIN`) puede leer las respuestas y enviar cookies, y una petición que cambia datos desde otro sitio se rechaza.
- La aplicación real y las pruebas usan **la misma** configuración HTTP.

## 2. Glosario

| Término | Significado |
|---|---|
| **Prefijo global** | Texto que Nest antepone a todas las rutas: un controlador `ping` pasa a ser `/v1/ping` |
| **Exclusión del prefijo** | Lista de rutas que no reciben el prefijo. `/health` es infraestructura (la consulta el hosting para saber si la aplicación está viva), no parte de la API de negocio |
| **`configureApp()`** | Función que aplica las reglas HTTP en un solo sitio. La llaman `main.ts` y las pruebas, para que no puedan divergir |
| **Filtro de excepciones** | Clase que atrapa los errores y decide la respuesta. Uno con `@Catch()` sin argumentos atrapa **todos**, también los que Nest o Express lanzan antes de llegar al código de la ruta |
| **`ApiException`** | Error propio: lleva el `code` estable y una lista opcional de `details` |
| **Catálogo de errores** | Tabla de código a mensaje (hoy solo en español de México). El idioma se elige más adelante, con la característica de idioma |
| **Pipe** | Clase que Nest ejecuta sobre la entrada de una ruta (cuerpo, consulta, parámetros) antes del código de la ruta: transforma el valor o lo rechaza |
| **Esquema estricto (`z.strictObject`)** | Esquema de Zod que rechaza los campos que no lista. Es la defensa contra la asignación masiva (09, sección 6.1) |
| **`http-errors`** | Librería que usan Express y *body-parser* para sus errores: llevan un `statusCode` numérico pero no son excepciones de Nest |
| **Origen (*origin*)** | Esquema, servidor y puerto de una página, como `https://manos.example`. Sin ruta y sin barra final |
| **Cabecera `Origin`** | La envía el navegador en las peticiones entre sitios y una página no puede falsearla. Es la base de la defensa contra CSRF |
| **CORS** | Mecanismo con el que el servidor dice a qué orígenes deja leer sus respuestas y enviar cookies. Lo aplica el navegador |
| **Petición previa (*preflight*)** | Un `OPTIONS` que el navegador envía antes de una petición entre sitios para preguntar si está permitida |
| **CSRF** | *Cross-site request forgery*: una página maliciosa hace que el navegador de la víctima llame a nuestra API, y el navegador adjunta las cookies solo |
| **`helmet`** | Librería que añade cabeceras de seguridad a las respuestas y quita `X-Powered-By` |
| **Middleware** | Función que se ejecuta en toda petición, antes de saber qué ruta es |
| **Métodos que cambian datos** | `POST`, `PATCH`, `PUT` y `DELETE` (`UNSAFE_METHODS`). `GET` nunca debe cambiar datos |

## 3. Qué se hizo, paso a paso

### Paso 1. El prefijo `/v1` y `configureApp()`

`apps/api/src/app.setup.ts` exporta `configureApp(app)`, que `main.ts` llama justo después de crear la aplicación y que cada prueba de integración llama antes de `app.init()`. Lo que solo importa al ejecutar de verdad (el registro con pino, los *shutdown hooks* y `listen`) se queda en `main.ts`.

```ts
app.setGlobalPrefix('v1', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
```

| Decisión | Resultado | Motivo |
|---|---|---|
| Qué se excluye | Solo `GET /health` | Cualquier otro método sobre `/health` sigue dando `404` |
| Dónde vive la configuración | En `configureApp()`, no en `main.ts` | Si las pruebas montaran su propia configuración, podrían pasar mientras la real se comporta distinto |
| Orden | Se llama **antes** de `app.init()` | Nest registra las rutas al iniciar; después, el prefijo se ignora |

`app.setup.spec.ts` demuestra las dos mitades con un controlador `ping` propio de la prueba (aún no hay rutas de negocio): `/v1/ping` responde `200` y `/ping` `404`; `/health` responde `200` y `/v1/health` `404`. La prueba de `/health` ya existente también llama a `configureApp()`.

### Paso 2. El formato de los errores

Todo fallo responde:

```json
{ "code": "not_found", "message": "No encontramos lo que buscas", "details": [] }
```

| Pieza | Qué hace |
|---|---|
| `common/errors/error-codes.ts` | `ERROR_MESSAGES`: catálogo de código a mensaje. `ErrorCode` se deduce de sus claves, así que añadir un código sin su mensaje no compila |
| `common/errors/api.exception.ts` | `ApiException(status, code, details)`. Cada detalle es `{ field, code }`, **sin texto**: el cliente lo traduce |
| `common/errors/all-exceptions.filter.ts` | Filtro global que atrapa todo. Registrado en `configureApp()` con `app.get(HttpAdapterHost)` |

Cómo se elige la respuesta:

| Lo que llega al filtro | Estado | Código |
|---|---|---|
| Una `ApiException` | El suyo | El suyo, con sus `details` |
| Una excepción de Nest o un error con `statusCode` | El suyo | Según la tabla de abajo; si no está, `bad_request` (4xx) o `internal_error` (5xx) |
| Cualquier otra cosa | `500` | `internal_error`, mensaje genérico |

| Estado | Código |
|---|---|
| 400 | `bad_request` (y `validation_failed`, lo lanza el pipe) |
| 401 / 403 / 404 | `unauthorized` / `forbidden` / `not_found` |
| 413 / 415 / 429 | `payload_too_large` / `unsupported_media_type` / `too_many_requests` |
| 503 | `service_unavailable` |

**Un error inesperado nunca llega al cliente.** Los de estado 5xx se escriben en el registro con su detalle real, y la respuesta es siempre el mensaje genérico. Una prueba lo comprueba: el texto del error no aparece en la respuesta.

**Hallazgo: la versión instalada de Nest solo convierte dos errores de Express.** La documentación de Nest que consulté describe que los errores de *body-parser* (cuerpo demasiado grande, por ejemplo) se convierten en excepciones de Nest. En la 12.1.3 instalada, `mapException` solo convierte `SyntaxError` y `URIError`: un cuerpo de más de 100 kB llega al filtro como un error de `http-errors` y, sin tratamiento, daba `500`. La prueba lo descubrió. El filtro lee ahora el `statusCode` de cualquier error que lo traiga (`statusOf()`) y responde `413`.

Otras decisiones:

| Decisión | Resultado | Motivo |
|---|---|---|
| Idioma de `message` | Un catálogo en español de México | El idioma se elige con la característica de idioma (09); aún no existe |
| `CODE_BY_STATUS` | Un `Map` y no un objeto | Leer con `.get()` evita el aviso `security/detect-object-injection` sin silenciar nada |
| `ERROR_MESSAGES[code]` | Una sola línea con `eslint-disable-next-line` y su motivo | La clave es una unión cerrada que comprueba el compilador, nunca una entrada del usuario: es un falso positivo |
| `404` frente a `405` | `404` también para un método no permitido | Express y Nest no distinguen. El `405` se decide en el PR 4, cuando exista una ruta que cambia datos (`/v1/me/cancel`) |

### Paso 3. El pipe de Zod

`common/pipes/zod-validation.pipe.ts`: `ZodValidationPipe<T>` aplica un esquema, **devuelve los datos ya procesados** (valores por defecto y conversiones aplicados) y, si falla, lanza una `ApiException` `400 validation_failed` con un detalle por problema:

```ts
@Body(new ZodValidationPipe(signupSchema)) body: z.infer<typeof signupSchema>
```

| Caso de Zod 4 | `field` | `code` |
|---|---|---|
| Correo con formato inválido | `email` | `invalid_format` |
| Cadena demasiado corta | `password` | `too_small` |
| Campo ausente o de otro tipo | `profile.name` (los niveles se unen con puntos) | `invalid_type` |
| Un campo que el esquema no lista (esquema estricto) | `''` (vacío: es un problema del objeto entero) | `unrecognized_keys` |

El pipe se crea a mano en cada uso, así que no necesita inyección de dependencias. Se escribió propio y no con `nestjs-zod` porque este no declara compatibilidad con Nest 12 (08, sección 5.3).

### Paso 4. Cabeceras de seguridad, CORS y `WEB_ORIGIN`

`configureApp(app, options)` recibe ahora las opciones de la aplicación. La única hoy es `webOrigin`: el origen de la aplicación web. `main.ts` la lee de la variable de entorno `WEB_ORIGIN` y las pruebas usan `TEST_APP_OPTIONS` (`src/test/test-app-options.ts`, con `https://manos.example`, el origen de los archivos de comportamiento).

| Pieza | Qué hace |
|---|---|
| `WEB_ORIGIN` en `config/env.schema.ts` | **Obligatoria.** Debe ser un origen canónico: `http` o `https`, sin ruta y sin barra final, igual a como lo envía el navegador. Si no, la API no arranca |
| `app.use(helmet())` | Añade las cabeceras de seguridad (por ejemplo `X-Content-Type-Options: nosniff`) y quita `X-Powered-By`. Versión exacta `8.3.0` |
| `app.enableCors(...)` | Solo `WEB_ORIGIN` recibe permiso. Métodos `GET`, `POST`, `PATCH`, `PUT` y `DELETE`; cabecera permitida `Content-Type` |

Las credenciales (cookies) se deciden **en cada petición**: la configuración de CORS es una función que devuelve `credentials: true` solo si la cabecera `Origin` es igual a `WEB_ORIGIN`. Con una configuración fija, la librería enviaría el permiso a cualquier origen que lo pida.

| Decisión | Resultado | Motivo |
|---|---|---|
| Lista de un solo origen | La cabecera `Access-Control-Allow-Origin` solo se envía si el origen coincide | Un origen ajeno no recibe ninguna cabecera de permiso |
| Tipo `CorsAnswer` propio | Describe solo lo que se responde | Nest 12.1.3 no exporta sus tipos de CORS |
| `WEB_ORIGIN` obligatoria, sin valor por defecto | La API falla al arrancar sin ella | Un valor por defecto permisivo abriría CORS sin que nadie lo note |

Las pruebas, en `app.setup.spec.ts`, comprueban las cabeceras y que `X-Powered-By` desaparece; que una petición previa desde `WEB_ORIGIN` recibe permiso y credenciales; y que desde `https://evil.example` no recibe ninguna de las dos.

### Paso 5. Validación de `Origin` (CSRF)

CORS lo aplica el navegador y **no impide que la petición llegue al servidor**: solo impide que la página lea la respuesta. Una petición que cambia datos podría ejecutarse igual. Por eso el servidor comprueba el origen por su cuenta.

`common/middleware/origin.middleware.ts` exporta `createOriginMiddleware(webOrigin)`. Solo mira los métodos que cambian datos (`common/middleware/unsafe-methods.ts`):

| Petición | Resultado |
|---|---|
| `Origin` igual a `WEB_ORIGIN` | Pasa |
| `Origin` presente y distinto (también `null`, con barra final o con un servidor parecido) | `403 csrf_origin_rejected` |
| Sin `Origin` y sin cookie de sesión (`access` o `refresh`) | Pasa: es una herramienta como `curl` o una prueba, no un navegador con sesión |
| Sin `Origin` y con cookie de sesión | `403 csrf_origin_rejected` |

La comparación es exacta, sin tolerar una barra final ni un servidor más largo. La cookie se busca en la cabecera `Cookie` sin analizarla con una librería: aún no hace falta. Los nombres `access` y `refresh` son los que usará el PR 3d. El rechazo se escribe en el registro (`csrf.origin_rejected`) con el origen recortado a 200 caracteres, porque lo controla quien ataca.

Se registra con `app.use(...)` **después de `enableCors`**, para que las peticiones previas ya estén respondidas, y antes del enrutado, para no dejar ninguna ruta sin cubrir. El error pasa por `next(new ApiException(403, 'csrf_origin_rejected'))` y llega al filtro global: la respuesta tiene la forma de siempre. [Verificado en `routes-resolver.js` de Nest 12.1.3: `registerExceptionHandler`.]

Las pruebas (`origin.middleware.spec.ts`) usan un controlador propio con un contador de peticiones atendidas, para demostrar que un rechazo **no llega a la ruta**.

### Paso 6. Solo JSON

Un formulario clásico de otro sitio solo puede enviar `application/x-www-form-urlencoded`, `multipart/form-data` o `text/plain` sin que el navegador pregunte antes (CORS). Aceptar solo JSON en las rutas que cambian datos cierra ese camino (09, sección 6.3).

`common/middleware/json-only.middleware.ts` exporta `jsonOnlyMiddleware`. Responde `415 unsupported_media_type` cuando se cumplen **las tres** condiciones:

| Condición | Cómo se decide |
|---|---|
| El método cambia datos | `POST`, `PATCH`, `PUT` o `DELETE` |
| La petición lleva cuerpo | `Content-Length` mayor que 0, o alguna cabecera `Transfer-Encoding` |
| El tipo no es JSON | La parte anterior a `;` de `Content-Type`, sin espacios y en minúsculas, no es `application/json` |

Una petición sin cuerpo pasa aunque su `Content-Type` sea otro. Un cuerpo sin `Content-Type` se rechaza: *body-parser* lo ignoraría y dejaría `request.body` vacío sin avisar. `application/json; charset=utf-8` pasa; `application/json-evil` no.

Nest registra sus lectores de cuerpo dentro de `init()`, es decir, **después** de los `app.use` de `configureApp()`. Así el rechazo ocurre antes de analizar el cuerpo. [Verificado en `nest-application.js` y `express-adapter.js` de Nest 12.1.3.] El orden de los middleware es: `Origin`, solo JSON, lectores de cuerpo.

## 4. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Configurar el prefijo en `main.ts` | Las pruebas no lo ejecutarían y podrían pasar con rutas distintas a las reales |
| Excluir `/health` para todos los métodos | Un `POST /health` pasaría a existir sin que nadie lo pida |
| Un `/v1/health` versionado | Es un endpoint de infraestructura que consulta el hosting, no parte de la API de negocio |
| Dejar el formato de error por defecto de Nest | Cambia según el origen del error y no lleva un código estable |
| Mensajes de error con internacionalización completa ya | Demasiado para este PR; el idioma llega con su característica |
| Mensajes en inglés ahora y traducirlos después | Habría que reescribir las pruebas y el catálogo |
| Un `switch` de 10 casos para el catálogo | Más largo y sin más seguridad que la unión cerrada |
| Texto en cada detalle de un error | El cliente no podría traducirlo; el `code` basta |
| `nestjs-zod` | No declara compatibilidad con Nest 12 |
| Devolver el valor original en el pipe | Los valores por defecto y las conversiones no llegarían a la ruta |
| Un mecanismo genérico de `405` ahora | No hay ninguna ruta que cambie datos con la que probarlo |
| CORS con `origin: true` o `*` | Permitiría a cualquier sitio leer las respuestas |
| `credentials: true` fijo en CORS | La librería lo enviaría a cualquier origen que lo pida |
| Confiar solo en CORS contra CSRF | CORS no impide que la petición llegue al servidor, solo que la página lea la respuesta |
| Exigir siempre `Origin` | Rompería `curl`, las pruebas y las herramientas que no son un navegador |
| Aceptar cualquier petición sin `Origin` | Un navegador con sesión que no lo envía pasaría la defensa |
| Aceptar `Origin` por prefijo o ignorando la barra final | Un servidor como `https://manos.example.evil.example` pasaría |
| Una librería para leer las cookies en este PR | Solo hace falta saber si existe `access` o `refresh`; las cookies llegan en el PR 3d |
| Comprobar el origen en un guard en cada ruta | Habría que acordarse de ponerlo en cada ruta nueva; el middleware cubre todas |
| Dejar que los lectores de cuerpo rechacen el tipo | Un formulario ya se habría analizado, y el código de error sería el de la librería |

## 5. Cómo verificar

Con PostgreSQL arriba y la base de pruebas creada (ver 11):

```bash
pnpm -F @manos/api test
pnpm typecheck && pnpm lint:root && pnpm format:check
pnpm -F @manos/api build && pnpm -F @manos/api start
```

Esperado:

- Las pruebas pasan: 13 archivos y 91 pruebas. `lint:root` no debe mostrar avisos nuevos: el de la expresión regular de `seed-data.spec.ts` es anterior a este PR.
- La variable `WEB_ORIGIN` debe estar en el `.env` local (ver `.env.example`).
- Con la API arrancada, en otra terminal:

```bash
curl -i localhost:3000/health
curl -i localhost:3000/v1/health
curl -s -X POST localhost:3000/v1/x -H 'content-type: application/json' -d '{"a":'
```

- La primera responde `200` con `{"status":"ok", ...}`. La segunda, `404` con `{"code":"not_found","message":"No encontramos lo que buscas","details":[]}`. La tercera, `{"code":"bad_request","message":"La petición no es válida","details":[]}`.
- La respuesta de `/health` ya no lleva `X-Powered-By`.
- Protección de peticiones, con la API arrancada y `WEB_ORIGIN` igual a `http://localhost:3001`:

```bash
curl -s -X POST localhost:3000/v1/x -H 'content-type: application/json' -H 'origin: https://evil.example' -d '{}'
curl -s -X POST localhost:3000/v1/x -H 'content-type: application/json' -H 'cookie: access=x' -d '{}'
curl -s -X POST localhost:3000/v1/x -d 'a=1'
curl -s -X POST localhost:3000/v1/x -H 'content-type: application/json' -H 'origin: http://localhost:3001' -d '{}'
```

- Las dos primeras responden `403` con `"code":"csrf_origin_rejected"`. La tercera, `415` con `"code":"unsupported_media_type"`. La cuarta pasa las protecciones y da `404` porque la ruta no existe todavía.

## 6. Trampas conocidas

- **`configureApp()` después de `app.init()`.** El prefijo se ignora y las rutas nuevas dan `404`.
- **`HttpAdapterHost` importado con `import type`.** El filtro es una clase decorada y Nest necesita el valor en tiempo de ejecución.
- **Fiarse de la documentación sin comprobar la versión instalada.** Lo de `http-errors` salió así: la documentación describía un código más nuevo que el instalado. Se comprueba contra `node_modules`.
- **Un `500` en una prueba que debería dar `4xx`.** Casi siempre es un error que el filtro no reconoce como HTTP. Se mira su `statusCode`.
- **El registro de Nest en las pruebas.** Un `500` esperado llena la salida: la aplicación de prueba se crea con `{ logger: false }`.
- **`const [{ x }] = await ...`** no compila con `noUncheckedIndexedAccess` (ver 11); aquí vale lo mismo para cualquier lectura con índice.
- **`ErrorCode` sin mensaje.** Añadir un código nuevo exige su texto en `ERROR_MESSAGES`: el compilador lo comprueba.
- **Detalle con `field` vacío.** No es un fallo: es un problema del objeto entero, como un campo sobrante.
- **`WEB_ORIGIN` con barra final** (`https://manos.example/`). El navegador envía el origen sin ella; la variable se rechaza al arrancar para que no coincida nunca por error.
- **El middleware de `Origin` antes de `enableCors`.** Rechazaría las peticiones previas (`OPTIONS`) que el navegador envía primero.
- **Un `GET` que cambia datos.** Ninguna de estas protecciones mira los `GET`: la regla es que nunca cambien nada.
- **Una petición con cuerpo y sin `Content-Type` en una prueba.** Da `415`: hay que indicar el tipo.
- **Dos `app.use` en otro orden.** Si los lectores de cuerpo se registraran antes (con `useBodyParser`, por ejemplo), un formulario se analizaría antes de rechazarse.
- **Acceso dinámico `objeto[variable]` en las pruebas.** El linter lo marca (`security/detect-object-injection`); se evita con una tabla de funciones.

## 7. Pendientes

| Punto | Estado | Cuándo se resuelve |
|---|---|---|
| Prefijo global `/v1` con `/health` fuera | **Hecho** (paso 1) | |
| Formato de error con código estable | **Hecho** (paso 2) | |
| `X-Powered-By: Express` y demás cabeceras de seguridad | **Hecho** (paso 4, `helmet`) | |
| CORS estricto y validación de `Origin` | **Hecho** (pasos 4 y 5) | |
| Solo JSON (`415`) | **Hecho** (paso 6) | |
| Atributos de las cookies de sesión (`HttpOnly`, `Secure`, `SameSite=Lax`) | Pendiente: aún no hay cookies | PR 3d |
| Un `GET` nunca cambia datos | Regla vigente; se comprobará en cada ruta de lectura | PR 4 en adelante |
| Cabecera `Content-Security-Policy` propia | Pendiente: `helmet` aplica la de por defecto | Cuando exista el cliente web |
| `405` para un método no permitido | Decisión aplazada: hoy es `404` | PR 4, con `/v1/me/cancel` |
| Mensajes de error en otros idiomas | Pendiente: hoy solo español de México | Con la característica de idioma |
| Aviso `security/detect-unsafe-regex` en `seed-data.spec.ts` | Anterior a este PR; la expresión es segura en la práctica | Una limpieza aparte |
| Un token en la query de la URL aparece en los registros | Sin resolver | PR 3c y siguientes, con los enlaces de verificación y de recuperación |
