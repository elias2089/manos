# 06. Servicios locales: PostgreSQL y Redis con Docker Compose

PR: `chore/local-services`. Archivos nuevos: `docker-compose.yml`. Cambios en `package.json`, `.github/dependabot.yml` y `.env.example` (este último lo edita la persona, no el asistente).

## 1. Objetivo

Levantar PostgreSQL 17 y Redis 8 en tu máquina con un solo comando, sin instalarlos, de forma segura y con los datos persistentes, listos para la fase 1. Con este PR se cierra la fase 0 (cimientos).

## 2. Glosario

| Término | Significado |
|---|---|
| **Docker** | Programa que ejecuta aplicaciones aisladas del resto del sistema, en "contenedores" |
| **Imagen** | La plantilla de solo lectura de la que se crea un contenedor (por ejemplo, `postgres:17-alpine`) |
| **Contenedor** | Una imagen en ejecución. Se puede borrar y crear de nuevo sin perder datos, si estos están en un volumen |
| **Docker Compose** | Herramienta que describe varios contenedores en un archivo YAML y los arranca juntos |
| **Servicio** | Cada contenedor definido en el compose (`postgres`, `redis`) |
| **Proyecto (compose)** | El nombre que agrupa los recursos de un compose (contenedores, red, volúmenes). Aquí, `manos` |
| **Volumen** | Almacenamiento que Docker gestiona fuera del contenedor, para que los datos sobrevivan cuando se borra |
| **Puerto publicado** | Un puerto del contenedor que se expone en tu máquina (`5432:5432`) |
| **Interfaz de red `127.0.0.1` (localhost)** | La dirección que solo existe dentro de tu propia máquina. Nada externo puede conectarse a ella |
| **`0.0.0.0`** | "Todas las interfaces": accesible desde cualquier equipo de la red |
| **Healthcheck** | Comando que Docker ejecuta cada pocos segundos para saber si el servicio funciona de verdad |
| **Interpolación** | Sustituir `${VARIABLE}` en el compose por el valor de tu entorno o de `.env` |
| **Digest** | El hash `sha256:...` de una imagen. Es inmutable, a diferencia de una etiqueta (tag) |
| **PostgreSQL** | Base de datos relacional. Guarda los datos permanentes del negocio |
| **Redis** | Almacén de datos en memoria, muy rápido. Lo usamos para datos temporales o reconstruibles |
| **BullMQ** | Librería de colas de trabajos que usa Redis. La usaremos para los mensajes programados |
| **AOF (append-only file)** | El modo de Redis que guarda en disco cada escritura, para recuperarla tras un reinicio |
| **`psql`** | El cliente de línea de comandos de PostgreSQL |
| **`redis-cli`** | El cliente de línea de comandos de Redis |
| **DBeaver** | Cliente gráfico para bases de datos. Lo usamos para ver y consultar PostgreSQL desde Windows |
| **Redis Insight** | Cliente gráfico oficial de Redis, para explorar claves y colas |
| **WSL** | Windows Subsystem for Linux: el entorno Linux donde corre tu proyecto y Docker |
| **`pg_hba.conf`** | Archivo de PostgreSQL que decide desde dónde puede conectarse cada usuario y con qué método |

## 3. Teoría

### 3.1 Qué guarda cada servicio

**PostgreSQL: la memoria permanente.** Los datos que no puedes perder: usuarios, roles, proveedores, servicios, conversaciones, leads, suscripciones y pagos. Es relacional porque nuestros datos están muy conectados (un lead pertenece a un cliente, a un proveedor y a una conversación), y garantiza **transacciones**: si cobras y activas la suscripción, o se hacen las dos cosas o ninguna. La aplicación hablará con ella mediante Prisma, que usa consultas parametrizadas y reduce el riesgo de inyección SQL (OWASP A03).

**Redis: la memoria rápida.** Datos temporales o reconstruibles:

| Uso | Qué hace |
|---|---|
| Colas (BullMQ) | Mensajes programados y reintentos: "envía este recordatorio mañana a las 9:00" |
| Rate limiting | Contar intentos de login o mensajes al bot por usuario, contra fuerza bruta y abuso de costo (OWASP A07) |
| Caché | Guardar resultados de búsquedas pesadas |
| Tiempo real | Coordinar el inbox de agentes |

