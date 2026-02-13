import Image from "next/image";

export default function ThreeColumnImageGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      <div>
        <Image
          alt=" grid"
          className="w-full rounded-xl border border-gray-200 dark:border-gray-800"
          height={192}
          src="/images/grid-image/image-04.png"
          width={338}
        />
      </div>

      <div>
        <Image
          alt=" grid"
          className="w-full rounded-xl border border-gray-200 dark:border-gray-800"
          height={192}
          src="/images/grid-image/image-05.png"
          width={338}
        />
      </div>

      <div>
        <Image
          alt=" grid"
          className="w-full rounded-xl border border-gray-200 dark:border-gray-800"
          height={192}
          src="/images/grid-image/image-06.png"
          width={338}
        />
      </div>
    </div>
  );
}
