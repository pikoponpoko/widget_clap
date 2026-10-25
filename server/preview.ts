// Browser-only preview: no database, uploads, authentication or payments are enabled.
export interface PreviewEnv {
  ASSETS: Fetcher;
}
export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/"))
      return Response.json(
        {
          error: "体験版では作者への送信を受け付けていません。",
          mode: "browser-preview",
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    const response = await env.ASSETS.fetch(request);
    const out = new Response(response.body, response);
    const frames =
      url.pathname.startsWith("/widget/") || url.pathname.startsWith("/button/")
        ? "'self' https: http:"
        : "'none'";
    out.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors ${frames}`,
    );
    out.headers.set("X-Content-Type-Options", "nosniff");
    out.headers.set("Referrer-Policy", "no-referrer");
    out.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (response.headers.get("Content-Type")?.includes("text/html"))
      out.headers.set("Cache-Control", "no-cache");
    return out;
  },
};
