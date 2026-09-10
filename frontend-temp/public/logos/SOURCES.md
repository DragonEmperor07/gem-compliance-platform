# Portal logo sources

Marks shown in the "queried automatically" strip on the landing page. Each is used **nominatively**
— to identify the government portal Pramaan integrates with — not as a claim of endorsement,
affiliation or approval by any of these bodies.

| File | Portal | Source | Notes |
|---|---|---|---|
| `udyam.png` | Ministry of MSME / Udyam | `udyamregistration.gov.in/assets/img/msmelogo.png` | Ministry lockup (emblem + wordmark) |
| `pan.png` | Income Tax Department | Wikimedia Commons, `Logo_of_Income_Tax_Department_India.png` | **Public domain** |
| `mca21.svg` | Ministry of Corporate Affairs | Wikimedia Commons, `Ministry_of_Corporate_Affairs_India.svg` | **CC BY-SA 4.0** — attribution + share-alike apply |
| `epfo.png` | EPFO | `epfindia.gov.in` (WordPress CDN) | Official emblem |
| `esic.png` | ESIC | `esic.gov.in/images/esic-logo.png` | Official lockup |
| `startup.png` | Startup India | `startupindia.gov.in` | `#startupindia` wordmark |
| `nsic.png` | NSIC | `nsic.co.in/images/newNS.png` | Official logo |
| `digilocker.png` | DigiLocker | `cdn.digilocker.gov.in` (app icon) | Official app mark |
| `makeinindia.png` | Make in India | `makeinindia.com/sites/default/files/mii.png` | Lion mark |
| `gem.svg` | GeM | `gem.gov.in/resources/images/gem-new-logo-v6.svg` | Official logo |

## Drawn fallbacks (no logo file)

Two entries render a hand-drawn SVG glyph from the `portals` array in `index.astro` instead:

- **GSTN** — `gst.gov.in` blocks direct asset requests and Commons has no free GST logo. Uses a
  rupee glyph.
- **Blacklisting & debarment** — not an organisation, so it has no logo. Uses a "banned" glyph.

To add either later, drop the file in this folder and change that entry from `c` + `icon` to
`logo: '<filename>'`. The chip renders an `<img>` whenever `logo` is set.

## Things to know

- All rasters were trimmed and downscaled to a 128–160px box (Pillow, LANCZOS) and saved as
  optimised PNG with transparency preserved. Displayed in a fixed **54×26** box with
  `object-fit: contain`, so mixed aspect ratios never distort.
- **The bare State Emblem of India is deliberately not used anywhere.** An early crop of the MSME
  lockup reduced it to the bare emblem; that was reverted. Its use is restricted by the State Emblem
  of India (Prohibition of Improper Use) Act, 2005, and it identifies no specific portal.
- If the project needs to be strictly clearance-safe, revert every chip to the drawn glyphs — they
  are still in git history and the fallback path in the component already supports them.
