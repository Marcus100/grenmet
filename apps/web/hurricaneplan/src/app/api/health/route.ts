export function GET() {
  return Response.json(
    { status: "ok", service: "web-hurricaneplan" },
    { status: 200 }
  );
}
