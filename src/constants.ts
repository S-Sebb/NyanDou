/** Index marking a transparent cell that needs no bead. */
export const EMPTY_CELL = 0xffff;

/** Upper bound for any canvas we allocate, to keep memory use predictable on phones. */
export const MAX_CANVAS_PIXELS = 8_000_000;

/** A worker that has not answered by then is treated as failed. */
export const WORKER_TIMEOUT_MS = 45_000;

/** The longer side of a chart never exceeds this many beads. */
export const MAX_BEADS_PER_SIDE = 160;

/** The outline-first style samples each bead as a grid of this many pixels per axis. */
export const DETAIL_SAMPLES_PER_AXIS = 4;

export const MARD_COLOR_LIMIT = 221;
export const AUTO_COLOR_LIMIT = 256;
