# 07. Especificaciones de comportamiento de la fase 1 (Gherkin)

PR: `docs/phase-1-behavior-specs`. Archivos nuevos: diez archivos `.feature` en `docs/features/`. Una actualización posterior (PR `docs/phase-1-data-and-auth-design`) corrigió algunos escenarios y añadió el archivo `11`; ver la sección 5.1.

## 1. Objetivo

Definir, **antes de diseñar o programar**, qué debe hacer la fase 1 (núcleo del marketplace) en forma de escenarios que una persona no técnica pueda leer. Son los criterios de aceptación de la fase: cuando todos pasan, la fase está terminada. Además, escribirlos obliga a decidir los casos incómodos (contraseñas, bloqueos, enlaces vencidos, permisos) cuando aún es barato cambiarlos.

## 2. Glosario

| Término | Significado |
|---|---|
| **Gherkin** | Lenguaje de texto plano para describir comportamiento con una estructura fija. Lo leen personas y programas |
| **Cucumber** | Herramienta que lee archivos Gherkin y los ejecuta contra el sistema |
| **BDD (desarrollo guiado por comportamiento)** | Escribir primero cómo debe comportarse el sistema, en un lenguaje compartido, y luego construirlo |
| **Característica (Feature)** | Un archivo `.feature`: una capacidad del sistema |
| **Escenario (Scenario)** | Un ejemplo concreto de comportamiento dentro de una característica |
| **Paso (Step)** | Cada línea de un escenario que empieza con `Dado`, `Cuando`, `Entonces`, `Y` o `Pero` |
| **Antecedentes (Background)** | Pasos que se ejecutan antes de **cada** escenario del archivo |
| **Esquema del escenario (Scenario Outline)** | Un escenario con variables `<así>` que se repite con cada fila de una tabla de ejemplos |
| **Etiqueta (Tag)** | Una marca `@nombre` sobre una característica o escenario, para agruparlos o filtrarlos |
| **Criterio de aceptación** | La condición que debe cumplirse para dar algo por terminado |
| **Lenguaje ubicuo** | Usar las mismas palabras de negocio en la conversación, la documentación y el código |
| **IDOR** | Acceso a datos ajenos cambiando un identificador en la dirección o en la petición |
| **Enumeración de cuentas** | Descubrir si un correo está registrado a partir de las diferencias en las respuestas |
| **ARCO** | Los derechos de Acceso, Rectificación, Cancelación y Oposición sobre los datos personales (LFPDPPP, México) |
| **Hash** | Resultado irreversible de transformar una contraseña. Se guarda en lugar de la contraseña |
| **argon2id** | Algoritmo de hash de contraseñas recomendado por OWASP, diseñado para ser lento y costoso de atacar |
| **Token de acceso** | Credencial de vida corta que prueba quién eres en cada petición |
| **Token de renovación (refresh)** | Credencial de vida más larga que solo sirve para pedir un token de acceso nuevo |
| **Rate limiting (límite de intentos)** | Restringir cuántas veces se puede repetir una acción en un tiempo |
| **Honeypot (campo trampa)** | Campo oculto en un formulario que solo rellenan los programas automáticos |

## 3. Teoría

### 3.1 Estructura de un archivo Gherkin

```gherkin
# language: es
@fase-1 @registro
Característica: Registro de cuentas
  Como persona que presta servicios
  Quiero crear una cuenta
  Para recibir solicitudes de clientes

  Antecedentes:
    Dado que existe un aviso de privacidad vigente

  Escenario: Un cliente se registra con datos válidos
    Cuando se registra con el correo "ana@example.com"
    Entonces se crea una cuenta con el rol "customer"
```

| Elemento | Palabra clave en español | Para qué |
|---|---|---|
| Idioma | `# language: es` (primera línea) | Le dice al lector que las palabras clave están en español |
| Etiquetas | `@nombre` | Agrupar y filtrar |
| Característica | `Característica:` | Nombre de la capacidad. Debajo, tres líneas libres: `Como... Quiero... Para...` |
| Contexto común | `Antecedentes:` | Pasos repetidos al inicio de cada escenario |
| Ejemplo | `Escenario:` | Un caso concreto |
| Plantilla | `Esquema del escenario:` con `Ejemplos:` | El mismo caso con distintos datos |

