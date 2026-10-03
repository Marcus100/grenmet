/**
 * Openly licensed photographs, with the credit shown under each one.
 * Archive images of places: a caption never implies a photo documents the
 * story beside it. Files and licences: `public/images/CREDITS.md`.
 */
export interface Photo {
  alt: string;
  caption: string;
  credit: string;
  /** Licence name and link; "Public domain" has no link. */
  licence: { label: string; url?: string };
  /** The Wikimedia Commons file page. */
  source: string;
  src: string;
}

const BY_SA_4 = {
  label: "CC BY-SA 4.0",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
};

export const PHOTOS = {
  parliament: {
    src: "/images/parliament.webp",
    alt: "The Parliament of Grenada building",
    caption: "The Parliament of Grenada, March 2021. Archive photo.",
    credit: "ZJREYN",
    licence: BY_SA_4,
    source: "https://commons.wikimedia.org/wiki/File:Parliament_of_Grenada.jpg",
  },
  carenage1906: {
    src: "/images/carenage1906.webp",
    alt: "Postcard of ships at anchor in the Carenage, St. George’s",
    caption: "The Carenage, St. George’s, about 1906.",
    credit: "West Indian View Postcard, Series VII",
    licence: { label: "Public domain" },
    source:
      "https://commons.wikimedia.org/wiki/File:Grenada_-_The_Carenage.jpg",
  },
  grandetang: {
    src: "/images/grandetang.webp",
    alt: "Grand Etang Lake beyond red ginger lilies and rainforest",
    caption: "Grand Etang Lake, January 2020.",
    credit: "Jerzy Bereszko",
    licence: BY_SA_4,
    source: "https://commons.wikimedia.org/wiki/File:Grand_Etang_Lake.jpg",
  },
  hillsborough: {
    src: "/images/hillsborough.webp",
    alt: "Sunset over Hillsborough Bay, Carriacou, with yachts at anchor",
    caption: "Hillsborough Bay, Carriacou, December 2015.",
    credit: "Deeferdiving",
    licence: BY_SA_4,
    source:
      "https://commons.wikimedia.org/wiki/File:Hillsborough_Bay,_Carriacou.jpeg",
  },
} satisfies Record<string, Photo>;

export type PhotoId = keyof typeof PHOTOS;

/**
 * A place photo per constituency, only where we know where it was taken and
 * that it lies in that constituency. Others keep the plain page head.
 */
export const CONSTITUENCY_PHOTOS: Partial<Record<string, PhotoId>> = {
  A: "hillsborough",
};
