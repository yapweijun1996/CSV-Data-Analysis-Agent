/**
 * AGRUN-001: minimal ambient typing for the untyped agrun UMD distribution.
 * The runtime export shape varies by host interop (see agrunModule.ts), so
 * the namespace is typed loosely and normalized/validated at load time.
 * Widen here only when the adapter layer actually consumes a new export.
 */
declare module 'agent-runtime-javascript-dist/agrun.js' {
    const namespace: Record<string, unknown> & { default?: unknown };
    export = namespace;
}
