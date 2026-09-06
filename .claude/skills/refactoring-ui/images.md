# Images

## Bad photos ruin good designs

There is no styling fix. Either commission a professional or use good stock photography. Never design against placeholders intending to swap in phone snaps later — it never works.

## Text over images needs consistent contrast

When no text colour works over a hero image, the image is the problem, not the text: photos have bright and dark regions, so light text disappears in the highlights and dark text in the shadows. Reduce the image's dynamic range. Four techniques, combinable:

- **Semi-transparent overlay.** Black tones down highlights for light text; white lifts shadows for dark text. Simple, but it affects the whole image rather than the problem areas.
- **Lower the image contrast.** More control than an overlay. Adjust brightness afterwards to compensate for the shift in overall lightness.
- **Colourise.** Lower contrast, desaturate, then apply a solid fill in `multiply`. Also a good way to make stock photography sit with brand colours.
- **Text shadow.** Preserves the most dynamic range, adding contrast only where the text is. Use a large blur with **no offset** so it reads as a glow, not a shadow. Pairs well with a milder contrast reduction.

## Everything has an intended size

Scaling bitmaps up is the obvious mistake. The non-obvious ones:

- **Do not scale icons up.** A 16–24px icon blown to 3–4× is vector-sharp but detail-poor and disproportionately chunky. If small icons are all you have, put the icon at its intended size inside a larger shape with a background colour — that fills the space without stretching the artwork.
- **Do not scale icons down** either. Icons drawn large go mushy when shrunk. Favicons are the extreme case: redraw a simplified mark at 16px rather than letting the browser downsample a 128px logo.
- **Do not shrink screenshots.** A full-size screenshot at 70% turns 16px app text into 4px noise. Instead: capture at a smaller viewport (tablet) and give it room; crop to a meaningful portion; or draw a simplified UI with small text replaced by lines, which communicates the layout without inviting people to squint.

## User-uploaded content

You control none of the framing, colour or contrast, so control the container.

- **Fix the shape and size.** Let intrinsic aspect ratios through and they wreck the layout, especially in a grid. Centre the image in a fixed container and crop the overflow — `background-size: cover`, or `object-cover` on an `img`.
- **Prevent background bleed.** When an upload's background matches your UI's, the image loses its edge. A border usually clashes with the image's own colours; a **subtle inner box shadow** solves it almost invisibly. A semi-transparent inner border works too if you dislike the slight inset look.
