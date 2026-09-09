import Link from "next/link";
export const metadata = { title: "Privacy and site controls" };
export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-bold text-3xl">Privacy and site controls</h1>
      <p>
        You can read the public forecast and bulletin pages without signing in.
        Account access, where offered, uses the shared sign-in service.
      </p>
      <h2 className="font-semibold text-xl">Sharing an update</h2>
      <p>
        The Share update button opens your browser's sharing interface where
        supported, or copies the update and link to your clipboard. The website
        does not automatically publish that content to a social account.
      </p>
      <h2 className="font-semibold text-xl">External websites</h2>
      <p>
        Links to partner services and social platforms take you to sites with
        their own privacy controls. Weather article illustrations may be loaded
        from an external image provider.
      </p>
      <h2 className="font-semibold text-xl">
        Questions about your information
      </h2>
      <p>
        Contact GMS if you have a question about information you have provided,
        an account, or a site feature. Describe the page and the request without
        sending passwords or session details.
      </p>
      <Link className="underline" href="/about/contact">
        Contact GMS
      </Link>
    </article>
  );
}
