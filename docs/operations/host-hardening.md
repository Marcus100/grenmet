# Host hardening runbook

**Status:** Active runbook (owner actions; nothing here has been applied yet)  
**Owner:** Barrels Grenada engineering (operator: repository owner)  
**Last updated:** 2026-10-20

Plain, step-by-step hardening for the DigitalOcean droplets. Every step says
**why**, gives the exact command or dashboard path, how to **verify** it, and how
to **undo** it. Work through one host at a time, staging first. Anything marked
**Unverified** was not checked against the live hosts or the provider's current
documentation; confirm it before relying on it.

Never paste secrets, private keys or droplet IP addresses into chat, issues or
this repository. Where a command needs an address, this page uses a placeholder
such as `<OWNER_IP>`.

## Which hosts this covers

| Host | Source of truth | SSH login today | Runner labels |
| --- | --- | --- | --- |
| Production core | [deployment guide](../deployment.md), [infrastructure](../infrastructure.md) | `deploy` (key) | `self-hosted, production, core` |
| Staging core | same | `root` (key) | `self-hosted, staging, core` |
| Weather host (per environment) | [`infra/weather/README.md`](../../infra/weather/README.md) | not documented | `self-hosted, <environment>, weather` |

**Unverified:** the weather droplets are described as a required target in
`infra/weather/README.md`, but this repository does not record whether they have
been provisioned. Apply this runbook to each weather droplet only once it exists.

## Before you start

1. **Why:** a mistake in SSH or firewall settings can lock you out. Keep a way back in.
2. Open the DigitalOcean dashboard → **Droplets → (droplet) → Access**. Confirm you
   can open the **Recovery Console** (also called the emergency console). It
   works even when SSH is broken, but it needs a user **with a password**.
3. Take a snapshot: **Droplets → (droplet) → Snapshots → Take live snapshot**.
   **Undo point:** you can restore this snapshot if anything goes badly wrong.
   Snapshots cost money per GB per month; delete it after a week of stable running.
4. Keep **two terminal windows** open. Use one to make changes and the other,
   already logged in, as your safety line. Never close the safety window until
   you have proven a fresh login works.

## Step 1: Automatic security updates

**Why:** most server break-ins use known bugs that already have a fix. Ubuntu can
install security fixes for you every day.

```bash
sudo apt update
sudo apt install -y unattended-upgrades apt-listchanges
sudo dpkg-reconfigure -plow unattended-upgrades   # answer "Yes"
```

Limit it to security updates and allow a reboot in a quiet window. Edit
`/etc/apt/apt.conf.d/50unattended-upgrades` with `sudo nano` and make sure these
lines are present and not commented out (lines starting with `//` are off):

```text
Unattended-Upgrade::Allowed-Origins {
        "${distro_id}:${distro_codename}-security";
        "${distro_id}ESMApps:${distro_codename}-apps-security";
        "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
```

Pick a different reboot time per host so they never restart together:

| Host | Suggested reboot time (server clock, usually UTC) | Why this time |
| --- | --- | --- |
| Staging core | `04:30` | Grenada (UTC−4) is asleep at 00:30 local |
| Production core | `06:15` | After the 02:00 UTC backup; 02:15 local |
| Weather host | `05:15` | Between the other two |

**Why the reboot:** kernel fixes only take effect after a restart. Docker restarts
containers that have a `restart:` policy; check that before you rely on it (see
verify).

**Verify:**

```bash
cat /etc/apt/apt.conf.d/20auto-upgrades     # both values should be "1"
sudo unattended-upgrade --dry-run --debug 2>&1 | tail -20
timedatectl                                  # note the server time zone
docker inspect --format '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(docker ps -q)
```

Every long-running container should show `unless-stopped` or `always`. If any
shows `no`, leave `Automatic-Reboot "false"` on that host and reboot by hand
after updates until the Compose file is fixed through a reviewed change.

