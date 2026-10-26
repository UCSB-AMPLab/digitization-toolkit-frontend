import type { LayoutServerLoad } from './$types';

// Hands the components the locale that hooks.server.ts read from the cookie.
export const load: LayoutServerLoad = ({ locals }) => {
	return { locale: locals.locale };
};
