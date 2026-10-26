// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
//
// Version: 0.1.0-beta
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			locale: import('$lib/i18n').Locale;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
