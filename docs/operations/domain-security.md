# Domain security runbook

**Status:** Active runbook (owner actions; nothing here has been applied yet)  
**Owner:** Barrels Grenada engineering (operator: repository owner)  
**Last updated:** 2026-10-20

One checklist for `barrels.gd`, `weather.gd` and `eugine.me`. Each step says
**why**, what to click or type, how to **verify** and how to **undo**. Items
marked **Unverified** were not checked against the live zones or the provider's
current documentation; confirm them first. The last recorded state of the
Cloudflare zones is in [domain configuration](domain-configuration.md).

Never paste origin IP addresses, API tokens or mailbox passwords into chat,
issues or this repository. Placeholders such as `<production droplet IP>` stand
in for real values.

## The three domains

| Domain | DNS host | Mail today | Mail wanted |
| --- | --- | --- | --- |
| `barrels.gd` | Cloudflare | Sends through Resend; unfinished Microsoft 365 setup | Send **and receive** (owner decision) |
| `eugine.me` | Cloudflare | None known | Probably none (owner to confirm) |
| `weather.gd` | **Unverified** (not recorded in this repo) | **Unverified** | Owner and GMS to confirm |

`weather.gd` is a GMS public domain served by the production stack (see
[weather.gd go-live](../weather-gd-golive.md)). Confirm who holds its registrar
account and whether GMS staff receive mail on it **before** changing its mail
records. Test, seed, example and CI email data use reserved names
(`example.com` addresses, `.invalid`/`.test` hosts), so tests never imply mail to
a real domain. `weather.gd` addresses that remain in the repository are real
production values (baseline seed, CAP sender, forecast contact).

## Before you start: back up each zone

**Why:** you can put every record back exactly if something breaks.
Cloudflare → select the zone → **DNS → Records → Import and Export → Export**.
Save the file in your password manager or a private folder (it contains origin
IPs; never commit it). **Undo point:** **Import** that file, or re-create a
record from it.

Install `dig` if you do not have it (`sudo apt install dnsutils` or macOS has it).
All checks below ask Cloudflare's public resolver so you see what the world sees.

## 1. Registrar: lock and 2FA

Do this for every domain at whichever registrar holds it (**unverified** which
registrar holds each; `barrels.gd` previously listed OnlyDomains nameservers).

1. **Turn on 2FA** for the registrar login (authenticator app or passkey, not
   SMS). **Why:** whoever controls the registrar can move the domain away.
   **Undo:** registrar account security page.
2. **Turn on registrar (transfer) lock.** **Why:** blocks transfers without your
   explicit unlock. **Verify:** `whois barrels.gd | grep -i status` shows
   `clientTransferProhibited`. **Unverified:** some country-code registries
   (`.gd`, `.me`) show little in `whois`; check the registrar dashboard instead.
   **Undo:** unlock in the registrar dashboard (needed only for a planned transfer).
3. **Use a recovery email on a different domain** (for example a Gmail address).
   **Why:** if `barrels.gd` mail breaks, you can still reset the registrar login.
4. **Turn on auto-renew** and check the card on file. **Why:** an expired domain
   can be bought by anyone.

## 2. Cloudflare account 2FA

