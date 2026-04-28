import { publicFetch, type ApiOptions } from './apiShared';

export type DownloadedObject = {
	id: string;
	kind: string;
	bytes_base64: string;
};

export async function downloadObjects(tenant: string, project: string, ids: string[], options: ApiOptions = {}): Promise<DownloadedObject[]> {
	return Promise.all(
		ids.map(async (id) => {
			const response = await publicFetch(`/v1/tenants/${tenant}/projects/${project}/objects/${encodeURIComponent(id)}`, {
				signal: options.signal
			});
			const kind = response.headers.get('x-pig-object-kind') ?? 'blob';
			const bytes = new Uint8Array(await response.arrayBuffer());
			return { id, kind, bytes_base64: bytesToBase64(bytes) };
		})
	);
}

function bytesToBase64(bytes: Uint8Array) {
	let binary = '';
	const chunkSize = 0x8000;
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary);
}
