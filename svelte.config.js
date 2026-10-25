import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),

    kit: {
        adapter: adapter()
    },

    // Meant to silence accessibility warnings because the UI targets a tablet
    // rather than a desktop. The codes below are in Svelte 4's hyphenated form;
    // Svelte 5 reports them with underscores (`a11y_click_events_have_key_events`),
    // so none of them match and the warnings still appear.
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
