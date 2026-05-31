export function GET() {
  return Response.json({ status: "ok", service: "web-auth" }, { status: 200 });
}
