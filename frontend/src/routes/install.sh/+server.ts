import { shellInstallScript } from '$lib/install';

export function GET() {
	return new Response(shellInstallScript, {
		headers: {
			'content-type': 'text/x-shellscript; charset=utf-8',
			'cache-control': 'public, max-age=300',
			'content-disposition': 'inline; filename="install.sh"'
		}
	});
}
