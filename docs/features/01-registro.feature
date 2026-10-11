# language: es
@fase-1 @registro
Característica: Registro de cuentas
  Como persona que busca o presta servicios del hogar
  Quiero crear una cuenta
  Para poder contactar proveedores o recibir solicitudes de clientes

  Antecedentes:
    Dado que existe un aviso de privacidad vigente
    Y que el correo "ana@example.com" no está registrado

  Escenario: Un cliente se registra con datos válidos
    Cuando se registra con el correo "ana@example.com", el nombre "Ana Torres", la contraseña "una-clave-larga-123" y acepta el aviso de privacidad
    Entonces se crea una cuenta con el rol "customer"
    Y el estado del correo de la cuenta es "unverified"
    Y se envía un correo de verificación a "ana@example.com"
    Y no se inicia sesión automáticamente

  Escenario: Un proveedor se registra con datos válidos
    Cuando se registra como proveedor con el correo "ana@example.com", el nombre "Ana Torres", el teléfono "5512345678", la contraseña "una-clave-larga-123" y acepta el aviso de privacidad
    Entonces se crea una cuenta con el rol "provider"
    Y el estado del proveedor es "pending"
    Y el perfil del proveedor no es visible públicamente

  @seguridad
  Escenario: No se puede obtener el rol de administrador al registrarse
    Cuando se envía un registro que pide el rol "admin"
    Entonces el registro es rechazado
    Y no se crea ninguna cuenta

  @privacidad
  Escenario: Sin aceptar el aviso de privacidad no se crea la cuenta
    Cuando se registra con datos válidos pero sin aceptar el aviso de privacidad
    Entonces el registro es rechazado con el error "debes aceptar el aviso de privacidad"
    Y no se crea ninguna cuenta

  @privacidad
  Escenario: Se guarda constancia de la aceptación del aviso de privacidad
    Cuando se registra con datos válidos y acepta el aviso de privacidad
    Entonces la cuenta guarda la versión del aviso aceptado y la fecha de aceptación

  @seguridad
  Escenario: Registrarse con un correo ya existente no revela que existe
    Dado que el correo "ana@example.com" ya pertenece a una cuenta
    Cuando alguien se registra con el correo "ana@example.com"
    Entonces recibe la misma respuesta que en un registro nuevo
    Y no se crea una segunda cuenta
    Y se envía a "ana@example.com" un correo que indica que ya tiene una cuenta

  Esquema del escenario: Se rechazan contraseñas que no cumplen la política
    Cuando se registra con la contraseña "<contraseña>"
    Entonces el registro es rechazado con el error "<error>"

    Ejemplos:
      | contraseña         | error                             |
      | corta123           | debe tener al menos 12 caracteres |
      | passwordpassword   | es demasiado común                |
      | 123456789012       | es demasiado común                |

  Escenario: Se rechaza una contraseña de más de 128 caracteres
    Cuando se registra con una contraseña de 129 caracteres
    Entonces el registro es rechazado con el error "debe tener como máximo 128 caracteres"

  Escenario: Se acepta una contraseña de exactamente 128 caracteres
    Cuando se registra con una contraseña de 128 caracteres que no es común
    Entonces se crea la cuenta

  Esquema del escenario: Se rechazan correos con formato inválido
    Cuando se registra con el correo "<correo>"
    Entonces el registro es rechazado con el error "correo inválido"

    Ejemplos:
      | correo            |
      | ana               |
      | ana@              |
      | @example.com      |
      | ana@@example.com  |
      | ana @example.com  |

  Esquema del escenario: Se valida el teléfono del proveedor
    Cuando se registra como proveedor con el teléfono "<teléfono>"
    Entonces el resultado del registro es "<resultado>"

    Ejemplos:
      | teléfono        | resultado                                     |
      | 5512345678      | aceptado                                      |
      | 55 1234 5678    | aceptado con el teléfono guardado normalizado |
      | 551234567       | rechazado                                     |
      | 55123456789     | rechazado                                     |
      | 55-ABCD-5678    | rechazado                                     |

  @seguridad
  Escenario: La contraseña nunca se guarda en claro
    Cuando se registra con la contraseña "una-clave-larga-123"
    Entonces lo guardado para la contraseña es un hash con el algoritmo "argon2id"
    Y la contraseña no aparece en los registros del sistema

  @seguridad
  Escenario: Se limita el número de registros desde una misma dirección
    Dado que desde una misma dirección se hicieron 10 registros en la última hora
    Cuando se intenta un registro más desde esa dirección
    Entonces el registro es rechazado por exceso de intentos
    Y la respuesta indica cuánto tiempo hay que esperar

  @a11y
  Escenario: Los errores del formulario se anuncian a lectores de pantalla
    Dado que una persona usa un lector de pantalla
    Cuando envía el formulario de registro con errores
    Entonces los errores se anuncian sin que tenga que buscarlos
    Y el foco se mueve al primer campo con error
    Y cada campo con error indica que es inválido y describe el problema
