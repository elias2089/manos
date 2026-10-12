# language: es
@fase-1 @proteccion-de-peticiones
Característica: Protección contra peticiones falsificadas (CSRF)
  Como plataforma que identifica a las personas con cookies
  Quiero rechazar las peticiones que no vienen de mi propia web
  Para que otra página no pueda actuar en nombre de una persona con sesión iniciada

  Antecedentes:
    Dado que el origen permitido de la web es "https://manos.example"
    Y que ha iniciado sesión una cuenta verificada con el correo "ana@example.com"

  @seguridad
  Escenario: Una petición que cambia datos desde el origen permitido se acepta
    Cuando se envía una petición para cambiar su nombre con el origen "https://manos.example"
    Entonces la petición se procesa

  @seguridad
  Escenario: Una petición que cambia datos desde otro origen se rechaza
    Cuando se envía una petición para cancelar su cuenta con el origen "https://evil.example"
    Entonces la petición es rechazada con el código de error "csrf_origin_rejected"
    Y la cuenta sigue activa

  @seguridad
  Escenario: Una petición con la cookie de sesión y sin origen se rechaza
    Cuando se envía una petición para cambiar su nombre con la cookie de sesión y sin indicar el origen
    Entonces la petición es rechazada con el código de error "csrf_origin_rejected"

  @seguridad
  Escenario: Un origen no permitido también se rechaza en el inicio de sesión
    Cuando se envía una petición de inicio de sesión con el origen "https://evil.example"
    Entonces la petición es rechazada con el código de error "csrf_origin_rejected"
    Y no se crea ninguna sesión

  Escenario: Una petición sin cookie de sesión y sin origen, como la de una herramienta de pruebas, no exige origen
    Dado que no hay sesión iniciada
    Cuando se envía una petición pública de registro sin indicar el origen y sin cookies
    Entonces la petición se procesa con normalidad

  @seguridad
  Esquema del escenario: Las rutas que cambian datos solo aceptan JSON
    Cuando se envía una petición para cambiar su nombre con el tipo de contenido "<tipo>"
    Entonces el resultado es "<resultado>"

    Ejemplos:
      | tipo                                | resultado                       |
      | application/json                    | se procesa                      |
      | application/x-www-form-urlencoded   | rechazada por tipo no admitido  |
      | multipart/form-data                 | rechazada por tipo no admitido  |
      | text/plain                          | rechazada por tipo no admitido  |

  @seguridad
  Esquema del escenario: Una petición de lectura nunca cambia datos
    Cuando se envía una petición de lectura "GET" a "<ruta>"
    Entonces los datos de la cuenta no cambian

    Ejemplos:
      | ruta                  |
      | /v1/me                |
      | /v1/me/provider       |
      | /v1/providers         |

  @seguridad
  Escenario: Las acciones que cambian datos no se pueden ejecutar con una petición de lectura
    Cuando se envía una petición "GET" a la ruta de cancelación de cuenta
    Entonces la petición es rechazada por método no permitido
    Y la cuenta sigue activa

  @seguridad
  Escenario: Un origen no permitido no recibe permiso para leer las respuestas
    Cuando se envía una petición previa de verificación con el origen "https://evil.example"
    Entonces la respuesta no autoriza a ese origen
    Y no autoriza el envío de cookies desde ese origen

  @seguridad
  Escenario: Las cookies de sesión llevan los atributos de protección
    Cuando inicia sesión con "ana@example.com" y la contraseña correcta
    Entonces las cookies de sesión son "HttpOnly" y "Secure"
    Y las cookies de sesión tienen el atributo "SameSite" con el valor "Lax"
