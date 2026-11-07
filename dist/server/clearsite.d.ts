/**
 * The visitor's address for ClearSite's `X-Visitor-IP` header, or null. Pass the incoming `Request` (its
 * `CF-Connecting-IP` is read) or the address itself. Never guesses: no header, an empty value or something that is
 * not an address gives null, and it never falls back to `X-Forwarded-For` or the site's own address.
 */
export declare function visitorIp(source: Request | string | null | undefined): string | null;
/**
 * Headers for the server-to-server POST to ClearSite's form endpoint. ClearSite counts submissions per visitor
 * (default 5 an hour) but a call from a site's server has no browser Origin, so it trusts only `X-Visitor-IP`.
 * The wire format is otherwise the same as before: JSON plus `X-API-Key`. `X-Visitor-IP` is omitted when unknown.
 */
export declare function clearSiteHeaders(opts: {
    apiKey: string;
    visitor?: Request | string | null;
}): Record<string, string>;
