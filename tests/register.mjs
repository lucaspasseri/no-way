import { registerHooks } from 'node:module';

// Next.js enforces this boundary at build time. Node's unit runner has no RSC
// environment, so substitute only the marker (never the service itself).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export {};', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
