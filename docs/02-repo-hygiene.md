# 02. Higiene del repositorio

PR: `chore/repo-hygiene`. Archivos nuevos en la raíz: `.gitignore`, `.env.example`, `.editorconfig`, `.gitattributes`, `.nvmrc`.

## 1. Objetivo

Dejar el repositorio protegido contra subir por error secretos, dependencias y archivos generados, y hacer que cualquier persona (o máquina) que lo abra use el mismo formato de archivos y la misma versión de Node. No se instala nada ni se escribe código de producto.

## 2. Glosario

| Término | Significado |
|---|---|
| **Rastrear (track)** | Que Git vigile un archivo y guarde su historial. Un archivo nuevo está "sin rastrear" hasta que haces `git add` |
| **Ignorar** | Decirle a Git que un archivo no existe para él: no aparece en `git status` ni puede añadirse por accidente |
| **Variable de entorno** | Un valor de configuración (una contraseña, una URL) que el programa lee al arrancar, fuera del código |
| **Secreto** | Cualquier valor que da acceso a algo: contraseñas, claves de API, tokens |
| **`.env`** | Archivo de texto con las variables de entorno de tu máquina, una por línea (`CLAVE=valor`) |
| **Artefacto de build** | Archivo generado al compilar (`dist/`, `.next/`). Se puede regenerar, así que no se guarda en Git |
| **Final de línea (EOL)** | Carácter invisible que termina cada línea. Linux y macOS usan LF; Windows usa CRLF |
| **LF / CRLF** | Las dos formas de marcar un final de línea. LF es un carácter (`\n`); CRLF son dos (`\r\n`) |
| **`node_modules`** | Carpeta donde el gestor de paquetes descarga las dependencias. Puede pesar cientos de MB |
| **Versión de Node** | El número de la herramienta que ejecuta JavaScript fuera del navegador. Cada proyecto funciona con unas versiones concretas |

## 3. Teoría

### 3.1 Cómo funciona `.gitignore`

Es un archivo de texto con un patrón por línea. Git lo lee desde la raíz y excluye lo que coincida. Reglas de sintaxis que usamos:

| Patrón | Significado |
|---|---|
| `node_modules/` | La barra final indica "carpeta": ignora esa carpeta en cualquier nivel |
| `.env.*` | `*` representa cualquier texto: `.env.local`, `.env.production`, etc. |
| `!.env.example` | El `!` **niega** la regla anterior: esta excepción sí se rastrea |
| `# texto` | Comentario |
| `.vscode/*` + `!.vscode/settings.json` | Ignora todo lo de la carpeta salvo los archivos que se nombran como excepción |

Dos reglas que conviene tener claras:

1. **El orden importa.** La excepción `!` debe ir **después** de la regla que niega. Por eso `!.env.example` está debajo de `.env.*`.
2. **Ignorar no borra lo que ya se rastreaba.** Si un archivo ya fue commiteado, añadirlo a `.gitignore` después no lo quita del repositorio ni del historial. Por eso este PR va antes de cualquier código: es mucho más fácil prevenir que limpiar. Si un secreto llega a commitearse, ignorarlo no basta; hay que revocarlo y rotarlo.

### 3.2 Qué ignoramos y por qué

| Grupo | Patrones | Motivo |
|---|---|---|
| Dependencias | `node_modules/`, `.pnpm-store/` | Se reinstalan con `pnpm install` a partir del lockfile. Subirlas infla el repositorio |
| Variables de entorno | `.env`, `.env.*` (excepto `.env.example`) | Contienen secretos de tu máquina |
| Claves | `*.pem`, `*.key`, `*.p12`, `*.pfx` | Claves privadas y certificados |
| Salidas de build | `dist/`, `build/`, `out/`, `.next/`, `.turbo/`, `.expo/`, `coverage/`, `*.tsbuildinfo` | Se regeneran; versionarlas ensucia los diffs |
| Logs | `*.log`, `npm-debug.log*`, `pnpm-debug.log*` | Pueden contener datos personales o tokens |
| Terraform | `.terraform/`, `*.tfstate`, `*.tfstate.*`, `*.tfvars` | El estado de Terraform guarda valores sensibles en texto plano. Lo usaremos en la fase 7 |
| Sistema | `.DS_Store`, `Thumbs.db` | Basura que crean macOS y Windows |
| Editores | `.idea/`, `.vscode/*` salvo `settings.json` y `extensions.json` | El estado personal no se comparte; la configuración común del equipo sí |
| Herramientas locales | `.atl/` | Registro de skills de tu entorno de IA; es local |

