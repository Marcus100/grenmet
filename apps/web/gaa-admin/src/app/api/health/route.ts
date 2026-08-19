export function GET() {
  return Response.json({ status: "ok", service: "web-admin" }, { status: 200 });
}
