# vercel-header-confirmation

A small Next.js project for verifying how Vercel handles request headers.

## Purpose

The [Request headers](https://vercel.com/docs/headers/request-headers) page in the Vercel docs describes headers such as `x-forwarded-for`.
The docs alone do not show what actually happens at runtime.
For example, is a client-supplied value overwritten? How are malformed values treated?

This project answers those questions by measurement.
Each header gets a small API endpoint that echoes what the server receives.
You deploy it to Vercel and send real requests, either with `curl` or with a probe script.

## Setup

Prerequisites: Node.js and [pnpm](https://pnpm.io/) (the version is pinned in `package.json`).

```bash
pnpm install
pnpm dev # http://localhost:3000
```

Note that running locally does not go through Vercel's edge network.
To see Vercel's real behavior, you must deploy.

## Usage

### 1. Manage the Vercel project

1. `Resume Project` in the Vercel dashboard before you start.
2. `Pause Project` when you are done.

### 2. Deploy

The Vercel project is connected to the GitHub repository.
Pushing to `main` triggers an automatic deployment.

If you fork this repository, connect your own Vercel project and use your own deployment URL in place of `https://vercel-header-confirmation.vercel.app`.

### 3. Check a header with `curl`

Example for `x-forwarded-for`.
The endpoint is `src/app/api/x-forwarded-for/route.ts`:

```ts
// This API endpoint returns "x-forwarded-for" header.
export function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for");
  return new Response(`x-forwarded-for's IP: ${ip}`);
}
```

Send a request with a spoofed value:

```bash
curl -H "X-Forwarded-For: 9.9.9.9" https://vercel-header-confirmation.vercel.app/api/x-forwarded-for
```

Output (digits are masked here):

```text
x-forwarded-for's IP: xxx.xxx.xx.xxx
```

If Vercel overwrites the header, you see your own public IP instead of `9.9.9.9`.
You can look up your own IP with:

```bash
curl https://ifconfig.me
```

### 4. Probe with the script

The script sends many unusual header values (multiple IPs, IPv6, very long values, CRLF, and so on) and prints a table of the responses.

```bash
pnpm check:x-forwarded-for [URL]
```

- `URL` is optional.
  The default is `https://vercel-header-confirmation.vercel.app/api/x-forwarded-for`.
- The URL must be a valid `http(s)` URL with a dotted domain name, so `localhost` is rejected.
  Use a deployed URL.
- Each table row shows the pattern name, the header that was sent, the HTTP status, the echoed response, and any client-side error.

## Adding a new check

Use the header name exactly as written in the Vercel docs, in lowercase, as `{header-name}`.

| What                  | Path or command                      |
| --------------------- | ------------------------------------ |
| API endpoint          | `src/app/api/{header-name}/route.ts` |
| Probe script          | `src/{header-name}/index.ts`         |
| `package.json` script | `check:{header-name}`                |

Steps (example: `x-real-ip`):

1. Create `src/app/api/x-real-ip/route.ts` and return the value of the header you want to inspect:

   ```ts
   // This API endpoint returns "x-real-ip" header.
   export function GET(request: Request) {
     const value = request.headers.get("x-real-ip");
     return new Response(`x-real-ip: ${value}`);
   }
   ```

2. (Optional) Create `src/x-real-ip/index.ts` to send many patterns.
   Take `src/x-forwarded-for/index.ts` as a model:
   - Accept the target URL as the first CLI argument and fall back to a default URL.
   - Define the patterns as a list of `{ name, headers }`.
   - Print the results with `console.table`.
3. Add a script to `package.json`:

   ```json
   "check:x-real-ip": "tsx src/x-real-ip/index.ts"
   ```

4. Push to `main` and wait for the deployment.
5. Verify with `curl` or `pnpm check:x-real-ip`.

## Project layout

```text
src/
├── app/api/
│   └── {header-name}/route.ts   # endpoint that echoes the header
└── {header-name}/index.ts       # probe script (optional)
```

## Result

### `X-Forwarded-For`

Vercel always overwrites the `x-forwarded-for` header with the client's public IP address.
Of the 25 patterns, 21 reached Vercel and were processed, and all of them returned my own public IP regardless of the value sent.

The other 4 patterns did not get overwritten, for these reasons:

- 100KB value: Vercel rejected the request with 494, before any overwriting.
- NUL character, non-ASCII (full-width digits), and CRLF: the Node.js client rejected them before sending, so they never reached Vercel.

On Vercel, you can assume that the header **always has exactly one value, and that value is never empty**.

| (index) | pattern                           | sent                                     | status | response           | error                                                     |
| ------- | --------------------------------- | ---------------------------------------- | ------ | ------------------ | --------------------------------------------------------- |
| 0       | 'A. No header'                    | '(none)'                                 | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 1       | 'B. Single IP'                    | 'x-forwarded-for: "9.9.9.9"'             | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 2       | 'C. Multiple IPs (comma + space)' | 'x-forwarded-for: "1.1.1.1, 2.2.2.2"'    | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 3       | 'C. Multiple IPs (no space)'      | 'x-forwarded-for: "1.1.1.1,2.2.2.2"'     | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 4       | 'D. Same header on 2 lines'       | 'x-forwarded-for: ["1.1.1.1","2.2.2.2"]' | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 5       | 'E. Empty string'                 | 'x-forwarded-for: ""'                    | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 6       | 'E. Non-IP string'                | 'x-forwarded-for: "not-an-ip"'           | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 7       | 'E. IPv6'                         | 'x-forwarded-for: "2001:db8::1"'         | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 8       | 'E. IPv4-mapped IPv6'             | 'x-forwarded-for: "::ffff:9.9.9.9"'      | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 9       | 'E. With port'                    | 'x-forwarded-for: "9.9.9.9:8080"'        | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 10      | 'E. Surrounding whitespace'       | 'x-forwarded-for: " 9.9.9.9 "'           | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 11      | 'E. Contains tab'                 | 'x-forwarded-for: "9.9.9.9,\\t2.2.2.2"'  | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 12      | 'F. Different letter case'        | 'X-Forwarded-For: "9.9.9.9"'             | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 13      | 'G. localhost IP'                 | 'x-forwarded-for: "127.0.0.1"'           | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 14      | 'G. Private IP'                   | 'x-forwarded-for: "10.0.0.1"'            | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 15      | 'G. IPv6 loopback'                | 'x-forwarded-for: "::1"'                 | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 16      | 'G. localhost string'             | 'x-forwarded-for: "localhost"'           | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 17      | 'H. Very long value (10KB)'       | '<10019 chars>'                          | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 18      | 'H. Very long value (100KB)'      | '<100019 chars>'                         | 494    | '<91 chars>'       | ''                                                        |
| 19      | 'H. Many IPs (1000)'              | '<11585 chars>'                          | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 20      | 'I. XSS string'                   | '<44 chars>'                             | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 21      | 'I. SQLi string'                  | `x-forwarded-for: "' OR 1=1--"`          | 200    | '"xxx.xxx.xx.xxx"' | ''                                                        |
| 22      | 'I. NUL character'                | 'x-forwarded-for: "9.9.9.9\\u0000"'      | ''     | ''                 | 'Invalid character in header content ["x-forwarded-for"]' |
| 23      | 'I. Non-ASCII'                    | 'x-forwarded-for: "９.９.９.９"'         | ''     | ''                 | 'Invalid character in header content ["x-forwarded-for"]' |
| 24      | 'J. CRLF'                         | '<43 chars>'                             | ''     | ''                 | 'Invalid character in header content ["x-forwarded-for"]' |

Notes:

- `xxx.xxx.xx.xxx` is my public IP address, masked. See [Check a header with `curl`](#3-check-a-header-with-curl) for how to look up yours.
- Rows 22-24 have an empty `status` and a non-empty `error`. The Node.js client rejected them as invalid headers before sending, so they do not show Vercel's behavior.

#### HTTP status

| status | response                        | meaning                                                   |
| ------ | ------------------------------- | --------------------------------------------------------- |
| 200    | OK                              | The request succeeded.                                    |
| 431    | Request header fields too large | The header is too large, so the request is not processed. |
| 494    | Request header too large        | Same meaning as 431 (nginx / Akamai-specific response).   |
