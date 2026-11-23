// A page's requests (NEH-336, review round 3): an operation's token goes
// stale when a newer one of the same kind starts, when it is stopped, or when
// the page is destroyed, and its signal aborts then; other kinds go on.
import { describe, expect, it } from 'vitest';
import { createPageLife } from './page-life';

describe('createPageLife', () => {
	it('keeps an operation current until a newer one of its kind starts', () => {
		const life = createPageLife();
		const first = life.begin('save');
		expect(first.current()).toBe(true);
		const other = life.begin('read');
		const second = life.begin('save');
		expect(first.current()).toBe(false);
		expect(first.signal.aborted).toBe(true);
		expect(second.current()).toBe(true);
		expect(other.current()).toBe(true);
	});

	it('stops one kind on request', () => {
		const life = createPageLife();
		const read = life.begin('read');
		const save = life.begin('save');
		life.stop('read');
		expect(read.current()).toBe(false);
		expect(save.current()).toBe(true);
	});

	it('makes every operation stale, and the page not alive, once destroyed', () => {
		const life = createPageLife();
		const a = life.begin();
		const b = life.begin('other');
		expect(life.alive()).toBe(true);
		life.destroy();
		expect(life.alive()).toBe(false);
		expect(a.current()).toBe(false);
		expect(b.signal.aborted).toBe(true);
		expect(life.begin().current()).toBe(false);
	});
});
