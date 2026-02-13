import Image from "next/image";
import Link from "next/link";
import GridShape from "@/components/common/GridShape";

export default function NotFound() {
  return (
    <div className="relative z-1 flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
      <GridShape />
      <div className="mx-auto w-full max-w-[242px] text-center sm:max-w-[472px]">
        <h1 className="mb-8 font-bold text-gray-800 text-title-md xl:text-title-2xl dark:text-white/90">
          ERROR
        </h1>

        <Image
          alt="404"
          className="dark:hidden"
          height={152}
          src="/images/error/404.svg"
          width={472}
        />
        <Image
          alt="404"
          className="hidden dark:block"
          height={152}
          src="/images/error/404-dark.svg"
          width={472}
        />

        <p className="mt-10 mb-6 text-base text-gray-700 sm:text-lg dark:text-gray-400">
          We can’t seem to find the page you are looking for!
        </p>

        <Link
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3.5 font-medium text-gray-700 text-sm shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
          href="/"
        >
          Back to Home Page
        </Link>
      </div>
      {/* <!-- Footer --> */}
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-gray-500 text-sm dark:text-gray-400">
        &copy; {new Date().getFullYear()} - TailAdmin
      </p>
    </div>
  );
}
