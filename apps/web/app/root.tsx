import { useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import type { LoaderFunctionArgs } from "react-router";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { getScopedI18n } from "./i18n/i18n";
import { DEFAULT_LANGUAGE } from "./i18n/types";
import { getLanguage } from "./utils/i18n.server";
import "./app.css";

export function loader({ request }: LoaderFunctionArgs) {
  const lang = getLanguage(request);
  return { lang };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const lang = data?.lang ?? DEFAULT_LANGUAGE;

  return (
    <html lang={lang}>
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
  const data = useLoaderData<typeof loader>();
  const lang = data.lang;
  const i18nInstance = useMemo(() => getScopedI18n(lang), [lang]);

  return (
    <I18nextProvider i18n={i18nInstance}>
      <Outlet />
    </I18nextProvider>
  );
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
