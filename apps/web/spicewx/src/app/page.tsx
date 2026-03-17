import Image from "next/image";

export default function Home() {
  return (
    <main className="">
      <div className="">
        <h1 className="sr-only">Page title</h1>
        {/* Main 3 column grid */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3 lg:gap-8">
          {/* Left column */}
          <div className="grid grid-cols-1 gap-4 lg:col-span-2">
            <section aria-labelledby="section-1-title">
              <h2 id="section-1-title" className="sr-only">
                Section title
              </h2>
              <div className="overflow-hidden rounded-lg bg-white shadow-sm dark:bg-gray-800 dark:shadow-none dark:outline dark:-outline-offset-1 dark:outline-white/10">
                <div className="p-6">{/* Your content */}</div>
              </div>
            </section>
          </div>

          {/* Right column */}
          <div className="grid grid-cols-1 gap-4">
            <section aria-labelledby="section-2-title">
              <h2 id="section-2-title" className="sr-only">
                Section title
              </h2>
              <div className="overflow-hidden rounded-lg bg-white shadow-sm dark:bg-gray-800 dark:shadow-none dark:inset-ring dark:inset-ring-white/10">
                <div className="p-6">{/* Your content */}</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
