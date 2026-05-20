import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),

    kit: {
        // Tu adaptador de Node para el despliegue
        adapter: adapter()
    },

    // Filtramos las alertas de accesibilidad (porque no es para escritorio sino tablet)
    onwarn: (warning, handler) => {
        const ignoreRules = [
            'a11y-click-events-have-key-events',
            'a11y-no-static-element-interactions',
            'a11y-no-noninteractive-element-interactions',
            'a11y-mouse-events-have-key-events',
            'a11y-no-noninteractive-tabindex',
            'a11y-label-has-associated-control'
        ];

        if (ignoreRules.includes(warning.code)) return;
        handler(warning);
    }
};

export default config;
