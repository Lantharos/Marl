# SSH Git access

Marl accepts Ed25519 and ECDSA OpenSSH public keys from **Settings -> SSH keys**. Once a key is
registered, use the SSH URL from a repository's **Clone** menu:

```powershell
git clone ssh://git@marl.example.com/organization/repository.git
```

The gateway authenticates only public keys registered to a Marl account. It authorizes every
`git-upload-pack` and `git-receive-pack` request against current organization, team, repository,
and token-independent user permissions. It does not provide an interactive shell or accept other
commands. The host key is generated once under the Git data directory; set `MARL_SSH_HOST_KEY`
to keep it at an explicit persistent path.

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

The public-key path works when the matching private key is loaded in your SSH agent. Otherwise,
set `user.signingkey` to the private-key path instead.

## Development

The local Git gateway listens on `127.0.0.1:42621` for SSH and `127.0.0.1:42619` for Smart HTTP.
Override the SSH listener with `MARL_SSH_LISTEN` and the URL shown by the API with
`GIT_SSH_PUBLIC_URL`.

## Production topology

Production currently advertises HTTPS Git only. Cloudflare Container SSH is an operator
connection reached through Wrangler, not a public TCP listener, and the persistent Rust gateway
writes a local bare repository rather than Marl's canonical R2 generations. Publishing it as a
second writable origin would split repository state.

Do not set `GIT_SSH_PUBLIC_URL` until the SSH receive path participates in the same repository
lease, validation, and R2 publication protocol as HTTPS. A future public TCP origin must also keep
the gateway token and host private key outside its image, restrict control-plane access, persist
the host key, and fail startup when either listener cannot bind.