**Undo:** set `Automatic-Reboot "false"`, or remove the package with
`sudo apt remove unattended-upgrades`.

## Step 2: SSH with keys only, no root login

**Why:** passwords can be guessed; keys cannot in practice. Logging in as `root`
means any slip runs with full power, and `root` is the name every attacker tries.

### 2a. Staging only: create a sudo user before removing root

Staging is reached as `root` today (see the [deployment guide](../deployment.md)).
Production already uses `deploy`. Do this on staging (and on any weather host
that only has root):

```bash
# Logged in as root, in your FIRST window
adduser deploy                      # set a strong password; store it in your password manager
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

**Why the password:** SSH will not use it, but `sudo` and the Recovery Console do.

**Verify, in a SECOND window (keep the first open):**

```bash
ssh deploy@<staging-host>
sudo -v && echo "sudo works"
```

Only continue once both succeed. If they fail, fix it from the first window.

**Undo:** `deluser --remove-home deploy` (as root, only if you have not yet
disabled root login).

**Unverified:** whether the staging runner or any host timer depends on `root`'s
home directory or crontab. Check before disabling root:

```bash
sudo crontab -l -u root
systemctl list-timers --all | head -30
systemctl list-units 'actions.runner*'
```

### 2b. Turn off passwords and root login (every host)

Create a drop-in file rather than editing the main config, so undo is one delete:

```bash
sudo tee /etc/ssh/sshd_config.d/10-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowUsers deploy
EOF
sudo sshd -t && echo "config OK"
sudo systemctl reload ssh
```

`AllowUsers` lists who may log in over SSH. Use the real login name on each host.
Do **not** list the `github` runner user; it never needs SSH.

**Unverified:** Ubuntu cloud images can ship
`/etc/ssh/sshd_config.d/50-cloud-init.conf` with `PasswordAuthentication yes`.
OpenSSH uses the **first** value it reads, and files load in name order, so
`10-hardening.conf` should win. The verify step below proves it.

**Verify, from a NEW window (keep the old one open):**

```bash
sudo sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|allowusers)'
ssh deploy@<host>                          # must work
ssh root@<host>                            # must be refused
ssh -o PubkeyAuthentication=no deploy@<host>   # must be refused, no password prompt
```

**Undo:** `sudo rm /etc/ssh/sshd_config.d/10-hardening.conf && sudo systemctl reload ssh`.
If you are locked out, use the Recovery Console with the `deploy` password.

## Step 3: fail2ban for SSH

**Why:** bots try thousands of logins a day. With keys only they cannot get in,
but fail2ban still blocks repeat offenders and keeps the logs readable.

```bash
sudo apt install -y fail2ban
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'EOF'
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
ignoreip = 127.0.0.1/8 ::1 <OWNER_IP>
EOF
sudo systemctl enable --now fail2ban
```

Replace `<OWNER_IP>` with your own public address, or delete it from the line if
your address changes often.

**Verify:**

```bash
sudo fail2ban-client status sshd     # shows "Currently banned" and total failed
```

**Undo a ban on yourself:** `sudo fail2ban-client set sshd unbanip <ip>`.
**Undo entirely:** `sudo systemctl disable --now fail2ban && sudo apt remove fail2ban`.

## Step 4: DigitalOcean Cloud Firewall (the real network control)

**Why this, not ufw:** Docker writes its own firewall rules for every published
port (`ports:` in Compose). Those rules are checked **before** ufw's, so
`ufw deny 5432` does not stop traffic to a Docker-published port. The
DigitalOcean Cloud Firewall filters traffic before it reaches the droplet, so it
applies to Docker ports too. Keep ufw as a second layer for SSH, but treat the
Cloud Firewall as the control that matters.

Dashboard path: **Networking → Firewalls → Create Firewall**. Create one firewall
per role (for example `core-production`, `core-staging`, `weather-production`)
and apply it by droplet tag or by droplet name.

### Inbound rules

| Type | Port | Sources | Why |
| --- | --- | --- | --- |
| SSH | 22 | `<OWNER_IP>` only (add a second address if you work from two places) | Only you need SSH; deployments run on the host's own runner and need no inbound SSH |
| HTTP | 80 | All IPv4, All IPv6 | Let's Encrypt validation and redirect to HTTPS |
| HTTPS | 443 | All IPv4, All IPv6 | Public sites |
| Custom TCP | 5432 | Core firewall only: the weather droplet in the **same** environment (choose it by droplet name or tag, which uses its private VPC address) | Weather-to-core database link; never from the internet |
| ICMP | | All IPv4, All IPv6 (optional) | Lets `ping` work for diagnosis |

Do not add 5432 to the weather firewall unless a reviewed design needs it. The
production Compose file binds Postgres to the core host's private address only
(`CORE_PRIVATE_IP` in `infra/docker/docker-compose.deploy.yml`), so the firewall
rule is a second lock on top of that.

**Unverified:** that DigitalOcean Cloud Firewalls filter VPC (private) traffic as
well as public traffic. Check the current
[Cloud Firewalls docs](https://docs.digitalocean.com/products/networking/firewalls/)
before you rely on the 5432 rule, and test it (see verify).

**If your home IP changes:** you will lose SSH. Log in to DigitalOcean, edit the
firewall's SSH source to your new address (search "what is my IP"), and save.
Changes apply within a minute. The Recovery Console works regardless.
**Unverified:** whether the browser **Droplet Console** (not the Recovery
Console) needs port 22 open to DigitalOcean's addresses; if it stops working
after this change, use the Recovery Console instead.

### Outbound rules

Leave the default **All TCP, All UDP, ICMP to all destinations**. **Why:** the
runner pulls images, talks to GitHub, sends mail and backs up to Spaces. A
firewall with **no** outbound rules blocks all outbound traffic and will break
deployments.

### Later: allow 80/443 only from Cloudflare

Only after every web DNS record on the droplet is switched to **Proxied** (orange
cloud) in Cloudflare, limit 80 and 443 to Cloudflare's published ranges with
`scripts/production/cloudflare-origin-firewall.py` (plan by default, `--apply` to
change, `--restore-open` to undo). **Why:** stops people bypassing Cloudflare by
hitting the droplet directly. It must change together with Traefik's trusted
ranges, the visitor hop count and the certificate challenge
(`CLOUDFLARE_PROXY_ENABLED`): follow the
[Cloudflare proxy runbook](cloudflare-proxy.md). Certificates keep renewing
through Cloudflare over the HTTP challenge. The ranges change occasionally;
re-check them every quarter with `scripts/production/cloudflare_ranges.py --check`.

### Verify

From your laptop (not the droplet):

```bash
nc -vz -w 5 <host> 22     # succeeds from your IP; try from a phone hotspot: must time out
nc -vz -w 5 <host> 443    # succeeds
nc -vz -w 5 <host> 5432   # must time out
nc -vz -w 5 <host> 8000   # must time out (API is only reachable through Traefik)
```

From the weather host to the core host's private address:

```bash
nc -vz -w 5 <core-private-ip> 5432   # succeeds from the matching weather host only
```

Then load a few public sites, for example `https://api.barrels.gd/api/v1/utils/health-check/`.

