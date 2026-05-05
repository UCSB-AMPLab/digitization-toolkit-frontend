// Desactivar SSR para todas las rutas del grupo (auth)
// Necesario porque estas páginas usan browser APIs (localStorage, goto)
// que no están disponibles en el servidor
export const ssr = false;