Regla del proyecto: lo que no se puede perder (un pago, un usuario) va a PostgreSQL; lo transitorio, a Redis.

### 3.2 Por qué Docker Compose y no instalarlos

- Misma versión en tu máquina, en la de cualquier colaborador y en el CI.
- Nada que instalar ni desinstalar, y el sistema anfitrión queda limpio.
- Un archivo describe el entorno completo: es documentación ejecutable.
- Es solo para desarrollo. **No** es la configuración de producción.

### 3.3 Cómo funciona un archivo compose

Un `docker-compose.yml` tiene tres bloques principales:
- `services`: los contenedores y su configuración.
- `volumes`: los volúmenes con nombre que usan los servicios.
- `name`: el nombre del proyecto.

El nombre del proyecto es el prefijo de todo lo que crea (contenedores `manos-postgres-1`, volumen `manos_postgres_data`). Se puede sobrescribir con la variable `COMPOSE_PROJECT_NAME` o la opción `-p`, y así lo hicimos al verificar para no mezclar datos de prueba con los tuyos.

### 3.4 Por qué los datos sobreviven

Un contenedor es desechable: `docker compose down` lo borra. Los datos, en cambio, están en un **volumen con nombre**, que Docker conserva aparte.

| Comando | Qué ocurre con los datos |
|---|---|
| `docker compose down` | Borra contenedores y red. **Los volúmenes se conservan** |
| `docker compose down -v` | Borra además los volúmenes. **Pierdes todos los datos** |

### 3.5 Interpolación de variables y el operador `:?`

El compose lee las variables de tu entorno y del archivo `.env` de la raíz. La sintaxis `${VARIABLE}` las sustituye.

`${VARIABLE:?mensaje}` hace que Compose **falle** con ese mensaje si la variable no existe o está vacía. Lo usamos en todas las contraseñas y nombres: no hay valores por defecto. Es preferible fallar a arrancar con una clave de ejemplo que alguien olvide cambiar (OWASP A07, fallas de autenticación).

Un detalle: Compose interpola **todo el archivo** en cualquier comando (`up`, `exec`, `ps`, `down`), no solo en `up`. Si falta una variable, hasta `docker compose ps` falla.

### 3.6 `$$` frente a `$`

Dentro del compose, `$VARIABLE` o `${VARIABLE}` las sustituye **Compose** antes de crear el contenedor. Para que la variable llegue tal cual al shell **dentro** del contenedor, se escribe `$$VARIABLE`. Lo usamos en los healthchecks y en el comando de Redis.

### 3.7 Seguridad de red: por qué `127.0.0.1:5432:5432`

Un puerto se publica como `[interfaz:]puerto_host:puerto_contenedor`.

| Escrito | Quién puede conectarse |
|---|---|
| `5432:5432` | **Toda tu red** (se publica en `0.0.0.0`). Cualquiera que llegue a tu máquina vería tu base de datos |
| `127.0.0.1:5432:5432` | **Solo tu máquina** |

Es la diferencia entre una base de datos privada y una expuesta (OWASP A05, mala configuración). Lo comprobamos con `ss -ltn`.

### 3.8 Cómo funciona la autenticación en cada servicio

**PostgreSQL.** La imagen oficial configura `pg_hba.conf` de modo que:
- Las conexiones **desde dentro del propio contenedor** (`127.0.0.1` o el socket local) se aceptan **sin contraseña** (`trust`).
- Las conexiones **desde cualquier otro sitio** exigen contraseña (`scram-sha-256`).

Esto tiene una consecuencia práctica importante: si ejecutas `docker compose exec postgres psql -h 127.0.0.1 ...`, **entras sin que se compruebe la contraseña**. Para probar la autenticación hay que conectarse desde *otro* contenedor en la misma red (ver 7). Descubrimos esto al verificar, porque nuestra primera prueba aceptó una contraseña incorrecta.

**Redis.** Sin `--requirepass`, cualquier proceso que alcance el puerto puede leer y escribir todo. Con él, toda conexión debe autenticarse (`NOAUTH Authentication required` si no lo hace, `WRONGPASS` si la contraseña es incorrecta).

### 3.9 Cómo pasamos la contraseña de Redis

Hay tres formas, de peor a mejor:

