export default function SidebarWidget() {
  return (
    <div
      className={
        "mx-auto mb-10 w-full max-w-60 rounded-2xl bg-gray-50 px-4 py-5 text-center dark:bg-white/[0.03]"
      }
    >
      <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
        #1 Tailwind CSS Dashboard
      </h3>
      <p className="mb-4 text-gray-500 text-theme-sm dark:text-gray-400">
        Leading Tailwind CSS Admin Template with 400+ UI Component and Pages.
      </p>
      <a
        className="flex items-center justify-center rounded-lg bg-brand-500 p-3 font-medium text-theme-sm text-white hover:bg-brand-600"
        href="https://tailadmin.com/pricing"
        rel="noopener nofollow"
        target="_blank"
      >
        Upgrade To Pro
      </a>
    </div>
  );
}