Cloudflare reported 2FA **disabled** on 5 October 2026. Turn it on first; see
the [account 2FA checklist](account-2fa-checklist.md#cloudflare).

## 3. DNSSEC

**Why:** stops attackers forging DNS answers for your domain.

Cloudflare signing is on for `barrels.gd` and `eugine.me`; the DS record must
be added **at the registrar**. Follow the exact values and steps in
[domain configuration](domain-configuration.md#owner-finish-dnssec-at-each-registrar).
For `weather.gd`, enable DNSSEC in whichever DNS host serves it, then add its DS
record at its registrar.

**Verify:**

```bash
dig +short DS barrels.gd @1.1.1.1      # returns the DS record once the registrar publishes it
dig +dnssec A barrels.gd @1.1.1.1 | grep -E 'flags:.* ad'   # "ad" means validated
```

Cloudflare → zone → **DNS → Settings → DNSSEC** should show **Active**. A second
opinion: [dnsviz.net](https://dnsviz.net).

**Undo:** remove the DS record at the registrar **first**, wait 48 hours, then
disable DNSSEC in Cloudflare. Doing it the other way round takes the domain
offline for validating resolvers.

## 4. Replace wildcard records with explicit ones

**Why:** `*.barrels.gd` points every made-up name (for example
`anything.barrels.gd`) at the production droplet, and `*.staging.barrels.gd`
does the same for staging. A wildcard makes typos, forgotten services and
look-alike phishing hosts resolve to real servers, and new Vercel sites silently
fall through to DigitalOcean.

1. List the hosts that must exist. Use the URLs table at the end of the
   [deployment guide](../deployment.md) plus Vercel hosts (`barrels.gd`, `www`,
   `babydoll.barrels.gd` when created) and mail records (section 6).
2. In Cloudflare → **DNS → Records**, add one **A** record per host, pointing at
   the same target the wildcard uses today, **DNS only** (grey cloud), TTL Auto.
   Do this for production names and for each `<name>.staging` name.
3. **Verify every name** before deleting anything:

   ```bash
   for h in api auth admin docs gms signal mbia events cap gmsdash bookings cms traefik adminer; do
     printf '%-10s ' "$h"; dig +short "$h.barrels.gd" @1.1.1.1
   done
   ```

   Repeat with `"$h.staging.barrels.gd"`. **Unverified:** the host list above is
   illustrative; build yours from the deployment guide.
4. Delete the `*.barrels.gd` and `*.staging.barrels.gd` records.
5. **Verify** a made-up name no longer resolves and real sites still work:

   ```bash
   dig +short does-not-exist-123.barrels.gd @1.1.1.1    # empty answer
   curl -fsS https://api.barrels.gd/api/v1/utils/health-check/
   curl -fsS https://api.staging.barrels.gd/api/v1/utils/health-check/
   ```

**Undo:** re-add the wildcard A record (same target, DNS only). It takes effect
within the record's TTL.

From now on, adding a new subdomain means adding its DNS record in the same
change.

## 5. CAA records (which certificate authorities may issue)

**Why:** tells every certificate authority (CA) to refuse to issue certificates
for your domain unless it is on your list. It blocks mis-issued certificates.

| Domain | Who issues today | Records to add |
| --- | --- | --- |
| `barrels.gd` | Traefik (Let's Encrypt) on DigitalOcean; Vercel for the homepage | `0 issue "letsencrypt.org"` |
| `eugine.me` | Vercel | `0 issue "letsencrypt.org"` |
| `weather.gd` | Traefik (Let's Encrypt) | `0 issue "letsencrypt.org"` |

Add on each: `0 iodef "mailto:<security mailbox>"` once that mailbox receives
mail (after section 6 for `barrels.gd`).

**Unverified:** that Vercel issues only through Let's Encrypt for these domains.
Check Vercel's current docs or the issuer of the live certificate:

```bash
echo | openssl s_client -connect barrels.gd:443 -servername barrels.gd 2>/dev/null | openssl x509 -noout -issuer
```

**Only when you turn on Cloudflare proxying (orange cloud):** Cloudflare's own
edge certificates need their CAs listed too, including wildcard issuance. The
expected names are `pki.goog` (Google Trust Services), `letsencrypt.org`,
`ssl.com` and possibly `sectigo.com`, each as `issue` and `issuewild`.
**To verify against Cloudflare's current
[CAA documentation](https://developers.cloudflare.com/ssl/edge-certificates/caa-records/)**,
which also says Cloudflare may add these automatically for Universal SSL.

Cloudflare → zone → **DNS → Records → Add record → Type CAA**: Name `@`,
Flags `0`, Tag "Only allow specific hostnames", CA domain name `letsencrypt.org`.

**Verify:**

```bash
dig +short CAA barrels.gd @1.1.1.1
```

Then watch the next renewal: `docker logs <project>-proxy-1 2>&1 | grep -i acme`
on the droplet should show no `CAA` errors, and the Vercel domain page should
show a valid certificate.

**Undo:** delete the CAA record(s). Issuance goes back to "any CA".

## 6. Email for `barrels.gd`

### What exists today

| Record | Purpose |
| --- | --- |
| TXT `@` `MS=ms<number>` | Microsoft 365 domain verification |
| MX `@` `ms<number>.msv1.invalid` | Microsoft's placeholder; **receives nothing** |
| TXT `resend._domainkey` | Resend DKIM signing key |
| MX and TXT (SPF) on `send.barrels.gd` | Resend bounce handling and SPF for Resend's envelope sender |
| TXT `_dmarc` `p=none` | DMARC in monitoring mode |

### Why Resend keeps passing when the apex SPF changes

DMARC passes if **either** SPF or DKIM passes **and aligns** with the visible
From domain (`barrels.gd`):

- **DKIM:** Resend signs with `d=barrels.gd` (`resend._domainkey`). That aligns.
- **SPF:** Resend's envelope sender is `send.barrels.gd`, so receivers check
  the SPF record on `send.barrels.gd`, **not** the apex. Under DMARC's default
  relaxed alignment, `send.barrels.gd` and `barrels.gd` share an organizational
  domain, so this aligns too.

So the apex SPF only has to list Microsoft 365. Do **not** add Resend or Amazon
SES to the apex, and do not touch the `send` records.

### Finish Microsoft 365 (inbound and outbound mail)

Prerequisite: an active Microsoft 365 subscription with at least one licensed
mailbox. **Unverified:** that the tenant behind the existing `MS=` record still
exists and is the one you want; if not, start from a new tenant and replace the
`MS=` value with the new one.

1. **Microsoft 365 admin center → Settings → Domains → barrels.gd → Continue
   setup.** Choose **Add your own DNS records**. Microsoft shows the exact values
   for your tenant; copy those, not the examples below.
2. **MX (receive mail).** Delete the `msv1.invalid` MX. Add MX `@` →
   `<tenant-key>.mail.protection.outlook.com`, priority `0`. **Why:** tells the
   world to deliver `@barrels.gd` mail to Microsoft.
3. **Autodiscover.** Add CNAME `autodiscover` → `autodiscover.outlook.com`,
   **DNS only** (grey cloud). **Why:** Outlook and phones find settings
   automatically. A proxied CNAME breaks this.
4. **SPF on the apex.** Add or edit the single TXT `@` record starting with
   `v=spf1` to read exactly:

   ```text
   v=spf1 include:spf.protection.outlook.com -all
   ```

   **Why:** says only Microsoft may send with a `barrels.gd` envelope sender;
   `-all` tells receivers to reject anything else. A domain must have **only one**
   `v=spf1` TXT record; if one exists, replace it.
5. **DKIM for Microsoft 365.** Microsoft Defender portal → **Email &
   collaboration → Policies & rules → Threat policies → Email authentication
   settings → DKIM → barrels.gd**. Add the two CNAMEs it shows
   (`selector1._domainkey` and `selector2._domainkey`), DNS only, then switch
   **Sign messages with DKIM signatures** on. **Unverified:** the portal path and
   CNAME target format change from time to time; copy the targets exactly from
   the portal.
6. Return to **Settings → Domains** and click **Verify**. Status should become
   **Healthy**.

**Verify:**

```bash
dig +short MX barrels.gd @1.1.1.1                 # <tenant-key>.mail.protection.outlook.com
dig +short TXT barrels.gd @1.1.1.1 | grep spf1    # exactly one line
dig +short CNAME autodiscover.barrels.gd @1.1.1.1
dig +short CNAME selector1._domainkey.barrels.gd @1.1.1.1
dig +short TXT resend._domainkey.barrels.gd @1.1.1.1   # still present
```

Then send three test emails:

1. From Gmail **to** your `@barrels.gd` mailbox: it should arrive in Outlook.
2. From Outlook **to** Gmail: in Gmail open **⋮ → Show original**; SPF, DKIM and
   DMARC should each say `PASS`.
3. Trigger an app email that goes through Resend (for example a password reset on
   staging) to Gmail and check **Show original** again: DKIM and DMARC `PASS`.

**Undo:** import your zone export, or put back the old MX
(`ms<number>.msv1.invalid`) and remove the new MX, autodiscover, SPF and DKIM
records. Mail sent to `@barrels.gd` while MX points nowhere bounces.

### DMARC staged rollout for `barrels.gd`

**Why:** DMARC tells receivers what to do with mail that fails SPF and DKIM
alignment, which is how spoofed "from barrels.gd" mail gets blocked. Tighten in
stages so you never block your own mail.

| Stage | When | `_dmarc` TXT value | What to watch before moving on |
| --- | --- | --- | --- |
| 1. Monitor | Now; after Microsoft 365 is live, run at least **2 to 4 weeks** | `v=DMARC1; p=none; rua=mailto:<report address>; fo=1` | Every legitimate sender (Microsoft 365, Resend, anything else you find) shows **pass**. Investigate any unknown source |
| 2. Quarantine | After a clean stage 1 | `v=DMARC1; p=quarantine; pct=25; rua=mailto:<report address>` then `pct=100` after 1 week | No legitimate mail failing; app emails still reach inboxes; no complaints of mail in spam |
| 3. Reject | After **2 to 4 clean weeks** of quarantine at 100% | `v=DMARC1; p=reject; sp=reject; rua=mailto:<report address>` | Keep reading reports monthly |

- **Report address:** Cloudflare → zone → **Email → DMARC Management → Enable**
  gives you a `rua` address and a dashboard, so you do not have to read XML.
  **Unverified:** the exact menu name.
- `pct` is honoured by major receivers but is being removed in the next DMARC
  revision (**unverified** timing); if a checker complains, skip straight to
  `p=quarantine` without `pct`.
- `sp=` sets the policy for subdomains. Before `sp=reject`, confirm nothing sends
  as `<anything>.barrels.gd` other than `send.barrels.gd` (Resend), which passes.
- Set the `_dmarc` record's TTL to 5 minutes during changes so an undo is quick.

**Verify:** `dig +short TXT _dmarc.barrels.gd @1.1.1.1`, and the DMARC
Management dashboard shows reports arriving within 1 to 2 days.

**Undo:** set the value back to the previous stage. Receivers pick it up within
the TTL.

## 7. Lock down domains that send no mail

Use this for `eugine.me` once you confirm it sends and receives no mail, and for
`weather.gd` **only** after GMS confirms nobody uses `@weather.gd` mailboxes.
If unsure, ask first: these records make all mail for the domain bounce.

**Why:** a domain with no mail records can still be forged in phishing email.
These three records tell everyone the domain never sends or receives mail.

| Type | Name | Value | Meaning |
| --- | --- | --- | --- |
| MX | `@` | `.` with priority `0` (written `0 .`) | "Null MX": this domain accepts no mail (RFC 7505) |
| TXT | `@` | `v=spf1 -all` | No server may send as this domain |
| TXT | `_dmarc` | `v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s` | Reject anything claiming to be from it |

Remove any existing MX records first. **Unverified:** whether the Cloudflare
dashboard accepts `.` as an MX target; if it refuses, check Cloudflare's docs
for its "no mail" record option, or leave the null MX out and rely on SPF and
DMARC.

**Verify:**

```bash
dig +short MX eugine.me @1.1.1.1        # 0 .
dig +short TXT eugine.me @1.1.1.1       # "v=spf1 -all"
dig +short TXT _dmarc.eugine.me @1.1.1.1
```

**Undo:** delete the three records (and restore any old MX from your zone export).

## Checklist

| Item | `barrels.gd` | `eugine.me` | `weather.gd` |
| --- | --- | --- | --- |
| Zone exported | ☐ | ☐ | ☐ |
| Registrar 2FA | ☐ | ☐ | ☐ |
| Registrar lock and auto-renew | ☐ | ☐ | ☐ |
| DNSSEC active | ☐ | ☐ | ☐ |
| Wildcards replaced | ☐ | n/a | ☐ (check) |
| CAA | ☐ | ☐ | ☐ |
| Mail: Microsoft 365 finished | ☐ | n/a | n/a |
| DMARC at `reject` | ☐ (staged) | ☐ (lockdown) | ☐ (lockdown or staged) |
| Null MX and `-all` SPF | n/a | ☐ | ☐ (only if no mail) |

## Related

- [Account 2FA checklist](account-2fa-checklist.md)
- [Host hardening](host-hardening.md)
- [Domain configuration record](domain-configuration.md)