| Forma | Problema |
|---|---|
| `command: redis-server --requirepass micontraseña` | La contraseña queda escrita en el archivo compose, y en la configuración del contenedor (`docker inspect`, campo `Config.Cmd`) |
| `--requirepass "${REDIS_PASSWORD}"` con interpolación de Compose | Compose sustituye el valor antes de crear el contenedor, así que también queda en `Config.Cmd` |
| **`sh -c 'exec redis-server --requirepass "$$REDIS_PASSWORD" ...'`** (la nuestra) | `$$` hace que Compose **no** sustituya nada: en `Config.Cmd` solo aparece el texto `$REDIS_PASSWORD`. El valor lo resuelve el shell **dentro** del contenedor, a partir de su entorno |

Qué verificamos y qué no:
- **Medido:** `docker compose top redis | grep "$REDIS_PASSWORD"` da **0** coincidencias (el listado sí tenía el proceso, no estaba vacío).
- **No verificado:** el motivo. Al hacer `exec`, el shell ya expandió la variable y la pasa como argumento a `redis-server`; que no se vea en la lista de procesos se debe, probablemente, a que Redis reescribe el título de su proceso al arrancar. Es nuestra explicación, no la comprobamos en el código de Redis.
- **Sigue presente:** la contraseña está en el **entorno** del contenedor (`docker inspect` la muestra en `Config.Env`). Para desarrollo local es aceptable. En producción se usarían los secretos del orquestador.

`exec` reemplaza al shell por `redis-server`: así Redis queda como proceso principal del contenedor y recibe las señales de parada correctamente.

### 3.10 Opciones de Redis que elegimos

| Opción | Por qué |
|---|---|
| `--requirepass` | Autenticación (3.8) |
| `--maxmemory-policy noeviction` | Si la memoria se llena, Redis **rechaza** nuevas escrituras en lugar de borrar datos antiguos. BullMQ lo necesita, porque un trabajo en cola que se elimina es un mensaje que nunca se envía |
| `--appendonly yes` | AOF: cada escritura se guarda en disco, para que los datos sobrevivan a un reinicio |

### 3.11 Healthchecks y `--wait`

Un contenedor "arrancado" no es lo mismo que un servicio "listo". El healthcheck ejecuta un comando cada `interval` segundos; tras `retries` fallos seguidos, lo marca `unhealthy`. `docker compose up --wait` espera hasta que todos estén `healthy`, así que el comando solo termina cuando puedes conectarte.

| Servicio | Comprobación | Qué hace |
|---|---|---|
| PostgreSQL | `pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"` | Pregunta al servidor si acepta conexiones |
| Redis | `REDISCLI_AUTH="$$REDIS_PASSWORD" redis-cli ping \| grep -q PONG` | Envía `PING` con la contraseña y exige la respuesta `PONG` |

`REDISCLI_AUTH` es una variable de entorno que `redis-cli` lee como contraseña, evitando pasarla como argumento. Se usa `grep -q PONG` porque **`redis-cli` sale con código `0` incluso cuando el servidor responde `NOAUTH`**: el código de salida por sí solo no basta para saber si el servicio está sano.

### 3.12 Otras opciones del compose

| Opción | Efecto |
|---|---|
| `restart: unless-stopped` | Docker reinicia el contenedor si falla o si Docker arranca, salvo que lo hayas parado a mano |
| `security_opt: no-new-privileges:true` | Los procesos del contenedor no pueden obtener más privilegios de los que ya tienen. Reduce el daño si algo se compromete |
| Imagen `...-alpine` | Variante basada en Alpine Linux: más pequeña y con menos programas instalados, por lo que hay menos superficie de ataque |
| `tag@sha256:digest` | La etiqueta (`17-alpine`) es legible; el digest fija la imagen exacta. Si alguien reemplaza el contenido de la etiqueta en Docker Hub, tu compose seguirá usando la original (OWASP A08) |

### 3.13 Redis 8 y su licencia

Redis cambió de licencia: desde la versión 8 está disponible también bajo AGPLv3. Para uso en **desarrollo local** no afecta. Si en algún momento ofrecieras Redis como un servicio a terceros, habría que revisarla. Valkey es una alternativa compatible totalmente abierta; la descartamos porque BullMQ documenta Redis y no verificamos su soporte oficial de Valkey.

