export function GET() {
  return Response.json({ status: "ok", service: "web-hr" }, { status: 200 });
}
