import { powershellInstallScript } from '$lib/install';

export function GET() {
	return new Response(powershellInstallScript, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=300',
			'content-disposition': 'inline; filename="install.ps1"'
		}
	});
}