## 4. Qué hicimos

### 4.1 `docker-compose.yml`, bloque por bloque

**Cabecera y nombre**
```yaml
name: manos
```
Nombre del proyecto: prefijo de contenedores, red y volúmenes.

**Servicio `postgres`**

| Línea | Qué hace |
|---|---|
| `image: postgres:17-alpine@sha256:b0f9...` | PostgreSQL 17 (verificado: 17.11) en variante Alpine, fijado por digest |
| `restart: unless-stopped` | Ver 3.12 |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` con `${...:?mensaje}` | Usuario, contraseña y base de datos iniciales. Falla si faltan (3.5) |
| `ports: '127.0.0.1:5432:5432'` | Puerto solo local (3.7) |
| `volumes: postgres_data:/var/lib/postgresql/data` | Datos persistentes en un volumen con nombre |
| `security_opt: no-new-privileges:true` | Ver 3.12 |
| `healthcheck` | `pg_isready` (3.11), con `$$` (3.6), cada 5 s, tiempo máximo 3 s, 10 reintentos |

**Servicio `redis`**

| Línea | Qué hace |
|---|---|
| `image: redis:8-alpine@sha256:3811...` | Redis 8 (verificado: 8.10.2) en variante Alpine, fijado por digest |
| `REDIS_PASSWORD` con `${...:?mensaje}` | Contraseña obligatoria |
| `command: [sh, -c, exec redis-server ...]` | Arranque con contraseña desde el entorno y opciones de 3.9 y 3.10 |
| `ports: '127.0.0.1:6379:6379'` | Puerto solo local |
| `volumes: redis_data:/data` | Directorio donde Redis guarda su AOF |
| `healthcheck` | `redis-cli ping` autenticado (3.11) |

**Volúmenes**
```yaml
volumes:
  postgres_data:
  redis_data:
```
Declara los dos volúmenes con nombre. Sin esta declaración, Compose rechaza usarlos.

### 4.2 Otros cambios

| Archivo | Cambio |
|---|---|
| `package.json` | Scripts `services:up` (`docker compose up -d --wait`), `services:down` y `services:logs` |
| `.github/dependabot.yml` | Nuevo ecosistema `docker-compose`: propone actualizar las imágenes (tag y digest) cada semana, agrupadas. Más tarde se le añadió un `ignore` de versiones mayores de `postgres` y `redis` (ver 8) |
| `.env.example` | Variables nuevas. **Lo editas tú** (ver 4.3) |
| `README.md` | Sección "Local setup" con el arranque real |
| `docs/05-ci-and-secrets.md` | Nota con el resultado de la prueba de checks obligatorios |

### 4.3 `.env.example`: contenido

Sustituye por completo el contenido de `.env.example` por este (el asistente no puede escribir archivos `.env*`):

```
# Environment variables template.
#
# This file is tracked by git and must NEVER contain real values.
# To use it locally: copy it to .env and fill in your own values.
#
#   cp .env.example .env
#
# Rules:
# - Every new variable is added here, with a placeholder value, in the same
#   commit that starts using it.
# - Development uses test credentials only (Stripe test mode, Meta test number).
# - Production secrets live in the hosting platform's secret manager.

# --- Local services (docker-compose.yml) ---
# Generate each password with: openssl rand -hex 24
POSTGRES_USER=manos
POSTGRES_PASSWORD=change-me
POSTGRES_DB=manos
REDIS_PASSWORD=change-me
```

**Por qué `openssl rand -hex 24`.** Genera 48 caracteres hexadecimales aleatorios. Usamos hexadecimal y no base64 porque base64 incluye `+`, `/` y `=`, que rompen las URL de conexión (`postgresql://usuario:contraseña@host/...`) que usaremos en la fase 1.

