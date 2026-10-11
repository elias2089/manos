# language: es
@fase-1 @recuperacion-de-contrasena
Característica: Recuperación de contraseña
  Como persona que olvidó su contraseña
  Quiero restablecerla desde mi correo
  Para recuperar el acceso sin que otra persona pueda hacerlo por mí

  Antecedentes:
    Dado que existe una cuenta verificada con el correo "ana@example.com"

  @seguridad
  Escenario: Pedir la recuperación con un correo registrado
    Cuando pide recuperar la contraseña de "ana@example.com"
    Entonces recibe el mensaje "Si el correo está registrado, te enviamos instrucciones"
    Y se envía a "ana@example.com" un enlace de restablecimiento que vence en 1 hora

  @seguridad
  Escenario: Pedir la recuperación con un correo no registrado no revela nada
    Cuando pide recuperar la contraseña de "nadie@example.com"
    Entonces recibe el mismo mensaje que con un correo registrado
    Y no se envía ningún correo

  Escenario: Restablecer la contraseña con un enlace válido
    Dado que tiene un enlace de restablecimiento vigente
    Cuando define la nueva contraseña "otra-clave-larga-456"
    Entonces puede iniciar sesión con "otra-clave-larga-456"
    Y ya no puede iniciar sesión con la contraseña anterior
    Y el enlace de restablecimiento queda inutilizado

  @seguridad
  Escenario: Restablecer la contraseña cierra todas las sesiones abiertas
    Dado que tiene dos sesiones abiertas en distintos dispositivos
    Y que tiene un enlace de restablecimiento vigente
    Cuando define una nueva contraseña válida
    Entonces las dos sesiones quedan revocadas

  Escenario: Se avisa por correo cuando la contraseña cambia
    Dado que tiene un enlace de restablecimiento vigente
    Cuando define una nueva contraseña válida
    Entonces se envía a "ana@example.com" un aviso de que la contraseña fue cambiada

  Escenario: Un enlace de restablecimiento vencido no sirve
    Dado que el enlace de restablecimiento se emitió hace más de 1 hora
    Cuando intenta usarlo
    Entonces la petición es rechazada
    Y se le ofrece pedir un enlace nuevo

  @seguridad
  Escenario: Un enlace de restablecimiento solo se puede usar una vez
    Dado que ya usó el enlace de restablecimiento
    Cuando intenta usarlo otra vez
    Entonces la petición es rechazada

  Escenario: Una nueva contraseña que no cumple la política no gasta el enlace
    Dado que tiene un enlace de restablecimiento vigente
    Cuando define la nueva contraseña "corta123"
    Entonces el restablecimiento es rechazado con el error "debe tener al menos 12 caracteres"
    Y el enlace sigue siendo válido

  @seguridad
  Escenario: Pedir un enlace nuevo invalida el anterior
    Dado que tiene un enlace de restablecimiento vigente
    Cuando pide otro enlace de recuperación
    Entonces el enlace anterior deja de ser válido

  @seguridad
  Escenario: Se limitan las solicitudes de recuperación
    Dado que se pidieron 3 recuperaciones para "ana@example.com" en la última hora
    Cuando se pide una más
    Entonces la solicitud es rechazada por exceso de intentos
    Y no se envía ningún correo