Las tres líneas `Como... Quiero... Para...` son texto libre que Gherkin ignora al ejecutar; existen para que quien lea sepa **para quién** y **por qué** existe la característica.

### 3.2 Dado, Cuando, Entonces

Cada escenario cuenta una historia en tres partes:

| Palabra | Responde a | Ejemplo |
|---|---|---|
| **Dado** | ¿En qué situación estamos? (estado inicial) | `Dado que existe una cuenta verificada` |
| **Cuando** | ¿Qué hace la persona o el sistema? (la acción) | `Cuando inicia sesión con la contraseña correcta` |
| **Entonces** | ¿Qué debe pasar? (el resultado observable) | `Entonces se crea una sesión` |
| **Y** / **Pero** | Continuar el paso anterior | `Y los tokens se entregan solo en cookies` |

Reglas para que un escenario sea bueno:
- **Un solo `Cuando`** por escenario. Si hay dos acciones, son dos comportamientos y dos escenarios.
- **`Dado` describe estado, no acciones.** "Existe una cuenta", no "alguien crea una cuenta y entra a la base de datos".
- **`Entonces` es algo que se puede observar**: una respuesta, un correo enviado, un cambio visible. No una opinión ("funciona bien").

### 3.3 Declarativo frente a imperativo

| Estilo | Ejemplo | Problema |
|---|---|---|
| **Imperativo** (evitar) | `Cuando hace clic en el campo "correo" y escribe "ana@..." y hace clic en "Entrar"` | Se rompe si cambia el diseño. Describe **cómo**, no **qué** |
| **Declarativo** (el nuestro) | `Cuando inicia sesión con "ana@example.com" y "una-clave-larga-123"` | Sobrevive a un rediseño. Describe la **intención** |

Por eso los escenarios no mencionan botones ni colores: el diseño visual se decide más adelante, y los escenarios no deben cambiar por eso.

### 3.4 Esquemas y tablas

Cuando varios casos solo difieren en los datos, un esquema evita repetir:

```gherkin
Esquema del escenario: Se rechazan correos con formato inválido
  Cuando se registra con el correo "<correo>"
  Entonces el registro es rechazado con el error "correo inválido"

  Ejemplos:
    | correo        |
    | ana           |
    | ana@          |
```

Se ejecuta una vez por cada fila de `Ejemplos`, sustituyendo `<correo>`. Hoy hay 10 esquemas con 40 filas, que equivalen a 40 ejecuciones.

Una **tabla de datos** (sin `Ejemplos`) pasa una lista a un paso, como los proveedores del catálogo en `08-catalogo-y-busqueda.feature`.

### 3.5 Etiquetas que usamos

| Etiqueta | Significado |
|---|---|
| `@fase-1` | Pertenece a la fase 1 |
| `@registro`, `@inicio-de-sesion`, ... | La característica (una por archivo) |
| `@seguridad` | Verifica un control de seguridad (OWASP) |
| `@privacidad` | Verifica una obligación de privacidad (LFPDPPP) |
| `@a11y` | Verifica accesibilidad (WCAG 2.2 AA) |

Sirven para ejecutar subconjuntos: por ejemplo, solo los escenarios `@seguridad` antes de una auditoría. Cuenta actual: **54 `@seguridad`, 6 `@privacidad` y 5 `@a11y`**.

### 3.6 Lo que Gherkin no sustituye

- **No sustituye las pruebas unitarias.** Los escenarios cubren comportamiento de negocio; detalles como "este cálculo da 42" van en pruebas unitarias.
- **No prueba accesibilidad por sí solo.** Los escenarios `@a11y` dicen *qué* se espera; verificarlo exige axe-core y pruebas manuales con teclado y lector de pantalla (ver README).
- **Hoy no se ejecutan.** Aún no hay código ni un motor que los ejecute. Por ahora son especificación. Se enlazarán a pruebas con un ejecutor (Cucumber o `playwright-bdd`), que se elegirá en el PR que cree la API.

### 3.7 Convenciones del proyecto

- Archivos en `docs/features/`, uno por capacidad, numerados para fijar un orden de lectura.
- **En español**, con `# language: es`, porque son material interno (ver README).
- **Los valores técnicos** (roles `customer`, `provider`, `admin`; estados `pending`, `verified`, `rejected`, `unverified`; algoritmo `argon2id`) van entre comillas y se escriben tal como estarán en el código, para que el escenario siga vinculado a las pruebas.
- Los ejemplos usan direcciones `example.com`, un dominio reservado para documentación que nunca recibe correo real.
- **Un comportamiento por escenario.** Un escenario largo es señal de que son dos.

