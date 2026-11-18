// URL helpers shared by the recorder and the replayer.

const MUTATION_PARAMS = ['mut', 'seed', 'sid'];

/** Drop the benchmark's own query parameters (mutation level, seed, session) from a URL. */
export function recordedUrl(raw: string): string {
  const u = new URL(raw);
  for (const p of MUTATION_PARAMS) u.searchParams.delete(p);
  return u.toString();
}

function segments(pathname: string): string[] {
  return pathname
    .split('/')
    .filter(Boolean)
    // alias segments such as /v2 inserted by link rewrites are not part of the page identity
    .filter((s) => !/^v\d+$/.test(s));
}

/** `http://127.0.0.1:4173/bookshop/book/4?x=1` becomes `http://127.0.0.1:*\/bookshop/book/:id`. */
export function urlPattern(raw: string): string {
  const u = new URL(raw);
  const segs = segments(u.pathname).map((s) => (/^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s) ? ':id' : s));
  return `${u.protocol}//${u.hostname}:*/${segs.join('/')}`;
}

/** True when `url` has the same host and path shape as `pattern` (query and ids ignored). */
export function urlMatches(pattern: string, raw: string): boolean {
  if (!pattern) return true;
  let actual: string;
  try {
    actual = urlPattern(raw);
  } catch {
    return false;
  }
  const a = actual.split('/');
  const p = pattern.split('/');
  if (a.length !== p.length) return false;
  return p.every((seg, i) => seg === ':id' || a[i] === ':id' || seg === a[i]);
}

/** Replace the origin of a recorded URL with the origin used for this replay. */
export function rebase(recorded: string, baseOrigin: string): string {
  const u = new URL(recorded);
  return `${baseOrigin}${u.pathname}${u.search}`;
}

/** Turn a typed value into `{{name}}` when it equals a known parameter value. */
export function parameterize(value: string, params: Record<string, string>): string {
  for (const [name, v] of Object.entries(params)) {
    if (v !== '' && value.trim().toLowerCase() === v.trim().toLowerCase()) return `{{${name}}}`;
  }
  return value;
}
