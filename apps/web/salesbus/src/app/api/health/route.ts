export function GET() {
  return Response.json(
    { status: "ok", service: "web-salesbus" },
    { status: 200 }
  );
}
