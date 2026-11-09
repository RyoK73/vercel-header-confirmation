// Script to investigate how Vercel handles x-forwarded-for.
// Usage: pnpm check:xff [URL]  (defaults to the production URL if omitted)
import http from "node:http";
import https from "node:https";
import z from "zod";
import consola from "consola";

const DEFAULT_URL = "https://vercel-header-confirmation.vercel.app/api/header";
const RESPONSE_PREFIX = "x-forwarded-for's IP: ";
const MAX_CELL_LENGTH = 40;

type HeaderValue = string | string[];
type Pattern = { name: string; headers: Record<string, HeaderValue> };
type Result = { status?: number; body?: string; error?: string };

const XFF = "x-forwarded-for";

// Join n IPs of the form 10.0.x.y, separated by commas
const manyIps = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => `10.${Math.floor(i / 250)}.0.${(i % 250) + 1}`,
  ).join(", ");

const patterns: Pattern[] = [
  { name: "A. No header", headers: {} },
  { name: "B. Single IP", headers: { [XFF]: "9.9.9.9" } },
  {
    name: "C. Multiple IPs (comma + space)",
    headers: { [XFF]: "1.1.1.1, 2.2.2.2" },
  },
  { name: "C. Multiple IPs (no space)", headers: { [XFF]: "1.1.1.1,2.2.2.2" } },
  // Using an array sends the same header name on multiple lines
  {
    name: "D. Same header on 2 lines",
    headers: { [XFF]: ["1.1.1.1", "2.2.2.2"] },
  },
  { name: "E. Empty string", headers: { [XFF]: "" } },
  { name: "E. Non-IP string", headers: { [XFF]: "not-an-ip" } },
  { name: "E. IPv6", headers: { [XFF]: "2001:db8::1" } },
  { name: "E. IPv4-mapped IPv6", headers: { [XFF]: "::ffff:9.9.9.9" } },
  { name: "E. With port", headers: { [XFF]: "9.9.9.9:8080" } },
  { name: "E. Surrounding whitespace", headers: { [XFF]: "  9.9.9.9  " } },
  { name: "E. Contains tab", headers: { [XFF]: "9.9.9.9,\t2.2.2.2" } },
  {
    name: "F. Different letter case",
    headers: { "X-Forwarded-For": "9.9.9.9" },
  },
  { name: "G. localhost IP", headers: { [XFF]: "127.0.0.1" } },
  { name: "G. Private IP", headers: { [XFF]: "10.0.0.1" } },
  { name: "G. IPv6 loopback", headers: { [XFF]: "::1" } },
  { name: "G. localhost string", headers: { [XFF]: "localhost" } },
  { name: "H. Very long value (10KB)", headers: { [XFF]: "9".repeat(10_000) } },
  {
    name: "H. Very long value (100KB)",
    headers: { [XFF]: "9".repeat(100_000) },
  },
  { name: "H. Many IPs (1000)", headers: { [XFF]: manyIps(1000) } },
  { name: "I. XSS string", headers: { [XFF]: "<script>alert(1)</script>" } },
  { name: "I. SQLi string", headers: { [XFF]: "' OR 1=1--" } },
  { name: "I. NUL character", headers: { [XFF]: "9.9.9.9\u0000" } },
  { name: "I. Non-ASCII", headers: { [XFF]: "９.９.９.９" } },
  { name: "J. CRLF", headers: { [XFF]: "9.9.9.9\r\nX-Injected: 1" } },
];

function sendRequest(
  url: URL,
  headers: Record<string, HeaderValue>,
): Promise<Result> {
  return new Promise((resolve) => {
    const client = url.protocol === "http:" ? http : https;
    try {
      // request() throws synchronously on invalid header values (e.g. CRLF)
      const req = client.request(
        url,
        { method: "GET", headers, timeout: 10_000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("timeout", () => req.destroy(new Error("timeout")));
      req.on("error", (e) => resolve({ error: e.message }));
      req.end();
    } catch (e) {
      resolve({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}

// For long values, show only the length
const truncate = (text: string): string => {
  return text.length > MAX_CELL_LENGTH ? `<${text.length} chars>` : text;
};

const describeSent = (headers: Record<string, HeaderValue>): string => {
  const entries = Object.entries(headers);
  if (entries.length === 0) return "(none)";
  return entries
    .map(([k, v]) => truncate(`${k}: ${JSON.stringify(v)}`))
    .join(" / ");
};

const describeResponse = (result: Result): string => {
  if (result.body === undefined) return "";
  const value = result.body.startsWith(RESPONSE_PREFIX)
    ? result.body.slice(RESPONSE_PREFIX.length)
    : result.body;
  return truncate(JSON.stringify(value));
};

const parseHttpUrl = (target: URL) => {
  const httpUrlSchema = z.httpUrl({ error: "URLではありません" });
  try {
    httpUrlSchema.parse(target.href);
    consola.success(`target URL : ${target.href}`);
  } catch (e) {
    if (e instanceof Error) {
      consola.fail(e.message);
      process.exit(1);
    }
  }
};

const main = async () => {
  const targetUrl = new URL(process.argv[2] ?? DEFAULT_URL);
  parseHttpUrl(targetUrl);

  const rows = [];
  for (const pattern of patterns) {
    const result = await sendRequest(targetUrl, pattern.headers);
    rows.push({
      pattern: pattern.name,
      sent: describeSent(pattern.headers),
      status: result.status ?? "",
      response: describeResponse(result),
      error: result.error ?? "",
    });
  }
  console.table(rows);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
