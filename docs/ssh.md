# SSH Git access

Marl accepts Ed25519 and ECDSA OpenSSH public keys from **Settings -> SSH keys**. Once a key is
registered, use the SSH URL from a repository's **Clone** menu:

```sh
git clone ssh://git@ssh.marl.sh/organization/repository.git
```

The gateway authenticates only public keys registered to a Marl account. It authorizes every
`git-upload-pack` and `git-receive-pack` request against current organization, team, repository,
and token-independent user permissions. It does not provide an interactive shell or accept other
commands. Production refuses to start SSH without `MARL_SSH_HOST_KEY` pointing to an existing
persistent private host key.

Smart HTTP and SSH pushes accept at most 256 MiB of incoming pack data. The `refs/marl/`
namespace is reserved for Marl's pull-request retention refs; clients cannot create, update, or
delete refs in that namespace, and the gateway does not advertise them to fetch clients.

## Commit signing

The same registered SSH keys can sign commits. Configure Git with the public key path:

```powershell
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

Marl shows **Verified** only after the signature is cryptographically valid, the signing key is
still linked to a Marl account, and the commit author email matches that account's verified email.
Removing the key removes its verification from indexed commits.

Choose a mode in **Settings -> Sign-in and security**, or under a repository's
**Settings -> Access and security**:

- **Optional** accepts unsigned commits without an indicator. Valid signatures show Verified.
- **Vigilant** accepts commits but shows Unverified when their signature cannot be verified.
- **Firewall** rejects new commits without a valid SSH signature from the author's registered key.

The stricter personal or repository mode applies. Personal settings protect author identities
using the account's verified email addresses, not display names or the account doing the push.
Repository Firewall applies to every incoming author, including maintainers. An unknown author,
an unregistered key, or a signature that cannot be verified does not pass Firewall.

The policy applies to new history, including parents of the pushed tip, over Smart HTTP, SSH,
and native uploads. Previously accepted history remains available when a mode changes. Deleting
a branch does not require a commit signature. When signing policy cannot be loaded, a push that
introduces commits is rejected; retry once Marl is available.

Marl does not hold your private signing key. With Firewall enabled, create and sign merge,
squash, or rebased commits locally and push them. The web merge action cannot create a verified
signature on your behalf. Only SSH commit signatures are currently verified; a signed tag alone
does not verify the commits it points to.

The public-key path works when the matching private key is loaded in your SSH agent. Otherwise,
set `user.signingkey` to the private-key path instead.

## Development

The local Git gateway listens on `127.0.0.1:42621` for SSH and `127.0.0.1:42619` for Smart HTTP.
Override the SSH listener with `MARL_SSH_LISTEN` and the URL shown by the API with
`GIT_SSH_PUBLIC_URL`.

## Production topology

Workers cannot accept inbound raw TCP, so production SSH runs the Rust gateway on a small
persistent origin behind the unproxied `ssh.marl.sh` DNS record. Before each command it downloads
the exact active generation and activates it in its local cache. An SSH push is captured after
`git-receive-pack`, then sent through the Git Worker's normal reservation, multipart upload,
validation, compare-and-swap, and R2 publication path. SSH returns success only after publication
finishes. A competing push fails instead of replacing newer refs.

The local repository directory is disposable caching. Only the host key must persist there; Git
packs and refs remain canonical in R2 and the repository Durable Object. Use the checked
`deploy/ssh/compose.yaml` definition and deployment instructions in
[`deployment.md`](deployment.md).
