// The shared set-up moves the real pointer off the test frame before each
// test (vitest-setup-client.ts). This file and its twin run the same checks;
// whichever runs second in a browser page starts where the first left the
// pointer.
//
// Version: 0.3.7
import { pointerResetSuite } from './test-pointer-probe';

pointerResetSuite('b');