**Undo:** **Networking → Firewalls → (firewall) → Droplets → Remove**. The
droplet is then open as before (ufw still applies to non-Docker ports).

### ufw as a second layer

Keep ufw on, but restrict SSH there too:

```bash
sudo ufw allow from <OWNER_IP> to any port 22 proto tcp
sudo ufw delete allow 22
sudo ufw status numbered
```

**Undo:** `sudo ufw allow 22`.

## Step 5: Self-hosted GitHub runner, least privilege

**Why it matters:** the runner executes whatever a workflow tells it to. The
`github` user is in the `docker` group, and **membership of `docker` is the same
as root**: anyone who can run `docker run -v /:/host ...` can read or change any
file on the machine. So the real protection is controlling **which workflows**
can reach the runner, not file permissions.

Checklist:

1. **Dedicated user, no SSH, no sudo.**

   ```bash
   id github                       # groups: github docker (no sudo)
   sudo grep -c . /home/github/.ssh/authorized_keys 2>/dev/null || echo "no SSH keys: good"
   ```

   Undo: none needed; this only checks.
2. **Only trusted workflows use it.** Self-hosted jobs in this repository are
   `deploy.yml`, `deploy-weather.yml`, `ensure-databases.yml`,
   `backup-database.yml`, `restore-drill.yml` and `monitoring-maintenance.yml`.
   None runs on `pull_request`. Keep it that way: never add a self-hosted
   `runs-on` to a workflow triggered by pull requests, because this repository
   is public and anyone can open one.
