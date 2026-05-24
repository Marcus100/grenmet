export function GET() {
  return Response.json(
    { status: "ok", service: "web-spicewx" },
    { status: 200 }
  );
}