## 5. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| PostgreSQL 18 | No verificamos su soporte en Prisma y el resto del ecosistema. La 17 está más probada |
| Valkey en lugar de Redis | BullMQ documenta Redis; no verificamos el soporte de Valkey (3.13) |
| Instalar PostgreSQL y Redis directamente en el sistema | Versiones distintas entre máquinas y un entorno más difícil de limpiar |
| `5432:5432` sin `127.0.0.1` | Expone la base de datos a toda la red local |
| Contraseñas por defecto en el compose | Se olvidan de cambiar; fallar es más seguro |
| Contraseña de Redis como argumento de `command` | Visible en procesos e inspección |
| Imagen sin digest | Una etiqueta se puede mover |
| Imágenes Debian (sin `-alpine`) | Más grandes y con más programas instalados |
| Un `.env` para producción | Este compose es solo de desarrollo; producción usa secretos del hosting |
| Healthcheck solo con `redis-cli ping` y el código de salida | `redis-cli` sale con `0` aunque la respuesta sea `NOAUTH` |
| Añadir un job de CI que levante el compose | YAGNI: aún no hay código que lo necesite. Se evalúa en la fase 1 |

## 6. Cómo usarlo

**Primera vez**
```bash
cp .env.example .env
```
Edita `.env` y sustituye cada `change-me` por una contraseña aleatoria (`openssl rand -hex 24`). El archivo `.env` está ignorado por Git.

```bash
pnpm services:up
```
Esperado: ambos servicios terminan en `Healthy` y el comando devuelve el control.

**Día a día**

| Comando | Qué hace |
|---|---|
| `pnpm services:up` | Arranca y espera a que estén listos |
| `pnpm services:down` | Para y borra contenedores; **conserva los datos** |
| `pnpm services:logs` | Muestra los registros en vivo (sal con `Ctrl+C`) |
| `docker compose ps` | Estado de cada servicio |
| `docker compose down -v` | **Borra también los datos.** Úsalo para empezar de cero |

**Entrar a los clientes (sin instalar nada)**
```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli'
```
Las comillas simples hacen que las variables las resuelva el shell **dentro del contenedor**, donde ya existen; así no escribes tus contraseñas en la terminal.

**Entrar a los clientes (instalando herramientas)**

Un cliente gráfico permite ver tablas, ejecutar consultas y explorar claves con una interfaz, sin escribir comandos. Se instala en **Windows**, y se conecta a los servicios que corren en Docker dentro de WSL a través de los puertos publicados en `127.0.0.1` (ver 3.7).

| Servicio | Herramienta recomendada | Por qué |
|---|---|---|
| PostgreSQL | **DBeaver Community** | Gratuito, de código abierto, y se conecta a casi cualquier base de datos, así que te sirve también en otros proyectos |
| Redis | **Redis Insight** | Es la herramienta gráfica oficial de Redis, gratuita, y muestra colas, tipos de datos y memoria |

Alternativa para Redis: *Another Redis Desktop Manager*, de código abierto. **No recomiendo DBeaver para Redis**: según recuerdo, la edición Community no incluye soporte para Redis (lo trae la edición de pago); no lo verifiqué, y no lo necesitas porque Redis Insight lo cubre mejor.

*Antes de empezar:* los servicios deben estar arriba (`pnpm services:up`) y debes tener a mano los valores de tu `.env` (usuario, contraseña y base de datos de PostgreSQL; contraseña de Redis). Abre `.env` en tu editor para copiarlos; no los pegues en capturas ni en chats.

### Conectarse a PostgreSQL con DBeaver

**1. Instalar.** Descarga el instalador de DBeaver Community desde su sitio oficial (dbeaver.io) y ejecútalo. Alternativa desde PowerShell de Windows: `winget install DBeaver.DBeaver.Community` (confirma el identificador con `winget search dbeaver`, porque no lo verifiqué).

**2. Crear la conexión.** Menú **Database → New Database Connection**, elige **PostgreSQL** y pulsa **Next**. En la pestaña **Main** rellena:

| Campo | Valor | Explicación |
|---|---|---|
| Connect by | Host | |
| **Host** | `127.0.0.1` | Usa la IP y **no** `localhost`: `localhost` puede resolverse a `::1` (IPv6), y nuestro puerto solo escucha en IPv4 (`127.0.0.1`) |
| **Port** | `5432` | El puerto publicado por el compose |
| **Database** | el valor de `POSTGRES_DB` | Por defecto, `manos` |
| **Username** | el valor de `POSTGRES_USER` | Por defecto, `manos` |
| **Password** | el valor de `POSTGRES_PASSWORD` | La que generaste con `openssl rand -hex 24` |
| Show all databases | desactivado | |

