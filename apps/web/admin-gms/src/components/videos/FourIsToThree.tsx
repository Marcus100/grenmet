export default function FourIsToThree() {
  return (
    <div className="aspect-4/3 overflow-hidden rounded-lg">
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
        frameBorder="0"
        src="https://www.youtube.com/embed/dQw4w9WgXcQ"
        title="YouTube video"
      />
    </div>
  );
}
