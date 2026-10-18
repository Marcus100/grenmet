export function GET() {
  return Response.json({ service: "web-cap", status: "ok" }, { status: 200 });
}
