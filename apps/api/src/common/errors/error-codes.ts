/** Stable error codes and their default message (es-MX). The language selection comes later. */
export const ERROR_MESSAGES = {
  validation_failed: 'Los datos enviados no son válidos',
  bad_request: 'La petición no es válida',
  unauthorized: 'Debes iniciar sesión',
  forbidden: 'No tienes permiso para hacer esto',
  not_found: 'No encontramos lo que buscas',
  payload_too_large: 'La petición es demasiado grande',
  unsupported_media_type: 'El tipo de contenido no está admitido',
  too_many_requests: 'Demasiados intentos. Inténtalo más tarde',
  internal_error: 'Ocurrió un error inesperado',
  service_unavailable: 'El servicio no está disponible por ahora',
  csrf_origin_rejected: 'La petición no viene de un origen permitido',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;
