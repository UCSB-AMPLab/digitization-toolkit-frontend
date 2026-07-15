import type { LayoutServerLoad } from './$types';

// Expone a los componentes el idioma que hooks.server.ts leyó de la cookie.
export const load: LayoutServerLoad = ({ locals }) => {
	return { locale: locals.locale };
};
