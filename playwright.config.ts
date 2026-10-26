import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		// The backend's CORS allow-list only includes the dev-server origins
		// (5173/3000) — the old build+preview setup ran on :4173, which the
		// backend silently rejects (every fetch blocked by CORS, so any test
		// touching real data just saw an empty app with no error). `dev`
		// keeps the app on an allowed origin, and reuseExistingServer picks
		// up the docker-compose frontend dev server when it's already
		// running instead of fighting it for the port.
		command: 'npm run dev',
		port: 5173,
		reuseExistingServer: true
	},
	use: {
		baseURL: 'http://localhost:5173'
	},
	testDir: 'e2e'
});