Los patrones de Terraform, Expo y claves aún no tienen archivos en el repositorio. Se incluyen ahora porque, una vez que alguien los commitea, ya es tarde.

### 3.3 `.env` y `.env.example`: el patrón

- **`.env`**: contiene valores reales. **Se ignora.** Cada desarrollador tiene el suyo.
- **`.env.example`**: lista los **nombres** de las variables con valores de ejemplo. **Sí se rastrea.** Sirve de documentación viva: quien clone el repositorio sabe qué debe configurar.

Flujo de uso: `cp .env.example .env` y luego rellenar los valores propios.

Regla del proyecto: cada nueva variable se añade a `.env.example` en el mismo commit que empieza a usarla. Hoy el archivo no define variables, porque aún no existe código que las lea; inventarlas sería adelantarse a requisitos que no existen (YAGNI).

### 3.4 `.editorconfig`

Es un estándar que casi todos los editores (VS Code mediante extensión, JetBrains de forma nativa) leen para aplicar la misma configuración.

| Ajuste | Valor | Efecto |
|---|---|---|
| `root = true` | | Detiene la búsqueda de otros `.editorconfig` en carpetas superiores |
| `charset` | `utf-8` | Acentos y la "ñ" se guardan bien en todas partes |
| `end_of_line` | `lf` | Finales de línea de Linux |
| `indent_style` / `indent_size` | `space` / `2` | Sangría de 2 espacios, la más habitual en TypeScript |
| `insert_final_newline` | `true` | Todo archivo termina con salto de línea; evita avisos de Git ("No newline at end of file") |
| `trim_trailing_whitespace` | `true` | Quita espacios sobrantes al final de cada línea |
| `[*.md]` | `trim_trailing_whitespace = false` | En Markdown, dos espacios al final de línea son un salto de línea intencionado |

Importante: `.editorconfig` solo cubre **cómo se escribe** el archivo. El **formato del código** (comillas, punto y coma, longitud de línea) lo gestionará Prettier en el PR C, y ambos no se contradicen.

### 3.5 `.gitattributes` y los finales de línea

Tu entorno es WSL (Linux) pero Windows está detrás. Si un archivo se edita en Windows con CRLF y en Linux con LF, Git ve **cada línea como modificada** y los diffs se llenan de ruido.

`* text=auto eol=lf` significa:
- `text=auto`: Git detecta qué archivos son texto y cuáles binarios (imágenes), y solo normaliza los de texto.
- `eol=lf`: en el repositorio y en tu copia de trabajo, los finales de línea de esos archivos son siempre LF.

Es complementario a `.editorconfig`: uno fija cómo escribe el editor, el otro cómo guarda Git.

### 3.6 `.nvmrc`

Contiene un número: `24`. Es la versión mayor de Node con la que se desarrolla el proyecto. `nvm` (Node Version Manager) lee ese archivo con `nvm use`, y plataformas como GitHub Actions lo usan con `node-version-file`. Así tu máquina, el CI y producción ejecutan la misma versión mayor.

Este archivo **solo documenta y facilita**; no impide que alguien use otra versión. La restricción real (`engines` en `package.json`) llega en el PR B.

## 4. Qué hicimos

| Archivo | Resultado |
|---|---|
| `.gitignore` | Reglas descritas en 3.2 |
| `.env.example` | Plantilla vacía con las reglas del proyecto en un encabezado |
| `.editorconfig` | Ajustes de 3.4 |
| `.gitattributes` | Normalización a LF (3.5) |
| `.nvmrc` | `24` |
| `docs/01-github-repository-setup.md` | Renombrado con `git mv` para seguir la numeración |

`git mv` conserva el historial del archivo, a diferencia de borrar y crear uno nuevo.

