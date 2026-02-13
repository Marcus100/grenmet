import Image from "next/image";

export default function GridShape() {
  return (
    <>
      <div className="absolute top-0 right-0 -z-1 w-full max-w-[250px] xl:max-w-[450px]">
        <Image
          alt="grid"
          height={254}
          src="/images/shape/grid-01.svg"
          width={540}
        />
      </div>
      <div className="absolute bottom-0 left-0 -z-1 w-full max-w-[250px] rotate-180 xl:max-w-[450px]">
        <Image
          alt="grid"
          height={254}
          src="/images/shape/grid-01.svg"
          width={540}
        />
      </div>
    </>
  );
}
