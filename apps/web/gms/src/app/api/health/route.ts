export function GET() {
  return Response.json({ service: "web-gms", status: "ok" }, { status: 200 });
}
