# language: es
@fase-1 @idioma
Característica: Cambio de idioma
  Como persona que usa la plataforma
  Quiero verla en español o en inglés
  Para entenderla sin dificultad

  Escenario: El idioma por defecto es español de México
    Cuando una persona abre la plataforma por primera vez sin preferencia de idioma
    Entonces la interfaz está en el idioma "es-MX"
    Y el atributo de idioma del documento es "es-MX"

  Escenario: Cambiar el idioma a inglés
    Cuando cambia el idioma a "en"
    Entonces la interfaz se muestra en inglés
    Y el atributo de idioma del documento es "en"
    Y sigue en la misma página que estaba viendo

  Escenario: La preferencia de idioma se recuerda
    Dado que cambió el idioma a "en"
    Cuando vuelve a abrir la plataforma
    Entonces la interfaz sigue en inglés

  Escenario: La preferencia de una persona con sesión se guarda en su cuenta
    Dado que ha iniciado sesión
    Cuando cambia el idioma a "en"
    Entonces la preferencia se guarda en su perfil
    Y al iniciar sesión desde otro dispositivo la interfaz está en inglés

  Escenario: Un texto sin traducción cae al español
    Dado que existe un texto que aún no tiene traducción al inglés
    Cuando la persona usa la interfaz en inglés
    Entonces ve ese texto en español
    Y la página no muestra claves técnicas ni espacios vacíos

  Esquema del escenario: Las fechas se muestran según el idioma
    Dado que la fecha es el 10 de octubre de 2026
    Cuando la interfaz está en "<idioma>"
    Entonces la fecha se muestra como "<fecha>"

    Ejemplos:
      | idioma | fecha                |
      | es-MX  | 10 de octubre de 2026 |
      | en     | October 10, 2026     |

  Escenario: Los errores de la API vienen en el idioma solicitado
    Cuando una petición pide el idioma "en" y provoca un error de validación
    Entonces el mensaje de error está en inglés
    Y el código del error es el mismo que en español

  @a11y
  Escenario: El selector de idioma es accesible
    Dado que una persona usa solo el teclado y un lector de pantalla
    Cuando llega al selector de idioma
    Entonces puede cambiar el idioma con el teclado
    Y el lector anuncia el idioma actual
    Y tras el cambio el lector anuncia el nuevo idioma de la página

  @a11y
  Escenario: Un fragmento en otro idioma se marca como tal
    Dado que la interfaz está en español y una frase del contenido está en inglés
    Cuando un lector de pantalla recorre la página
    Entonces la frase en inglés está marcada con su idioma para que se lea con la pronunciación correcta
