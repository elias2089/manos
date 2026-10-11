# language: es
@fase-1 @verificacion-de-proveedores
Característica: Verificación de proveedores por un administrador
  Como administrador
  Quiero revisar y aprobar a los proveedores antes de que sean públicos
  Para que los clientes solo encuentren proveedores confiables

  Antecedentes:
    Dado que ha iniciado sesión una cuenta "admin"
    Y que existe un proveedor "Plomería Torres" en estado "pending" con al menos una categoría y una zona

  Escenario: El administrador ve los proveedores pendientes
    Cuando abre la lista de proveedores pendientes
    Entonces ve a "Plomería Torres" con su fecha de registro y sus categorías

  Escenario: Aprobar a un proveedor
    Cuando aprueba a "Plomería Torres"
    Entonces su estado pasa a "verified"
    Y se le envía un correo que le avisa de la aprobación
    Y su perfil pasa a ser visible en el catálogo y en las búsquedas

  Escenario: Rechazar a un proveedor exige un motivo
    Cuando rechaza a "Plomería Torres" sin indicar un motivo
    Entonces la acción es rechazada con el error "el motivo es obligatorio"
    Y el estado del proveedor sigue siendo "pending"

  Escenario: Rechazar a un proveedor con motivo
    Cuando rechaza a "Plomería Torres" con el motivo "Falta describir los servicios"
    Entonces su estado pasa a "rejected"
    Y se le envía un correo con el motivo del rechazo
    Y su perfil no es visible públicamente

  Escenario: Un proveedor rechazado corrige su perfil y vuelve a pedir la revisión
    Dado que "Plomería Torres" fue rechazado
    Cuando el proveedor actualiza su perfil y pide una nueva revisión
    Entonces su estado vuelve a ser "pending"
    Y aparece de nuevo en la lista de pendientes

  Escenario: Un proveedor sin categoría o sin zona no puede pedir la revisión
    Dado que existe un proveedor en estado "pending" sin ninguna zona
    Cuando ese proveedor pide la revisión
    Entonces la solicitud es rechazada con el error "agrega al menos una zona"

  Escenario: Un proveedor pendiente no es visible públicamente
    Cuando una persona anónima busca a "Plomería Torres"
    Entonces no aparece en los resultados
    Y su dirección pública devuelve el mismo resultado que un proveedor inexistente

  @seguridad
  Escenario: Cada decisión sobre un proveedor queda registrada
    Cuando aprueba a "Plomería Torres"
    Entonces se registra quién decidió, cuándo, el estado anterior y el estado nuevo

  @seguridad
  Escenario: Solo un administrador puede aprobar o rechazar
    Dado que ha iniciado sesión una cuenta "provider"
    Cuando intenta aprobar a "Plomería Torres"
    Entonces la acción es rechazada con un error de acceso prohibido
    Y el estado del proveedor no cambia

  Escenario: Dos administradores no pueden decidir a la vez sobre el mismo proveedor
    Dado que otro administrador ya aprobó a "Plomería Torres"
    Cuando este administrador intenta rechazarlo
    Entonces la acción es rechazada porque el estado ya cambió
    Y el estado del proveedor sigue siendo "verified"