3. **Fork pull requests need approval.** GitHub → repository **Settings → Actions
   → General → Fork pull request workflows from outside collaborators** → choose
   **Require approval for all external contributors** (wording may differ;
   **unverified**).
4. **Environment protection.** **Settings → Environments → production** →
   **Deployment branches and tags** → allow only release tags; for `staging`,
   only the `staging` branch. Add yourself as **Required reviewer** for
   production. This stops a workflow on another branch from reading production
   secrets.
5. **Runner groups.** If the repository belongs to a GitHub organization, put
   the runners in a group restricted to **Selected workflows** (the six files
   above). **Unverified:** runner groups are an organization feature; a
   personal-account repository cannot use them, and then items 2 to 4 are the
   controls.
6. **One runner per host, one environment per runner.** Never register the
   staging runner on the production droplet or reuse a token.
7. **Keep it updated.** The runner auto-updates by default; check the version in
   **Settings → Actions → Runners** each quarter.

**Undo:** to remove a runner, on the host run
`cd /home/github/actions-runner && sudo ./svc.sh stop && sudo ./svc.sh uninstall`,
then `./config.sh remove --token <token from the Runners page>` as `github`.

## Step 6: Disk and memory alerts

These already exist for staging and production; see
[analytics and monitoring](analytics-monitoring.md) (DigitalOcean alert
policies). Add the same policies for each weather droplet when it is created:
**Monitoring → Create alert policy**, CPU and memory above 90%, disk above 80%
(warning) and 90% (critical), for 5 minutes, email to the owner.

## Verification checklist

Tick each host once all lines pass. Re-run quarterly with the
[access review](../infrastructure.md#access-review).

| Check | Command or place | Expected |
| --- | --- | --- |
| Security updates on | `cat /etc/apt/apt.conf.d/20auto-upgrades` | both `"1"` |
| Reboot window set | `grep Automatic-Reboot /etc/apt/apt.conf.d/50unattended-upgrades` | `true` and this host's time |
| Root SSH off | `sudo sshd -T \| grep permitrootlogin` | `no` |
| Passwords off | `sudo sshd -T \| grep passwordauthentication` | `no` |
| Root login refused | `ssh root@<host>` from laptop | `Permission denied` |
| fail2ban running | `sudo fail2ban-client status sshd` | jail listed |
| Cloud Firewall attached | DO → Networking → Firewalls | droplet listed |
| 5432 closed publicly | `nc -vz -w 5 <host> 5432` from laptop | timeout |
| SSH closed to others | `nc -vz -w 5 <host> 22` from phone hotspot | timeout |
| Runner user not sudo | `id github` | no `sudo` group |
| Production env protected | GitHub → Settings → Environments | branch/tag rule and reviewer |
| Alerts exist | DO → Monitoring | CPU, memory, disk policies |
| Snapshot cleaned up | DO → Snapshots | old hardening snapshot deleted after a week |

## Related

- [Domain security](domain-security.md)
- [Account 2FA checklist](account-2fa-checklist.md)
- [Sentry hardening](sentry-hardening.md)
- [Security baseline](../security.md)
