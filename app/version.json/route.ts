export const dynamic = "force-static";
export function GET() {
	return Response.json({
		version: process.env.NEXT_PUBLIC_GIT_COMMIT ?? "unknown",
		builtAt: new Date().toISOString(),
	});
}
