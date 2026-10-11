# language: es
@fase-1 @inicio-de-sesion
Característica: Inicio y cierre de sesión
  Como persona con una cuenta verificada
  Quiero iniciar y cerrar sesión de forma segura
  Para usar la plataforma sin que otras personas accedan a mi cuenta

  Antecedentes:
    Dado que existe una cuenta verificada con el correo "ana@example.com" y la contraseña "una-clave-larga-123"

  @seguridad
  Escenario: Inicio de sesión correcto
    Cuando inicia sesión con "ana@example.com" y "una-clave-larga-123"
    Entonces se crea una sesión
    Y los tokens de la sesión se entregan solo en cookies "HttpOnly", "Secure" y "SameSite"
    Y los tokens no aparecen en el cuerpo de la respuesta ni son legibles desde JavaScript

  @seguridad
  Esquema del escenario: Las credenciales incorrectas dan siempre el mismo mensaje
    Cuando inicia sesión con "<correo>" y "<contraseña>"
    Entonces el inicio de sesión es rechazado con el mensaje "Correo o contraseña incorrectos"
    Y la respuesta no permite distinguir si el correo existe

    Ejemplos:
      | correo            | contraseña          |
      | ana@example.com   | clave-equivocada-1  |
      | nadie@example.com | una-clave-larga-123 |

  Escenario: No se puede iniciar sesión sin verificar el correo
    Dado que existe una cuenta con el correo "luis@example.com" en estado "unverified"
    Cuando inicia sesión con las credenciales correctas de "luis@example.com"
    Entonces el inicio de sesión es rechazado
    Y se le ofrece reenviar el correo de verificación

  @seguridad
  Escenario: La cuenta se bloquea temporalmente tras varios intentos fallidos
    Dado que hubo 5 intentos fallidos para "ana@example.com" en los últimos 15 minutos
    Cuando inicia sesión con "ana@example.com" y la contraseña correcta
    Entonces el inicio de sesión es rechazado por exceso de intentos
    Y la respuesta indica cuánto tiempo falta para poder reintentar

  @seguridad
  Escenario: El bloqueo termina al pasar el tiempo
    Dado que la cuenta "ana@example.com" fue bloqueada hace más de 15 minutos
    Cuando inicia sesión con "ana@example.com" y la contraseña correcta
    Entonces se crea una sesión

  @seguridad
  Escenario: Se limita también por dirección de red
    Dado que desde una misma dirección hubo 20 intentos fallidos en los últimos 15 minutos
    Cuando se intenta iniciar sesión desde esa dirección con cualquier cuenta
    Entonces el inicio de sesión es rechazado por exceso de intentos

  Escenario: La sesión se renueva sin pedir la contraseña
    Dado que tiene una sesión cuyo token de acceso venció y cuyo token de renovación sigue vigente
    Cuando la aplicación pide renovar la sesión
    Entonces se emiten un token de acceso y un token de renovación nuevos
    Y el token de renovación anterior deja de ser válido

  @seguridad
  Escenario: Reutilizar un token de renovación ya usado cierra todas las sesiones de esa cadena
    Dado que un token de renovación ya fue usado y reemplazado
    Cuando alguien presenta ese token de renovación antiguo
    Entonces la petición es rechazada
    Y se revocan todas las sesiones derivadas de ese inicio de sesión
    Y la persona deberá iniciar sesión de nuevo

  Escenario: La sesión expira tras 7 días sin renovarse
    Dado que el último token de renovación se emitió hace más de 7 días
    Cuando la aplicación pide renovar la sesión
    Entonces la petición es rechazada
    Y la persona deberá iniciar sesión de nuevo

  Escenario: Cerrar sesión
    Dado que tiene una sesión iniciada
    Cuando cierra sesión
    Entonces las cookies de la sesión se eliminan
    Y el token de renovación queda revocado
    Y usar el token de renovación anterior es rechazado

  @seguridad
  Escenario: Un token de acceso alterado se rechaza
    Cuando se hace una petición con un token de acceso cuya firma fue modificada
    Entonces la petición es rechazada por no estar autenticada
