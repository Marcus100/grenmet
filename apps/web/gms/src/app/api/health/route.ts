export function GET() {
  return Response.json({ status: "ok", service: "web-gms" }, { status: 200 });
}