Marca **Save password** si quieres que DBeaver la recuerde. Se guarda cifrada en tu usuario de Windows; es aceptable para una base de desarrollo local.

**3. Descargar el driver.** La primera vez, DBeaver pide descargar el driver de PostgreSQL: acepta con **Download**. Necesita internet una sola vez.

**4. Probar.** Pulsa **Test Connection**. Esperado: un mensaje de conexión correcta con la versión del servidor (PostgreSQL 17.x). Después **Finish**.

**5. Marcar la conexión como de desarrollo (opcional, recomendado).** En **Edit Connection → General → Connection type**, elige **Development** (o el equivalente de tu versión). Los tipos de conexión de DBeaver pueden pedir confirmación en operaciones destructivas y colorean la barra, de modo que una conexión a producción, el día que exista, no se confunda con esta.

**6. Usarla.** En el panel izquierdo, expande la conexión → **Databases → manos → Schemas → public → Tables**. Hoy no verás tablas, porque aún no hay migraciones (llegan en la fase 1). Para comprobar que funciona, abre un editor SQL (**SQL Editor → New SQL script**, o `Ctrl+]`) y ejecuta:
```sql
select version();
```
Con `Ctrl+Enter` se ejecuta la sentencia donde esté el cursor.

### Conectarse a Redis con Redis Insight

**1. Instalar.** Descarga Redis Insight desde la página oficial de Redis (redis.io, sección de Redis Insight) y ejecuta el instalador. Alternativa con `winget`: busca el identificador con `winget search redis insight` y ejecútalo con `winget install <id>`.

**2. Añadir la base de datos.** En la pantalla de inicio pulsa **Add Redis database** (o **+ Add**) y elige **Connection Settings**. Rellena:

| Campo | Valor | Explicación |
|---|---|---|
| **Host** | `127.0.0.1` | Mismo motivo que en DBeaver |
| **Port** | `6379` | |
| Database Alias | `manos-local` | Un nombre a tu gusto |
| **Username** | *(vacío)* | Redis usa el usuario `default`; no hace falta escribirlo |
| **Password** | el valor de `REDIS_PASSWORD` | |

**3. Probar y guardar.** Pulsa **Test Connection** y, si responde bien, **Add Redis Database**.

**4. Usarla.** Abre la conexión: la sección **Browser** lista las claves (hoy estará vacía, hasta la fase 2, cuando BullMQ cree colas), y **Workbench** permite ejecutar comandos como `PING`, que debe devolver `PONG`.