## 5. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| `.gitignore` global por usuario (`~/.config/git/ignore`) para archivos de sistema y editor | Protege solo tu máquina. Quien clone el repositorio no lo tiene; el archivo del proyecto protege a todos |
| Plantilla genérica de Node de GitHub | Es larga y trae reglas de herramientas que no usamos. Escribimos solo lo que necesitamos y entendemos cada línea |
| `.env.example` con variables inventadas desde ahora | Documentaría algo que no existe y se quedaría desactualizado |
| `.nvmrc` con versión exacta (`24.16.0`) | Obliga a actualizarlo con cada parche. La versión mayor basta |
| Sin `.gitattributes`, confiando en `core.autocrlf` | `autocrlf` es configuración **local** de cada máquina; `.gitattributes` viaja con el repositorio |

## 6. Cómo verificar

Todo desde la raíz del repositorio.

**a) Un `.env` es ignorado**
```bash
echo "SECRETO=prueba" > .env
git status --short
git check-ignore -v .env
rm .env
```
Esperado: `.env` **no** aparece en `git status`, y `check-ignore -v` muestra la regla que lo ignora, algo como `.gitignore:6:.env	.env` (el número es la línea de la regla en `.gitignore`).

También puedes probar rutas sin crear archivos: `check-ignore` evalúa solo el patrón, no exige que el archivo exista.
```bash
git check-ignore -v .env.local server.pem terraform.tfstate dist/a.js
```
Esperado: una línea por ruta con la regla que la ignora.

**b) `.env.example` sí se rastrea**
```bash
git check-ignore .env.example; echo "código de salida: $?"
```
Esperado: no imprime nada y el código de salida es `1`, que en `check-ignore` significa "no está ignorado".

Con la opción `-v` el resultado cambia: imprime `.gitignore:8:!.env.example` y sale con `0`. Eso no significa que esté ignorado: `-v` muestra la última regla que coincidió, aunque sea una excepción con `!`. Para saber si un archivo está ignorado, mira el código de salida **sin** `-v`.

**c) `node_modules` es ignorado**
```bash
mkdir node_modules && touch node_modules/x.js
git status --short
rm -r node_modules
```
Esperado: no aparece `node_modules/`.

**d) `.nvmrc` coincide con tu Node**
```bash
cat .nvmrc
node --version
```
Esperado: la versión mayor de `node --version` es `24`.

**e) Finales de línea**
```bash
git add .gitignore .editorconfig
git ls-files --eol .gitignore .editorconfig
```
Esperado: `i/lf    w/lf` en cada línea y `attr/text=auto eol=lf`: el índice (`i`) y tu copia de trabajo (`w`) usan LF, y el atributo viene de `.gitattributes`. Antes de `git add`, el índice muestra `i/none` porque el archivo aún no está en él.

## 7. Trampas conocidas

- **Un secreto ya commiteado no se arregla ignorándolo.** Hay que revocarlo y rotarlo.
- **El orden de las reglas.** `!.env.example` antes de `.env.*` no tendría efecto.
- **Cuidado con `git add .`.** Con `.gitignore` bien hecho es menos peligroso, pero sigue sin ser buen hábito: añade por nombre.
- **Permisos de la herramienta de IA.** En este proyecto, la configuración de permisos bloquea que el asistente escriba rutas `.env*`, incluso `.env.example`. Es una protección razonable, pero significa que ese archivo debe crearlo la persona.
- **`.vscode/` parcialmente ignorada.** Si más adelante se quiere compartir otro archivo de esa carpeta, hay que añadirle su propia excepción.

## 8. Para repetirlo en otro proyecto

1. Crear `.gitignore` con los grupos de 3.2, adaptados al stack, **antes del primer commit de código**.
2. Crear `.env.example` con el encabezado de la sección 4 y añadir variables solo cuando se usen.
3. Crear `.editorconfig` y `.gitattributes` con los valores de 3.4 y 3.5.
4. Crear `.nvmrc` con la versión mayor de Node del proyecto.
5. Verificar con los comandos de la sección 6.
6. Hacer el cambio por rama y PR, y documentarlo en el mismo commit.
