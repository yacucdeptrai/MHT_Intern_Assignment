import { APP_NAME } from "@pm/domain";

import type { Route } from "./+types/_index";

export function meta(_args: Route.MetaArgs) {
  return [{ title: APP_NAME }];
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
      <p className="mt-2 text-gray-600">The workspace is set up. Features arrive milestone by milestone.</p>
    </main>
  );
}
