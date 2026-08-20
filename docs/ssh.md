# SSH Git access

Marl accepts OpenSSH public keys from **Settings -> SSH keys**. Once a key is registered, use the
SSH URL from a repository's **Clone** menu:

```powershell
git clone ssh://git@marl.example.com/organization/repository.git
```

The gateway authenticates only public keys registered to a Marl account. It authorizes every
`git-upload-pack` and `git-receive-pack` request against current organization, team, repository,
and token-independent user permissions. It does not provide an interactive shell or accept other
commands. The host key is generated once under the Git data directory; set `MARL_SSH_HOST_KEY`
to keep it at an explicit persistent path.

## Development

The local Git gateway listens on `127.0.0.1:42621` for SSH and `127.0.0.1:42619` for Smart HTTP.
Override the SSH listener with `MARL_SSH_LISTEN` and the URL shown by the API with
`GIT_SSH_PUBLIC_URL`.

## Production topology

Cloudflare Container SSH is an operator connection reached through Wrangler, not a public TCP
listener. Run Marl's Rust Git gateway on a persistent TCP origin for public SSH, set
`MARL_SSH_LISTEN=0.0.0.0:22`, and publish that origin through Cloudflare Spectrum or another TCP
load balancer. Set `GIT_SSH_PUBLIC_URL` to the external SSH base URL. The Cloudflare Worker and
Container path continues to serve HTTPS Git independently.

Keep the gateway token and host private key outside the image, restrict the control-plane route
to the gateway, and persist the repository data directory. Production startup should fail if
either the HTTP or SSH listener cannot bind.
