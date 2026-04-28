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

export async function downloadObjectText(tenant: string, project: string, id: string | null | undefined, options: ApiOptions = {}) {
	if (!id) return null;
	const [object] = await downloadObjects(tenant, project, [id], options);
	if (!object || object.kind !== 'blob') return null;
	return new TextDecoder().decode(base64ToBytes(object.bytes_base64));
}

function bytesToBase64(bytes: Uint8Array) {
	let binary = '';
	const chunkSize = 0x8000;
	for (let index = 0; index < bytes.length; index += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
	}
	return btoa(binary);
}

function base64ToBytes(value: string) {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}
