import { redirect } from "react-router";

import { createLanguageCookie, isSupportedLanguage } from "../utils/i18n.server";
import { isRequestSecure } from "../utils/session.server";

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const rawLang = formData.get("lang");
  const redirectTo = formData.get("redirectTo");

  if (!isSupportedLanguage(rawLang)) {
    return Response.json({ success: false, errors: { lang: ["Invalid language"] } }, { status: 400 });
  }

  const isSecure = isRequestSecure(request);
  const cookie = createLanguageCookie(rawLang, isSecure);

  if (typeof redirectTo === "string" && redirectTo.startsWith("/") && !redirectTo.startsWith("//")) {
    return redirect(redirectTo, {
      headers: { "Set-Cookie": cookie },
    });
  }

  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      const refUrl = new URL(referer);
      return redirect(refUrl.pathname + refUrl.search, {
        headers: { "Set-Cookie": cookie },
      });
    } catch {
      // ignore
    }
  }

  return Response.json(
    { success: true, lang: rawLang },
    {
      headers: { "Set-Cookie": cookie },
    },
  );
}