## 4. Qué hicimos

Once características, **119 escenarios** (de los cuales 10 son esquemas con 40 filas de ejemplos). Los 102 escenarios originales pasaron a 119 durante el diseño ([09](09-phase-1-data-and-auth-design.md)): se añadieron escenarios de sesión, de solicitud de revisión de proveedores y la característica `11`, y se corrigió un escenario de `05` (ver 5.1).

| Archivo | Escenarios | Cubre |
|---|---|---|
| `01-registro.feature` | 14 | Registro de clientes y proveedores, política de contraseña, aviso de privacidad, límites, accesibilidad de errores |
| `02-verificacion-de-correo.feature` | 7 | Enlace de verificación: vigencia, un solo uso, reenvío y límites |
| `03-inicio-de-sesion.feature` | 16 | Sesión por cookies, mensajes que no revelan datos, bloqueo, renovación con rotación, detección de reutilización, caducidad por inactividad (1 hora) y por duración máxima (7 días), cookie de renovación restringida, rechazo si Redis no está disponible, cierre de sesión |
| `04-recuperacion-de-contrasena.feature` | 10 | Restablecer contraseña sin revelar cuentas, vigencia, un solo uso, cierre de sesiones |
| `05-roles-y-permisos.feature` | 7 | Matriz de acceso por rol, IDOR, asignación masiva de campos, permisos en el servidor |
| `06-perfil.feature` | 10 | Ver y editar, cambiar correo y contraseña, cancelar cuenta (ARCO) |
| `07-verificacion-de-proveedores.feature` | 12 | Solicitud de revisión, aprobar y rechazar con motivo, nueva revisión, auditoría, concurrencia entre administradores |
| `08-catalogo-y-busqueda.feature` | 13 | Catálogo, búsqueda por categoría y zona, paginación, parámetros inválidos, texto con caracteres especiales, contenido inocuo, teclado |
| `09-idioma.feature` | 9 | Idioma por defecto, cambio y persistencia, fallback, fechas, errores de la API, accesibilidad |
| `10-paginas-informativas.feature` | 11 | Sobre nosotros, aviso de privacidad, contacto, límites, honeypot, inyección, redes sociales |
| `11-proteccion-de-peticiones.feature` | 10 | CSRF: origen permitido, peticiones sin origen, solo JSON, lectura sin efectos, CORS, atributos de las cookies |

Los escenarios se validaron con el analizador oficial de Gherkin (`@cucumber/gherkin` 42.0.1) en un directorio temporal fuera del repositorio: los once archivos se leen sin errores y se reconocen como `es`.

### Cómo se relacionan con OWASP y con la privacidad

| Riesgo | Dónde se cubre |
|---|---|
| A01 Control de acceso roto | `05` (matriz por rol, IDOR, asignación masiva), `07` (solo administrador) |
| A02 Fallas criptográficas | `01` (hash argon2id, contraseña fuera de los registros), `03` (cookies seguras) |
| A03 Inyección | `08` (texto con caracteres especiales, contenido con script), `10` (script en mensajes, inyección de encabezados de correo) |
| A04 Diseño inseguro | `03` (rotación y reutilización de tokens, tope de sesión, rechazo si Redis cae), `01` y `02` (límites), `11` (CSRF) |
| A07 Fallas de autenticación | `01`, `02`, `03`, `04` (política, bloqueo, límites, mensajes uniformes) |
| A09 Registro y monitoreo | `05` (rechazos registrados), `07` (decisiones auditadas) |
| Privacidad (LFPDPPP) | `01` (aviso aceptado y su constancia), `06` (rectificación y cancelación), `10` (aviso accesible) |

**Cobertura de los derechos ARCO:** Acceso y Rectificación (ver y editar el perfil, `06`) y Cancelación (cancelar cuenta, `06`) están cubiertos. **Oposición no**, porque aún no hay comunicaciones comerciales a las que oponerse; se tratará con las fases que envían mensajes.

## 5. Supuestos que debes aprobar

