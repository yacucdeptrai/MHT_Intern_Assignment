// Minimal Worker entry for the db test project; tests talk to bindings directly.
export default {
  fetch() {
    return new Response(null, { status: 204 });
  },
} satisfies ExportedHandler;
