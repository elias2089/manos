# language: es
@fase-1 @perfil
Característica: Perfil de la cuenta
  Como persona con una cuenta
  Quiero ver y gestionar mis datos
  Para mantenerlos al día y decidir qué pasa con ellos

  Antecedentes:
    Dado que ha iniciado sesión una cuenta verificada con el correo "ana@example.com"

  Escenario: Ver el perfil propio
    Cuando abre su perfil
    Entonces ve su nombre, su correo y su teléfono
    Y no ve datos de ninguna otra cuenta

  Escenario: Editar el nombre y el teléfono
    Cuando cambia su nombre a "Ana María Torres" y su teléfono a "5598765432"
    Entonces su perfil muestra los datos nuevos

  Escenario: Los datos editados se validan igual que en el registro
    Cuando cambia su teléfono a "123"
    Entonces el cambio es rechazado con un error de teléfono inválido
    Y su perfil conserva el teléfono anterior

  @seguridad
  Escenario: Cambiar el correo exige verificar el correo nuevo
    Cuando pide cambiar su correo a "ana.nueva@example.com"
    Entonces se envía un enlace de verificación a "ana.nueva@example.com"
    Y el correo de la cuenta sigue siendo "ana@example.com" hasta que se verifique
    Y se avisa a "ana@example.com" de que se pidió un cambio de correo

  @seguridad
  Escenario: Cambiar el correo a uno que ya pertenece a otra cuenta no revela nada
    Dado que "otra@example.com" ya pertenece a otra cuenta
    Cuando pide cambiar su correo a "otra@example.com"
    Entonces recibe la misma respuesta que con un correo libre
    Y el correo de la cuenta no cambia

  @seguridad
  Escenario: Cambiar la contraseña exige la contraseña actual
    Cuando cambia la contraseña indicando una contraseña actual incorrecta
    Entonces el cambio es rechazado
    Y la contraseña no cambia

  @seguridad
  Escenario: Cambiar la contraseña cierra las demás sesiones
    Dado que tiene otra sesión abierta en otro dispositivo
    Cuando cambia la contraseña indicando la actual y una nueva válida
    Entonces la otra sesión queda revocada
    Y la sesión actual sigue activa
    Y se envía a "ana@example.com" un aviso de que la contraseña fue cambiada

  @privacidad
  Escenario: Cancelar la cuenta elimina los datos personales
    Cuando pide cancelar su cuenta y confirma con su contraseña
    Entonces sus datos personales se eliminan o se anonimizan
    Y todas sus sesiones quedan revocadas
    Y ya no puede iniciar sesión con ese correo
    Y se le envía una confirmación de la cancelación

  @privacidad
  Escenario: Cancelar la cuenta de un proveedor retira su perfil público
    Dado que la cuenta es de un proveedor en estado "verified"
    Cuando cancela su cuenta
    Entonces su perfil deja de aparecer en el catálogo y en las búsquedas
    Y su dirección pública devuelve el mismo resultado que un proveedor inexistente

  @privacidad @seguridad
  Escenario: Cancelar la cuenta exige confirmar la identidad
    Cuando pide cancelar su cuenta con una contraseña incorrecta
    Entonces la cancelación es rechazada
    Y la cuenta sigue activa
