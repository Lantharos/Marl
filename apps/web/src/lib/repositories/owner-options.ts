export type RepositoryOwner = {
  slug: string;
  name: string;
  kind: 'personal' | 'team';
  role: 'owner' | 'admin' | 'member';
};

export function ownerOptions(owners: RepositoryOwner[], personalName: string | undefined) {
  return owners
    .toSorted(
      (left, right) =>
        Number(right.kind === 'personal') - Number(left.kind === 'personal') || left.name.localeCompare(right.name)
    )
    .map((owner) => ({
      value: owner.slug,
      label: owner.kind === 'personal' ? (personalName ?? owner.name) : owner.name,
      description: owner.kind === 'personal' ? `@${owner.slug} · Personal account` : `@${owner.slug} · Organization`
    }));
}
