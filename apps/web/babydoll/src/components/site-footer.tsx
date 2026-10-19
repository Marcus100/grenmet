import Image from "next/image";
import Link from "next/link";
import { BUSINESS, NAV, SOCIALS } from "@/data/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div>
          <Link aria-label={`${BUSINESS.name} home`} className="brand" href="/">
            <Image alt="" height={42} src="/logo.jpg" width={42} />
            <span>{BUSINESS.name}</span>
          </Link>
          <address className="footer-address">
            {BUSINESS.address[0]}, {BUSINESS.address[1]}
            <br />
            {BUSINESS.address[2]}
          </address>
          <span className="appt">{BUSINESS.appointmentOnly}</span>
        </div>
        <div>
          <h2 className="footer-heading">Explore</h2>
          <nav aria-label="Footer" className="footer-links">
            {NAV.slice(1).map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div>
          <h2 className="footer-heading">Follow</h2>
          <nav aria-label="Social" className="footer-links">
            {SOCIALS.map((social) => (
              <a
                href={social.href}
                key={social.name}
                rel="noopener"
                target="_blank"
              >
                {social.name}
              </a>
            ))}
          </nav>
        </div>
        <div className="legal">
          <span>© 2026 {BUSINESS.legalName} · Grenada</span>
          <span>
            Website by <a href="https://barrels.gd/">Barrels Grenada</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
