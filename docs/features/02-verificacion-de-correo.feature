# language: es
@fase-1 @verificacion-de-correo
Característica: Verificación del correo electrónico
  Como plataforma
  Quiero confirmar que cada cuenta controla su correo
  Para evitar cuentas falsas y asegurar que la recuperación de contraseña llegue a su dueño

  Antecedentes:
    Dado que existe una cuenta con el correo "ana@example.com" en estado "unverified"

  Escenario: Verificar el correo con un enlace válido
    Cuando abre el enlace de verificación recibido antes de 24 horas
    Entonces el estado del correo pasa a "verified"
    Y puede iniciar sesión

  Escenario: Un enlace de verificación vencido no sirve
    Dado que el enlace de verificación se emitió hace más de 24 horas
    Cuando abre ese enlace
    Entonces el correo sigue en estado "unverified"
    Y se le ofrece pedir un enlace nuevo

  Escenario: Un enlace de verificación solo se puede usar una vez
    Dado que ya usó el enlace de verificación
    Cuando vuelve a abrir el mismo enlace
    Entonces recibe un aviso de que el enlace ya no es válido
    Y el estado del correo sigue en "verified"

  @seguridad
  Escenario: Un enlace de verificación manipulado se rechaza sin dar detalles
    Cuando abre un enlace de verificación con el código alterado
    Entonces recibe un aviso genérico de enlace inválido
    Y no se revela si el código correspondía a alguna cuenta

  Escenario: Pedir un enlace de verificación nuevo
    Cuando pide que se le reenvíe el correo de verificación
    Entonces se envía un enlace nuevo a "ana@example.com"
    Y los enlaces anteriores dejan de ser válidos

  @seguridad
  Escenario: Se limita el reenvío de correos de verificación
    Dado que pidió 3 reenvíos en la última hora
    Cuando pide un reenvío más
    Entonces la solicitud es rechazada por exceso de intentos

  @seguridad
  Escenario: Pedir un reenvío para un correo que no existe no revela nada
    Cuando alguien pide un reenvío para "nadie@example.com"
    Entonces recibe la misma respuesta que para una cuenta existente
    Y no se envía ningún correo