### Si no conecta

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Connection refused` o `timeout` | Los servicios no están arriba | `docker compose ps` en WSL; si no aparecen, `pnpm services:up` |
| `Connection refused` desde Windows, pero `docker compose exec` funciona | El reenvío de puertos entre WSL y Windows no está activo | Comprueba que usas `127.0.0.1` y no `localhost`. Si persiste, es un asunto de red de WSL (opción `localhostForwarding` en la configuración de WSL), y no del compose |
| `password authentication failed` (PostgreSQL) | Contraseña distinta a la del volumen | Ver la primera trampa de la sección 8: Postgres solo lee `POSTGRES_PASSWORD` al crear el volumen |
| `NOAUTH` o `WRONGPASS` (Redis) | Falta la contraseña o es incorrecta | Copia de nuevo `REDIS_PASSWORD` de tu `.env` |
| Puerto en uso al arrancar los servicios | Ya hay un PostgreSQL o Redis en Windows usando 5432 o 6379 | Cambia el puerto del host en el compose (ver sección 8) y el puerto en la herramienta |

**Cómo llegan los puertos a Windows en este entorno.** Docker corre como motor nativo dentro de Ubuntu en WSL2 (comprobado con `docker info`: sistema operativo `Ubuntu 24.04.3 LTS`; kernel `microsoft-standard-WSL2`), no como Docker Desktop. Los puertos publicados en `127.0.0.1` de WSL deberían ser accesibles desde `127.0.0.1` de Windows gracias al reenvío de `localhost` de WSL2 (`localhostForwarding`, que normalmente viene activado). Es la explicación esperada, pero **no la probé**; si DBeaver o Redis Insight no conectan, revisa primero la fila de la tabla anterior sobre el reenvío.

**Aviso sobre el entorno.** No probé estas conexiones desde Windows: la verificación de este PR se hizo con los clientes dentro de los contenedores. Los nombres exactos de menús y campos pueden variar según la versión de DBeaver y de Redis Insight; si algo no coincide, guíate por los valores de las tablas (host, puerto, usuario y contraseña), que son los que importan.

## 7. Cómo verificar

Para no depender de tu `.env` (que el asistente no puede leer), la verificación original usó contraseñas aleatorias solo en memoria y un proyecto aparte (`COMPOSE_PROJECT_NAME=manos-verify`), y al final borró sus volúmenes. Puedes repetirla con tu propio `.env`: los comandos son los mismos, con `docker compose` a secas.

**a) Sin variables, el compose falla con un mensaje claro**
```bash
docker compose --env-file /dev/null config -q
```
Esperado: `required variable POSTGRES_USER is missing a value: Set POSTGRES_USER in .env (see .env.example)` y código `1`. `--env-file /dev/null` ignora tu `.env` para forzar el caso.

**b) Con tu `.env`, la configuración es válida**
```bash
docker compose config -q; echo "exit: $?"
```
Esperado: `exit: 0`.

**c) Arrancan sanos y con el puerto solo local**
```bash
pnpm services:up
docker compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
```
Esperado: `(healthy)` en ambos y `127.0.0.1:5432->5432/tcp`, `127.0.0.1:6379->6379/tcp`.

**d) Puertos: nada escucha en `0.0.0.0`**
```bash
ss -ltn | grep -E ':(5432|6379)\b'
```
Esperado: las dos líneas muestran `127.0.0.1:...`.

**e) PostgreSQL pide contraseña desde fuera del contenedor**

Hay que conectar desde otro contenedor de la misma red (ver 3.8). Sustituye `<usuario>`, `<base>` y el nombre de la red (`manos_default`, pues el proyecto se llama `manos`):
```bash
# Contraseña correcta: debe entrar
docker run --rm --network manos_default -e PGPASSWORD="<tu-contraseña>" \
  postgres:17-alpine psql -h postgres -U <usuario> -d <base> -tAc "select 'login ok';"

# Contraseña incorrecta: debe fallar con "password authentication failed"
docker run --rm --network manos_default -e PGPASSWORD=incorrecta \
  postgres:17-alpine psql -h postgres -U <usuario> -d <base> -tAc "select 1"
