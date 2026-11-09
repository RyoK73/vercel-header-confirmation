// This API endpoint returns "x-forwarded-for" header.
export function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for");
  return new Response(`x-forwarded-for's IP: ${ip}`);
}
