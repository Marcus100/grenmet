import Image from "next/image";

export default function ResponsiveImage() {
  return (
    <div className="relative">
      <div className="overflow-hidden">
        <Image
          alt="Cover"
          className="w-full rounded-xl border border-border"
          height={600}
          src="/images/grid-image/image-01.png"
          width={1054}
        />
      </div>
    </div>
  );
}
