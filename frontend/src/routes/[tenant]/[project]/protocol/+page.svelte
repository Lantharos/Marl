<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	const tenant = $derived($page.params.tenant as string);
	const project = $derived($page.params.project as string);

	$effect(() => {
		if (tenant && project) goto(`/${tenant}/${project}/settings`, { replaceState: true });
	});
</script>
