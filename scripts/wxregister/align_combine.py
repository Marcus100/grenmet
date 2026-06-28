"""Align the left (Sections 0/1) and right (Section 3) halves of a synoptic
register sheet so their data rows line up, then composite side by side.

Generic for any front/back scan pair from this weather register:

    python align_combine.py <front.png> <back.png> <out.png>

The two halves are the same physical sheet, so their ruled data rows must
share a row spacing. We estimate each half's row pitch by autocorrelation,
uniformly scale the back half by the pitch ratio (preserving its aspect
ratio), then solve a fine vertical shift by cross-correlating the row-darkness
profiles over the table body only (header/footer text excluded)."""
import sys
import numpy as np
from PIL import Image

# Vertical fraction of each scan occupied by the ruled data-table body. The
# header (section titles, column numbers) and footer (evaporation / max-min
# blocks) sit outside this band and would otherwise skew the correlation.
BODY = (0.16, 0.80)
GAP = 14  # white gutter between the two halves, px


def dark_profile(im_gray, lo=0.12, hi=0.88, body=None):
    """Row darkness profile. If ``body=(a,b)`` (fractions), the profile is
    zeroed outside that vertical band so header/footer text can't dominate
    the cross-correlation."""
    h, w = im_gray.shape
    band = im_gray[:, int(w * lo):int(w * hi)]
    d = (255 - band).mean(axis=1) / 255.0
    d = d - d.mean()
    if body is not None:
        mask = np.zeros(h)
        mask[int(h * body[0]):int(h * body[1])] = 1.0
        d = d * mask
    return d


def row_pitch(d, lo=15, hi=33):
    """Dominant table-row pitch (px) via autocorrelation of a body profile."""
    ac = np.correlate(d, d, 'full')[len(d) - 1:]
    return lo + int(np.argmax(ac[lo:hi]))


def best_shift(dL, dR2, tmax=45):
    """Best vertical shift t aligning already-scaled right profile to left.

    The two halves are the same sheet scanned the same way, so corresponding
    rows sit at nearly the same absolute height — the true shift is small.
    Restricting |t| <= tmax prevents the periodic row grid from aliasing onto
    a solution a whole header-block away (every line would still 'match' one
    row over, but the wrong one)."""
    nL = len(dL)
    best = (-2.0, 0)
    for t in range(-tmax, tmax + 1, 1):
        a0, a1 = max(0, t), min(nL, t + len(dR2))
        if a1 - a0 < nL * 0.45:
            continue
        segL, segR = dL[a0:a1], dR2[a0 - t:a1 - t]
        sL, sR = segL.std(), segR.std()
        if sL < 1e-6 or sR < 1e-6:
            continue
        c = float((segL * segR).mean() / (sL * sR))
        if c > best[0]:
            best = (c, t)
    return best  # corr, shift


def main(front_p, back_p, out_p):
    front = Image.open(front_p).convert('RGBA')
    back = Image.open(back_p).convert('RGBA')
    gL = np.asarray(front.convert('L')).astype(float)
    gR = np.asarray(back.convert('L')).astype(float)
    # restrict to the ruled table body, excluding header + footer text
    dL = dark_profile(gL, body=BODY)
    dR = dark_profile(gR, body=BODY)

    # Uniform scale from the row-pitch ratio so the two halves share a row
    # spacing while the right page keeps its own aspect ratio.
    pL, pR = row_pitch(dL[dL != 0]), row_pitch(dR[dR != 0])
    s = pL / pR
    new_w = int(round(back.width * s))
    new_h = int(round(back.height * s))
    back_s = back.resize((new_w, new_h), Image.LANCZOS)

    # Fine vertical shift on the scaled right profile.
    gRs = np.asarray(back_s.convert('L')).astype(float)
    dRs = dark_profile(gRs, body=BODY)
    corr, t = best_shift(dL, dRs)
    print(f'pitch L={pL} R={pR} scale={s:.4f} shift={t} corr={corr:.3f}')

    # canvas tall enough for both at their offsets (left at y=0, right at y=t)
    top = min(0, t)
    bottom = max(front.height, t + new_h)
    H = bottom - top
    W = front.width + GAP + back_s.width
    canvas = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    canvas.paste(front, (0, 0 - top), front)
    canvas.paste(back_s, (front.width + GAP, t - top), back_s)
    canvas.convert('RGB').save(out_p, 'PNG')
    print(f'wrote {out_p} {canvas.size}')


if __name__ == '__main__':
    if len(sys.argv) != 4:
        sys.exit('usage: python align_combine.py <front.png> <back.png> <out.png>')
    main(*sys.argv[1:4])
