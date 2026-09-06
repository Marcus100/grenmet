export function GET() {
  return Response.json({ status: "ok", service: "web-docs" }, { status: 200 });
}
