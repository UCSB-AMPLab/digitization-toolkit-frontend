// The unit's own screen runs Chromium in a kiosk (cage) opened on exactly
// `http://localhost`. It has no address bar or back button, so a link that
// leaves the app strands the operator, and the unit is usually offline anyway.
// Desktop browsers reach the unit by name or IP, and dev servers add a port,
// so only this origin identifies the kiosk. `origin` is a parameter so the
// check can be tested without moving the test browser.
export function isKiosk(origin: string = window.location.origin): boolean {
	return origin === 'http://localhost';
}
