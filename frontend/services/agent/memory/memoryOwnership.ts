/**
 * The app is the sole durable memory owner.
 *
 * The app owns report-scoped vector memory and promotion. Pi may consume a
 * bounded projection of that memory, but its own global memory stays disabled.
 */
export const FOLLOW_UP_MEMORY_OWNER = 'app' as const;
export const PI_GLOBAL_MEMORY_ENABLED = false as const;
