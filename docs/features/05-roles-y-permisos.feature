# language: es
@fase-1 @roles-y-permisos
Característica: Roles y permisos
  Como plataforma
  Quiero que cada persona solo pueda hacer lo que su rol permite
  Para proteger los datos de los demás y la integridad del marketplace

  Antecedentes:
    Dado que existen una cuenta "customer", una cuenta "provider", otra cuenta "provider" y una cuenta "admin"

  @seguridad
  Esquema del escenario: El acceso a cada recurso depende del rol
    Cuando <quien> intenta acceder a "<recurso>"
    Entonces el resultado es "<resultado>"

    Ejemplos:
      | quien                | recurso                           | resultado                  |
      | una persona anónima  | mi perfil                         | no autenticado             |
      | una persona anónima  | el catálogo público               | permitido                  |
      | un "customer"        | mi perfil                         | permitido                  |
      | un "customer"        | la edición del perfil de proveedor | prohibido                  |
      | un "customer"        | la lista de proveedores pendientes | prohibido                  |
      | un "provider"        | la edición de su propio perfil de proveedor | permitido         |
      | un "provider"        | la lista de proveedores pendientes | prohibido                  |
      | un "admin"           | la lista de proveedores pendientes | permitido                  |

  @seguridad
  Escenario: Un proveedor no puede ver ni editar los datos de otro proveedor
    Dado que el primer proveedor tiene un perfil de proveedor con identificador conocido
    Cuando el segundo proveedor intenta editar ese perfil
    Entonces recibe el mismo resultado que si el perfil no existiera
    Y el perfil no cambia

  @seguridad
  Escenario: Cambiar un identificador en la dirección no expone datos ajenos
    Cuando un "customer" pide el perfil privado de otra cuenta usando su identificador
    Entonces recibe el mismo resultado que si esa cuenta no existiera
    Y no se revela ningún dato de la otra cuenta

  @seguridad
  Escenario: Un usuario no puede cambiarse el rol a sí mismo
    Cuando un "customer" envía una edición de su perfil que incluye el rol "admin"
    Entonces el rol de la cuenta sigue siendo "customer"
    Y los campos que no se pueden editar son ignorados o rechazados

  @seguridad
  Escenario: Un usuario no puede cambiar el estado de verificación de su proveedor
    Cuando un "provider" en estado "pending" envía una edición que incluye el estado "verified"
    Entonces el estado del proveedor sigue siendo "pending"

  @seguridad
  Escenario: Los permisos se calculan en el servidor y no en la interfaz
    Dado que la interfaz oculta una opción para un "customer"
    Cuando ese "customer" hace directamente la petición que corresponde a esa opción
    Entonces la petición es rechazada con un error de acceso prohibido

  @seguridad
  Escenario: Cada rechazo por permisos queda registrado
    Cuando un "customer" intenta acceder a la lista de proveedores pendientes
    Entonces se registra un evento con la cuenta, el recurso, la fecha y el resultado
    Y el registro no incluye contraseñas ni tokens
