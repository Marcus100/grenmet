export function GET() {
  return Response.json(
    { status: "ok", service: "web-wxproducts" },
    { status: 200 }
  );
}
