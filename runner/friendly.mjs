// friendly.mjs: what an error means, in words the user can act on. Node says
// "fetch failed" when the internet is down; the user reads why and what to do.

const NETWORK = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|UND_ERR|socket hang up|network error/i;

export function friendlyMessage(message) {
  const m = String(message ?? "");
  if (NETWORK.test(m) && !/internet connection/i.test(m)) return `${m} The internet connection may be down, or the service cannot be reached right now. Check the connection and press the button again; nothing is lost.`;
  return m;
}
