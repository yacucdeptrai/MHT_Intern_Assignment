import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;
  const isForbidden = isRouteErrorResponse(error) && error.status === 403;
  const message = isNotFound ? "Not found" : isForbidden ? "Forbidden" : "Something went wrong";
  const details = isNotFound
    ? "The requested page could not be found."
    : isForbidden
      ? "You do not have permission to access this page."
      : "An unexpected error occurred.";

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{message}</h1>
      <p className="mt-2 text-gray-600">{details}</p>
    </main>
  );
}
