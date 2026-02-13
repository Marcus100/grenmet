import type React from "react";

type AspectRatio = "16:9" | "4:3" | "21:9" | "1:1";

interface YouTubeEmbedProps {
  videoId: string;
  aspectRatio?: AspectRatio;
  title?: string;
  className?: string;
}

const YouTubeEmbed: React.FC<YouTubeEmbedProps> = ({
  videoId,
  aspectRatio = "16:9",
  title = "YouTube video",
  className = "",
}) => {
  const aspectRatioClass = {
    "16:9": "aspect-video",
    "4:3": "aspect-4/3",
    "21:9": "aspect-21/9",
    "1:1": "aspect-square",
  }[aspectRatio];

  return (
    <div
      className={`overflow-hidden rounded-lg ${aspectRatioClass} ${className}`}
    >
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
        frameBorder="0"
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title}
      />
    </div>
  );
};

export default YouTubeEmbed;
