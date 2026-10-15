/**
 * Worker de borda: força HTTPS e entrega os arquivos estáticos de ./public.
 * Os cabeçalhos de segurança são definidos em public/_headers.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
