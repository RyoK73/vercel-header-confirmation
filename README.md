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
