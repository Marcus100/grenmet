export function GET() {
  return Response.json(
    { status: "ok", service: "web-wxwatch" },
    { status: 200 }
  );
}
