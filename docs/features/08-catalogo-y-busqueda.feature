# language: es
@fase-1 @catalogo-y-busqueda
Característica: Catálogo y búsqueda de proveedores
  Como cliente
  Quiero encontrar proveedores verificados por categoría y zona
  Para elegir a quién contactar

  Antecedentes:
    Dado que existen las categorías "Plomería", "Electricidad" y "Limpieza"
    Y que existen las zonas "Benito Juárez", "Coyoacán" y "Cuauhtémoc"
    Y que existen estos proveedores verificados:
      | nombre             | categorías            | zonas                    |
      | Plomería Torres    | Plomería              | Benito Juárez, Coyoacán  |
      | Luz y Más          | Electricidad          | Coyoacán                 |
      | Hogar Limpio       | Limpieza, Plomería    | Cuauhtémoc               |
    Y que existe el proveedor "Pendiente SA" en estado "pending" en la categoría "Plomería"

  Escenario: Ver el catálogo sin iniciar sesión
    Cuando una persona anónima abre el catálogo
    Entonces ve a los proveedores verificados
    Y no ve a "Pendiente SA"

  Escenario: Buscar por categoría
    Cuando busca la categoría "Plomería"
    Entonces los resultados son "Hogar Limpio" y "Plomería Torres"

  Escenario: Buscar por zona
    Cuando busca la zona "Coyoacán"
    Entonces los resultados son "Luz y Más" y "Plomería Torres"

  Escenario: Buscar por categoría y zona a la vez
    Cuando busca la categoría "Plomería" en la zona "Coyoacán"
    Entonces el resultado es "Plomería Torres"

  Escenario: Los resultados tienen un orden estable
    Cuando busca la categoría "Plomería" dos veces seguidas
    Entonces los resultados aparecen en el mismo orden, por nombre

  Escenario: Una búsqueda sin resultados explica qué pasó
    Cuando busca la categoría "Electricidad" en la zona "Cuauhtémoc"
    Entonces ve un aviso de que no hay proveedores para esa combinación
    Y se le sugiere quitar el filtro de zona o de categoría

  Escenario: Los resultados se paginan de 20 en 20
    Dado que hay 45 proveedores verificados en la categoría "Limpieza"
    Cuando busca la categoría "Limpieza"
    Entonces ve 20 resultados y el total de 45
    Y puede pasar a la página 3, que muestra 5 resultados

  @seguridad
  Esquema del escenario: Los parámetros de búsqueda inválidos se rechazan
    Cuando busca con el parámetro "<parámetro>" con el valor "<valor>"
    Entonces la búsqueda es rechazada con un error de parámetro inválido

    Ejemplos:
      | parámetro  | valor                          |
      | página     | 0                              |
      | página     | -1                             |
      | página     | abc                            |
      | categoría  | una categoría que no existe    |
      | zona       | una zona que no existe         |

  @seguridad
  Escenario: Un término con caracteres especiales se trata como texto
    Cuando busca el texto "'; DROP TABLE providers; --"
    Entonces la búsqueda termina sin error
    Y no devuelve resultados
    Y la información del catálogo no cambia

  Escenario: El perfil público de un proveedor verificado
    Cuando abre el perfil público de "Plomería Torres"
    Entonces ve su nombre comercial, su descripción, sus categorías y sus zonas
    Y no ve su correo ni su teléfono personal

  Escenario: Un proveedor completa su perfil
    Dado que ha iniciado sesión el proveedor "Plomería Torres"
    Cuando cambia su descripción y agrega la categoría "Electricidad"
    Entonces su perfil público muestra los cambios

  @seguridad
  Escenario: La descripción del proveedor no puede ejecutar código
    Dado que ha iniciado sesión el proveedor "Plomería Torres"
    Cuando guarda una descripción que contiene una etiqueta de script
    Entonces la descripción se muestra como texto inofensivo
    Y no se ejecuta ningún código al abrir su perfil público

  @a11y
  Escenario: Los resultados son navegables con teclado
    Dado que una persona usa solo el teclado
    Cuando recorre los resultados de una búsqueda
    Entonces llega a cada proveedor y a los controles de paginación en un orden lógico
    Y el elemento enfocado siempre se distingue visualmente
