# 12. Convenciones de la API: prefijo, errores y validación

PR 3a-1: rama `feat/api-conventions`. Cambios en `apps/api/src/` (`app.setup.ts`, `main.ts`, `common/errors/` y `common/pipes/`). El PR 3a-2 (`feat/csrf-protection`) añadirá a este documento las cabeceras de seguridad, CORS y la protección contra CSRF.

> **Estado: en construcción.** Hoy cubre el prefijo `/v1`, el formato de los errores y el pipe de Zod. Al cerrar el PR 3a-2 se completan las secciones de CORS y de CSRF, y se quita este aviso.

## 1. Objetivo

Que la API tenga sus reglas comunes **antes** de que exista cualquier ruta de negocio:

- Las rutas de negocio viven bajo `/v1`; `/health` queda fuera.
- **Todo fallo** responde con la misma forma: `{ code, message, details }`. El cliente se apoya en el `code` estable, nunca en el texto.
- Un pipe aplica un esquema de Zod a la entrada de una ruta y responde `400` si no se cumple.
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

## 5. Cómo verificar

Con PostgreSQL arriba y la base de pruebas creada (ver 11):

```bash
pnpm -F @manos/api test
pnpm typecheck && pnpm lint:root && pnpm format:check
pnpm -F @manos/api build && pnpm -F @manos/api start
```

Esperado:

- Las pruebas pasan: 11 archivos y 55 pruebas. `lint:root` muestra un único aviso, el de la expresión regular de `seed-data.spec.ts`, anterior a este PR.
- Con la API arrancada, en otra terminal:

```bash
curl -i localhost:3000/health
curl -i localhost:3000/v1/health
curl -s -X POST localhost:3000/v1/x -H 'content-type: application/json' -d '{"a":'
```

- La primera responde `200` con `{"status":"ok", ...}`. La segunda, `404` con `{"code":"not_found","message":"No encontramos lo que buscas","details":[]}`. La tercera, `{"code":"bad_request","message":"La petición no es válida","details":[]}`.
- La respuesta de `/health` todavía lleva `X-Powered-By: Express`: la quita `helmet` en el PR 3a-2.

## 6. Trampas conocidas

- **`configureApp()` después de `app.init()`.** El prefijo se ignora y las rutas nuevas dan `404`.
- **`HttpAdapterHost` importado con `import type`.** El filtro es una clase decorada y Nest necesita el valor en tiempo de ejecución.
- **Fiarse de la documentación sin comprobar la versión instalada.** Lo de `http-errors` salió así: la documentación describía un código más nuevo que el instalado. Se comprueba contra `node_modules`.
- **Un `500` en una prueba que debería dar `4xx`.** Casi siempre es un error que el filtro no reconoce como HTTP. Se mira su `statusCode`.
- **El registro de Nest en las pruebas.** Un `500` esperado llena la salida: la aplicación de prueba se crea con `{ logger: false }`.
- **`const [{ x }] = await ...`** no compila con `noUncheckedIndexedAccess` (ver 11); aquí vale lo mismo para cualquier lectura con índice.
- **`ErrorCode` sin mensaje.** Añadir un código nuevo exige su texto en `ERROR_MESSAGES`: el compilador lo comprueba.
- **Detalle con `field` vacío.** No es un fallo: es un problema del objeto entero, como un campo sobrante.

## 7. Pendientes

| Punto | Estado | Cuándo se resuelve |
|---|---|---|
| Prefijo global `/v1` con `/health` fuera | **Hecho** (paso 1) | |
| Formato de error con código estable | **Hecho** (paso 2) | |
| `X-Powered-By: Express` y demás cabeceras de seguridad | Pendiente: lo cubre `helmet` | PR 3a-2 |
| CORS estricto y validación de `Origin` | Pendiente | PR 3a-2 |
| `405` para un método no permitido | Decisión aplazada: hoy es `404` | PR 4, con `/v1/me/cancel` |
| Mensajes de error en otros idiomas | Pendiente: hoy solo español de México | Con la característica de idioma |
| Aviso `security/detect-unsafe-regex` en `seed-data.spec.ts` | Anterior a este PR; la expresión es segura en la práctica | Una limpieza aparte |
| Un token en la query de la URL aparece en los registros | Sin resolver | PR 3c y siguientes, con los enlaces de verificación y de recuperación |
