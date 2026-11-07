/** Longest visitor address forwarded (ClearSite caps it the same way). */
const MAX_VISITOR_IP = 64;
/** Characters an IPv4 or IPv6 address can hold. Anything else is not an address and must not reach a header. */
const IP_CHARS = /^[0-9A-Fa-f:.]+$/;
/**
 * The visitor's address for ClearSite's `X-Visitor-IP` header, or null. Pass the incoming `Request` (its
 * `CF-Connecting-IP` is read) or the address itself. Never guesses: no header, an empty value or something that is
 * not an address gives null, and it never falls back to `X-Forwarded-For` or the site's own address.
 */
export function visitorIp(source) {
    const raw = typeof source === "string" ? source : source?.headers.get("CF-Connecting-IP");
    const ip = (raw ?? "").trim().slice(0, MAX_VISITOR_IP);
    return ip && IP_CHARS.test(ip) ? ip : null;
}
/**
 * Headers for the server-to-server POST to ClearSite's form endpoint. ClearSite counts submissions per visitor
 * (default 5 an hour) but a call from a site's server has no browser Origin, so it trusts only `X-Visitor-IP`.
 * The wire format is otherwise the same as before: JSON plus `X-API-Key`. `X-Visitor-IP` is omitted when unknown.
 */
export function clearSiteHeaders(opts) {
    const headers = { "Content-Type": "application/json", "X-API-Key": opts.apiKey };
    const ip = visitorIp(opts.visitor);
    if (ip)
        headers["X-Visitor-IP"] = ip;
    return headers;
}
