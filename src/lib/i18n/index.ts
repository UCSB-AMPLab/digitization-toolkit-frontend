// ============================================================================
// i18n — catálogo tipado sin framework (NEH-93)
//
// Diseño:
//   - `es.ts` es la fuente de verdad; `Messages = typeof es` obliga a que
//     todos los catálogos tengan exactamente las mismas claves.
//   - El idioma se fija UNA vez por carga de página: el servidor lo lee de la
//     cookie en `hooks.server.ts`, lo pasa por `+layout.server.ts` y el
//     layout raíz lo fija en el store `locale`. Cambiar de idioma
//     (`setLanguage`) escribe la cookie y recarga la página completa, así que
//     no hay re-render reactivo de idioma a mitad de sesión.
//   - Los componentes usan el store derivado `m`: `{$m.login_submit}`.
//
// Nota sobre SSR: `locale` es un store a nivel de módulo, estado compartido
// en el servidor entre requests concurrentes. Es un compromiso deliberado:
// el toolkit es un quiosco de una sola sesión y el idioma se fija al inicio
// de cada render. Si el despliegue llegara a ser multiusuario concurrente,
// migrar a contexto de Svelte.
// ============================================================================

import { derived, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { es } from './es';
import { en } from './en';

export type Messages = typeof es;
export type Locale = 'es' | 'en';

/**
 * Claves del catálogo cuyo valor es un string simple (sin parámetros).
 * Úsalo cuando una clave se guarda como dato (p. ej. NAV_ITEMS) para que
 * una futura entrada con parámetros (función) no pueda colarse donde se
 * espera texto plano.
 */
export type StringMessageKey = {
	[K in keyof Messages]: Messages[K] extends string ? K : never;
}[keyof Messages];

export const DEFAULT_LOCALE: Locale = 'es';
export const LOCALE_COOKIE = 'dtk_locale';

const catalogs: Record<Locale, Messages> = { es, en };

export function isLocale(value: unknown): value is Locale {
	return value === 'es' || value === 'en';
}

/** Idioma activo de esta carga de página. Lo fija el layout raíz. */
export const locale = writable<Locale>(DEFAULT_LOCALE);

/** Catálogo activo: `{$m.login_submit}` en los componentes. */
export const m = derived(locale, (l) => catalogs[l]);

/**
 * Cambia el idioma: persiste la cookie (1 año) y recarga la página para que
 * el SSR vuelva a renderizar todo en el idioma nuevo.
 */
export function setLanguage(next: Locale) {
	if (!browser) return;
	document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
	location.reload();
}
