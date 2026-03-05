import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// adapter-node produces a Node.js server (node build/index.js).
		// This enables fully offline Docker deployment: build once with internet,
		// run forever without it. See frontend/Dockerfile for the multi-stage build.
		adapter: adapter()
	}
};

export default config;