Cada número de estos escenarios es una **decisión**, no un dato descubierto. Están todos aquí para que los confirmes o cambies antes de que se conviertan en código.

| Decisión | Valor propuesto | Por qué |
|---|---|---|
| Longitud de contraseña | 12 a 128 caracteres, sin reglas de mayúsculas ni símbolos | Recomendación actual de OWASP (ASVS): la longitud importa más que la complejidad forzada |
| Contraseñas comunes | Se rechazan las de una lista de contraseñas habituales | Evita las más atacadas |
| Bloqueo por cuenta | 5 intentos fallidos en 15 minutos bloquea 15 minutos | Frena la fuerza bruta sin bloquear de forma permanente (lo que permitiría molestar a otras personas) |
| Límite por dirección de red | 20 fallos en 15 minutos | Cubre ataques que prueban muchas cuentas |
| Registros por dirección | 10 por hora | Frena la creación masiva de cuentas |
| Vigencia del enlace de verificación | 24 horas | Equilibrio entre comodidad y seguridad |
| Reenvíos de verificación | 3 por hora | Evita usar la plataforma para enviar correo masivo |
| Vigencia del enlace de recuperación | 1 hora | Es un enlace sensible; vida corta |
| Recuperaciones por hora | 3 | Igual |
| Vida del token de acceso | Corta (valor exacto en el diseño) | Limita el daño si se roba |
| Vida de la sesión por inactividad (token de renovación) | **1 hora** | Una sesión abandonada se cierra sola. Cambiado el 11-oct-2026 desde 7 días, por decisión de quien mantiene el proyecto. En la práctica tolera entre 45 y 60 minutos sin usar la web (ver [09](09-phase-1-data-and-auth-design.md)) |
| Duración máxima de la sesión | **7 días** | Aunque se use sin parar, hay que volver a iniciar sesión. Sin este tope, la sesión sería indefinida |
| Si Redis no está disponible | Las rutas protegidas por el limitador (registro, inicio de sesión, reenvíos, recuperación y contacto) se rechazan con un error temporal | Sin el contador de intentos no hay defensa contra la fuerza bruta. El catálogo, la renovación de sesión y las rutas autenticadas no usan el limitador y siguen funcionando |
| Cuenta sin verificar | No puede iniciar sesión | Más simple y seguro que un modo limitado |
| Mensajes de error de credenciales | Siempre iguales, sin distinguir causa | Evita la enumeración de cuentas |
| Recurso ajeno | Misma respuesta que si no existiera | Evita revelar qué identificadores existen |
| Resultados por página | 20 | Lectura cómoda y respuesta rápida |
| Orden de resultados | Por nombre | Estable y predecible; la relevancia puede venir después |
| Mensajes de contacto | 3 por hora por dirección, hasta 2000 caracteres | Contra abuso y mensajes enormes |
| Cancelación de cuenta | Elimina o anonimiza datos personales | Derecho de Cancelación (ARCO) |
| Zonas | A nivel de municipio o alcaldía | Granularidad suficiente para la primera versión |

### 5.1 Decisiones tomadas después de aprobar estos supuestos

Al diseñar ([09](09-phase-1-data-and-auth-design.md)) aparecieron huecos en los escenarios. Se resolvieron así:

| Hueco | Decisión |
|---|---|
| `05` hablaba de "un servicio" de un proveedor, pero ningún otro escenario describe servicios | **No existe la entidad Servicio en la fase 1.** El escenario ahora usa "perfil de proveedor" |
| `pending` significaba a la vez "recién registrado" y "esperando al administrador" | Se añade el campo `reviewRequestedAt`. La lista del administrador son los `pending` con esa fecha. Se añadieron dos escenarios a `07` y se aclaró su Antecedentes |
| La sesión no tenía tope: con renovaciones constantes duraría siempre | 1 hora de inactividad y **7 días como tope absoluto** (dos escenarios nuevos en `03`) |
| ¿Qué hacer si Redis cae? | Rechazar la autenticación con un error temporal (un escenario nuevo en `03`) |
| Las cookies de sesión exigen protección contra CSRF | Característica nueva `11` |

### 5.2 Pregunta abierta

**¿Cómo se ordena la búsqueda por relevancia?** Hoy es por nombre. Mejorarlo queda para después.

