// Minimal Worker entry for the web test project; tests call services and bindings directly.
export default {
  fetch() {
    return new Response(null, { status: 204 });
  },
} satisfies ExportedHandler<Env>;
