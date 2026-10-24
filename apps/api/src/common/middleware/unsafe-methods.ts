/** The HTTP methods that may change data. GET and the like must never do it. */
export const UNSAFE_METHODS: ReadonlySet<string> = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
