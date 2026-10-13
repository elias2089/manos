# 11. Prisma y Mailpit: base de datos y correo local

PR: `feat/prisma-and-mailpit`. Cambios en `docker-compose.yml`. Más adelante: `apps/api/prisma/`, `apps/api/src/prisma/` y `.github/workflows/ci.yml`.

> **Estado: en construcción.** Este documento crece con cada commit del PR. Hoy cubre el paso 1 (Mailpit). Al cerrar el PR se completan las secciones de pendientes y de cómo repetirlo, y se quita este aviso.

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

**Decisiones del PR.** Un solo PR, no dos encadenados, como el PR 1: se revisa commit a commit. Ocho categorías iniciales: Plomería, Electricidad, Limpieza, Pintura, Carpintería, Jardinería, Cerrajería y Aire acondicionado.

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

## 4. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Un servicio real de correo en desarrollo | Enviaría correos de verdad y exigiría cuentas y credenciales |
| `CMD-SHELL` en el healthcheck | La imagen no tiene shell: el servicio quedaría `unhealthy` para siempre |
| Un volumen para conservar los correos | Son de usar y tirar; un volumen solo acumularía basura |
| Usuario sin privilegios y sistema de archivos de solo lectura | Es una herramienta local; más restricciones no aportan y habría que probar que Mailpit sigue funcionando |
| Dejar el healthcheck solo en la imagen | Funciona, pero deja el intervalo implícito y distinto al de los otros servicios |
| Publicar los puertos sin `127.0.0.1` | Expondría el servidor de correo de pruebas a toda la red |

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

## 6. Trampas conocidas

- **`CMD-SHELL` en el healthcheck de Mailpit.** La imagen no tiene shell; hay que usar la forma exec.
- **`port is already allocated` (1025 u 8025).** Otro programa usa el puerto, por ejemplo otro capturador de correo o un contenedor anterior.
- **Los correos desaparecen al ejecutar `pnpm services:down`.** Es intencional: no hay volumen.
- **El digest debe copiarse exacto.** Un carácter distinto y Docker no encuentra la imagen.
- **YAML.** La sangría es de 2 espacios y los guiones de las listas deben alinearse. Un tabulador rompe el archivo.
- **Un `curl` de SMTP necesita `\r\n`** al final de cada línea de cabecera; con solo `\n`, algunos servidores rechazan el mensaje.
- **Prettier no entiende `.env.example` ni `.gitignore`.** No se incluyen en `prettier --check`.
