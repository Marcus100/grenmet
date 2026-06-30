import Image from "next/image";

export default function TwoColumnImageGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <div>
        <Image
          alt=" grid"
          className="w-full rounded-xl border border-border"
          height={295}
          src="/images/grid-image/image-02.png"
          width={517}
        />
      </div>

      <div>
        <Image
          alt=" grid"
          className="w-full rounded-xl border border-border"
          height={295}
          src="/images/grid-image/image-03.png"
          width={517}
        />
      </div>
    </div>
  );
}
