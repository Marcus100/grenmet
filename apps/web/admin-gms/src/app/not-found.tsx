import Image from "next/image";
import Link from "next/link";
import GridShape from "@/components/common/GridShape";

export default function NotFound() {
  return (
    <div className="relative z-1 flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
      <GridShape />
      <div className="mx-auto w-full max-w-[242px] text-center sm:max-w-[472px]">
        <h1 className="mb-8 font-bold text-foreground text-title-md xl:text-title-2xl">
          ERROR
        </h1>

        <Image alt="404" height={152} src="/images/error/404.svg" width={472} />

        <p className="mt-10 mb-6 text-base text-gray-700 sm:text-lg">
          We can’t seem to find the page you are looking for!
        </p>

        <Link
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-background px-5 py-3.5 font-medium text-gray-700 text-sm shadow-gm-card hover:bg-gray-50 hover:text-foreground"
          href="/"
        >
          Back to Home Page
        </Link>
      </div>
      {/* <!-- Footer --> */}
      <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-muted-foreground text-sm">
        &copy; {new Date().getFullYear()} - TailAdmin
      </p>
    </div>
  );
}