**Facturación.** Se retiró de **todo** el proyecto el 11-oct-2026 por decisión de quien lo mantiene. Ya no existe la pregunta sobre qué conservar de una cuenta de proveedor por motivos fiscales. Cancelar una cuenta sigue **anonimizando** y no borrando la fila, porque el registro de auditoría y las decisiones del administrador apuntan a usuarios.

## 6. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Escribir historias de usuario en un documento libre | Es ambiguo y no se puede validar automáticamente |
| Escenarios en inglés | Son material interno y quien los revisa y mantiene eres tú (ver README) |
| Escenarios imperativos, con clics y campos | Se rompen con cualquier cambio de diseño |
| Un solo archivo para toda la fase | Difícil de revisar y de enlazar con PRs |
| Escribir Gherkin para cada validación de campo | Esos casos van mejor como pruebas unitarias |
| Esperar a tener código para escribirlos | Pierdes el beneficio: decidir antes de construir |
| Instalar Cucumber ahora | Aún no hay código contra el que ejecutarlo. Se hace cuando exista la API |
| Incluir reseñas de proveedores | Se decidió dejarlas fuera de la fase 1 |

## 7. Cómo verificar

**a) Los archivos son Gherkin válido.** El proyecto no tiene todavía un ejecutor, así que se usó el analizador oficial en un directorio aparte:
```bash
mkdir -p /tmp/gherkincheck && cd /tmp/gherkincheck
npm init -y >/dev/null && npm install --silent @cucumber/gherkin @cucumber/messages
```
Y un script mínimo `validate.cjs` que recorre `docs/features/*.feature` con `new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher())` y llama a `parse(texto)`. Esperado: ningún error, idioma `es` en cada archivo y los conteos de la sección 4.

**b) Todos los archivos declaran el idioma.**
```bash
head -1 docs/features/*.feature
```
Esperado: `# language: es` en cada uno.

**c) Cuenta de escenarios.**
```bash
grep -ceE '^\s*(Escenario|Esquema del escenario):' docs/features/*.feature
```
Esperado: la suma es 119.

**d) Revisión humana.** La única comprobación que importa de verdad: lee cada archivo y pregúntate si describe lo que quieres. Si un escenario te sorprende, es una decisión que aún no tomaste.

## 8. Trampas conocidas

- **Pasan el validador pero pueden estar mal.** El analizador solo comprueba la sintaxis. No dice si el escenario es correcto, completo o contradictorio.
- **Aún no se ejecutan.** Hasta que exista un ejecutor, son especificación sin comprobación automática.
- **Un valor en una tabla debe ser un valor real.** Se detectaron y corrigieron dos filas de ejemplo que contenían descripciones en lugar de datos ("129 caracteres cualquiera"); se reescribieron como escenarios.
- **Mantenerlos al día.** Si cambia una decisión (por ejemplo, el tiempo de bloqueo), hay que cambiarla aquí y en las pruebas. Un escenario desactualizado es peor que no tenerlo.
- **Demasiado detalle.** Si empiezas a escribir escenarios sobre píxeles o colores, estás escribiendo diseño. Eso va aparte, y se pospuso.
- **Demasiados escenarios.** 119 son muchos para una fase; algunos podrían moverse a pruebas unitarias cuando llegue el momento. Se decidirá al implementar.
- **El diseño visual está pospuesto.** Se decidió no hacer diseño visual (Figma) en esta etapa. Los escenarios `@a11y` describen comportamiento accesible, no apariencia.

## 9. Para repetirlo en otro proyecto

1. Listar las capacidades de la fase y crear un archivo `.feature` por cada una, numerado.
2. Empezar cada archivo con `# language: es` (o el idioma elegido), la etiqueta de fase y `Como / Quiero / Para`.
3. Escribir escenarios declarativos: un `Cuando` por escenario, y valores técnicos reales entre comillas.
4. Usar `Antecedentes` para el contexto común y `Esquema del escenario` para casos que solo cambian los datos.
5. Marcar los de seguridad, privacidad y accesibilidad con etiquetas.
6. Reunir todos los números y reglas inventados en una tabla de supuestos y aprobarla.
7. Validar la sintaxis con `@cucumber/gherkin`.
8. Revisarlos con alguien antes de diseñar o programar.
9. Hacer el cambio por rama y PR, y documentarlo en el mismo commit.
