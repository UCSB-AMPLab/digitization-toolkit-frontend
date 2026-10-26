// Default title for a record created by a capture (NEH-181).
//
// The title is archival data, so it must not depend on the interface
// language of whoever pressed the shutter. It is the capture's local
// date and time in ISO 8601 without an offset, e.g. 2026-10-22T14:05:31.
// The time comes from the browser's clock and time zone, which on a laptop
// are the laptop's, not necessarily the appliance's.
// The backend's own default is not used: for dual capture it is the same
// English literal ("<project> - Dual capture") for every record.
//
// Version: 0.1.0-beta

function pad(n: number): string {
	return String(n).padStart(2, '0');
}

export function defaultRecordTitle(when: Date = new Date()): string {
	return (
		`${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
		`T${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`
	);
}
