# language: es
@fase-1 @paginas-informativas
Característica: Páginas informativas
  Como visitante
  Quiero conocer el proyecto y poder escribir al equipo
  Para decidir si confío en la plataforma

  Escenario: Ver "Sobre nosotros" sin iniciar sesión
    Cuando una persona anónima abre la página "Sobre nosotros"
    Entonces ve la descripción del proyecto
    Y la página tiene un título de página único y un solo encabezado principal

  @privacidad
  Escenario: El aviso de privacidad está disponible desde cualquier página
    Cuando una persona anónima está en cualquier página
    Entonces el pie de página tiene un enlace al aviso de privacidad vigente

  Escenario: Enviar un mensaje desde "Contacto"
    Cuando una persona anónima envía el formulario de contacto con nombre, correo y un mensaje válidos
    Entonces ve una confirmación de que el mensaje fue enviado
    Y el mensaje queda guardado
    Y se envía una notificación al correo de administración

  Esquema del escenario: El formulario de contacto valida sus campos
    Cuando envía el formulario de contacto con el nombre "<nombre>", el correo "<correo>" y el mensaje "<mensaje>"
    Entonces ve el error "<error>"
    Y no se guarda ningún mensaje

    Ejemplos:
      | nombre | correo          | mensaje                    | error                     |
      |        | ana@example.com | Hola, quisiera información | el nombre es obligatorio  |
      | Ana    | ana             | Hola, quisiera información | correo inválido           |
      | Ana    | ana@example.com |                            | el mensaje es obligatorio |

  Escenario: Se rechaza un mensaje de más de 2000 caracteres
    Cuando envía el formulario de contacto con un mensaje de 2001 caracteres
    Entonces ve el error "el mensaje es demasiado largo"
    Y no se guarda ningún mensaje

  @seguridad
  Escenario: Se limitan los mensajes de contacto por dirección
    Dado que desde una misma dirección se enviaron 3 mensajes en la última hora
    Cuando se envía un mensaje más
    Entonces el envío es rechazado por exceso de intentos

  @seguridad
  Escenario: Un campo oculto atrapa a los programas automáticos
    Cuando se envía el formulario con el campo oculto de trampa relleno
    Entonces el envío parece correcto para quien lo hizo
    Y no se guarda ningún mensaje
    Y no se envía ninguna notificación

  @seguridad
  Escenario: Un mensaje con código no se ejecuta ni se interpreta
    Cuando se envía un mensaje de contacto que contiene una etiqueta de script
    Entonces el mensaje se guarda como texto
    Y la notificación por correo lo muestra como texto sin ejecutar nada

  @seguridad
  Escenario: El contenido del mensaje no puede inyectar encabezados de correo
    Cuando se envía un nombre que contiene saltos de línea y un encabezado de correo
    Entonces el envío es rechazado o los saltos de línea se eliminan
    Y la notificación no incluye encabezados añadidos

  Escenario: Los enlaces a redes sociales
    Cuando una persona abre el pie de página
    Entonces ve los enlaces a las redes sociales del proyecto
    Y cada enlace tiene un nombre accesible que dice a qué red lleva
    Y cada enlace externo se abre sin dar acceso a la página de origen

  @a11y
  Escenario: El formulario de contacto es accesible
    Dado que una persona usa un lector de pantalla
    Cuando usa el formulario de contacto
    Entonces cada campo tiene una etiqueta asociada
    Y los errores y la confirmación se anuncian sin que tenga que buscarlos
