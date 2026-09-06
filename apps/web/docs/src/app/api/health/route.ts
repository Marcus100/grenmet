export function GET() {
  return Response.json({ service: "web-docs", status: "ok" }, { status: 200 });
}