```
Atención: al escribir tu contraseña en la terminal queda en el historial del shell. Úsalo solo en desarrollo.

**f) Redis exige contraseña**
```bash
docker compose exec redis redis-cli ping
docker compose exec -e REDISCLI_AUTH=incorrecta redis redis-cli ping
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'
```
Esperado: `NOAUTH Authentication required.`, luego `AUTH failed: WRONGPASS ...` y por último `PONG`.

**g) La contraseña de Redis no aparece en los procesos**
```bash
docker compose top redis
```
Esperado: una línea de cabecera y un proceso `redis-server`, sin tu contraseña a la vista.

**h) La política de memoria y el AOF**
```bash
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli config get maxmemory-policy'
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli config get appendonly'
```
Esperado: `noeviction` y `yes`.

**i) Persistencia**
```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qc "create table prueba(id int); insert into prueba values (42);"'
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli set clave valor'
pnpm services:down && pnpm services:up
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select id from prueba;"'
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli get clave'
```
Esperado: `42` y `valor`. Limpia después con `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qc "drop table prueba;"'` y `docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli del clave'`.

## 8. Trampas conocidas

- **Cambiar la contraseña en `.env` después de crear los volúmenes no la cambia.** PostgreSQL lee `POSTGRES_PASSWORD` **solo al inicializar un volumen vacío**. Si cambias el valor, la contraseña real sigue siendo la antigua y verás `password authentication failed`. Solución en desarrollo: `docker compose down -v` (pierdes los datos) y volver a levantar. Redis, en cambio, sí toma la contraseña nueva en cada arranque.
- **Conexión desde dentro del contenedor = sin contraseña.** Una prueba de autenticación hecha con `docker compose exec postgres psql -h 127.0.0.1` es engañosa (3.8). Nos pasó: aceptó una contraseña incorrecta.
- **`redis-cli ping` sale con código `0` aunque responda `NOAUTH`.** Los scripts deben comprobar la respuesta, no el código de salida (3.11).
- **Todos los comandos de `docker compose` necesitan las variables**, incluso `ps` o `down`, porque Compose interpola el archivo completo (3.5). Sin `.env`, fallan.
- **Puerto ocupado.** Si ya tienes un PostgreSQL o un Redis local en 5432 o 6379, Docker no podrá publicar el puerto. Comprueba con `ss -ltn | grep -E ':(5432|6379)\b'`. Para cambiar el puerto del host, modifica el primer número: `127.0.0.1:5433:5432`.
- **`down -v` borra los datos sin preguntar.** No lo uses si no quieres empezar de cero.
- **Los servicios son solo para desarrollo.** No usar este compose ni estas contraseñas en producción.
- **Dependabot actualiza las imágenes del compose, pero no la imagen de `scripts/gitleaks.sh`.** Esa se cambia a mano (ver [05](05-ci-and-secrets.md)).
- **Dependabot propone saltos de versión mayor de las bases de datos si no se le prohíbe.** Pasó en el PR #10 (`postgres` de `17-alpine` a `18-alpine`), abierto a los pocos minutos de añadir el ecosistema `docker-compose`. Se cerró sin fusionar y se añadió un `ignore` de versiones mayores de `postgres` y `redis` en `.github/dependabot.yml`. Motivos para no aceptar ese tipo de PR:
  - **Los datos no se abren entre versiones mayores.** PostgreSQL no puede abrir un directorio de datos creado por otra versión mayor: cambiar de 17 a 18 exige una migración (`pg_upgrade` o volcado y restauración). Si se fusionara un PR así, tu volumen de desarrollo dejaría de arrancar.
  - **Compatibilidad sin verificar.** Elegimos la 17 precisamente porque no comprobamos el soporte de la 18 en Prisma y en el resto del ecosistema. Con Redis pasa lo mismo con BullMQ y la licencia (ver 3.13).
  - **Un PR no es el lugar para una decisión así.** Una versión mayor de base de datos se decide, se prueba y se documenta aparte.

  Las versiones **menores y de parche** (por ejemplo `17.11` a `17.12`) siguen llegando como PR agrupado. Para subir de versión mayor de forma deliberada: verificar la compatibilidad, probar la migración sobre una copia, cambiar la etiqueta y el digest del compose a mano, y quitar o ajustar el `ignore`.
  - **No verificado:** que Dependabot aplique el `ignore` de `update-types` a etiquetas de imágenes Docker como `17-alpine` (el comportamiento de `version-update:semver-major` con etiquetas con sufijo no lo comprobé). Cómo comprobarlo: tras fusionar este cambio, en Insights → Dependency graph → Dependabot debe aparecer sin errores de configuración, y en las semanas siguientes no debe reabrirse una propuesta de `postgres` 18 ni de `redis` 9. Si reaparece, hay que cambiar a la forma alternativa `versions: ['>=18']`.
- **Docker debe estar corriendo.** También lo necesita el hook de gitleaks.
- **WSL.** Los puertos en `127.0.0.1` se reenvían a Windows normalmente, pero si un cliente gráfico de Windows no conecta, es un asunto de red de WSL y no del compose.

## 9. Para repetirlo en otro proyecto

1. Elegir las versiones de PostgreSQL y Redis y comprobar su compatibilidad con las herramientas del proyecto.
2. Descargar las imágenes y obtener su digest: `docker pull <imagen>` y `docker image inspect <imagen> --format '{{index .RepoDigests 0}}'`.
3. Escribir `docker-compose.yml` con: puertos en `127.0.0.1`, variables con `:?`, healthchecks, volúmenes con nombre, `no-new-privileges` e imágenes por tag y digest.
4. Pasar la contraseña de Redis por entorno (`sh -c 'exec redis-server --requirepass "$$REDIS_PASSWORD" ...'`).
5. Añadir las variables, con valores de ejemplo, a `.env.example`, y crear tu `.env` con valores aleatorios.
6. Añadir los scripts `services:up`, `services:down` y `services:logs`.
7. Añadir el ecosistema `docker-compose` a `.github/dependabot.yml`.
8. Verificar con la sección 7, **sobre todo la autenticación desde otro contenedor**.
9. Hacer el cambio por rama y PR, y documentarlo en el mismo commit.
