<script lang="ts">
  // Public credits page. Like /welcome it sits in the (auth) group, which has
  // no session guard, so it opens before anyone has signed in.

  import nehSeal from '$lib/assets/neh-preferred-seal-white.png';
  import amplUcsb from '$lib/assets/ampl-ucsb-white.png';
  import utHistory from '$lib/assets/ut-history.svg';
  import burdick from '$lib/assets/burdick.png';
  import neogranadina from '$lib/assets/neogranadina-white.png';
  // Encodes https://ampl.clair.ucsb.edu/project/digitization-toolkit, dark
  // modules #131110 on white, error correction M, quiet zone of 4 modules.
  // Regenerate with: npx qrcode@1.5.4 -t svg -e M -q 4 -d '#131110' -l '#ffffff' -o <file> <url>
  import qr from '$lib/assets/qr-digitization-toolkit.svg';

  // The credit text is English whatever the interface language, like the
  // start labels on /welcome. Logos that are not white already are inverted
  // by `dark` so all five read the same on the dark ground.
  const LOGOS: { src: string; alt: string; width: number; dark: boolean }[] = [
    { src: nehSeal, alt: 'National Endowment for the Humanities', width: 150, dark: false },
    { src: amplUcsb, alt: 'AMPL, University of California, Santa Barbara', width: 110, dark: false },
    { src: utHistory, alt: 'Department of History, University of Texas at Austin', width: 160, dark: true },
    { src: burdick, alt: 'Burdick Global Scholars Program', width: 110, dark: true },
    { src: neogranadina, alt: 'Neogranadina', width: 140, dark: false },
  ];

  // The unit is offline and its kiosk has no address bar or back button, so
  // the project page is offered as a QR code for a visitor's phone instead of
  // a link.
</script>

<div class="page">
  <div class="top">
    <h1>Credits<span lang="es" class="es"> / Créditos</span></h1>
    <a href="/welcome" class="btn">Back / <span lang="es">Volver</span></a>
  </div>

  <div class="main">
    <div class="body" lang="en">
      <p>
        Captua is developed by Adelaida Ávila, Juan Cobo Betancourt (grant PI), Jairo Melo Flórez, Santiago Muñoz Arbeláez (grant co-PI), Lucrezia Pograri, and Catalina Salguero at the Archives, Memory, and Preservation Lab of the University of California, Santa Barbara and at the University of Texas at Austin.
      </p>
      <p>
        Captua has been made possible in part by a major grant from the National Endowment for the Humanities: Democracy demands wisdom. (NEH Award HAA-304052-25: "Digitization Toolkit: a Blueprint for Egalitarian Access to Technology in Low-Resource Environments".)
      </p>
      <p class="muted">
        Any views, findings, conclusions, or recommendations expressed in this software do not necessarily represent those of the National Endowment for the Humanities.
      </p>
    </div>

    <figure class="scan" lang="en">
      <img class="qr" src={qr} alt="QR code for the Digitization Toolkit project page on the AMPL website" />
      <figcaption>Scan to learn more about the project on the AMPL website</figcaption>
    </figure>
  </div>

  <div class="logos">
    {#each LOGOS as logo (logo.alt)}
      <div class="logo-box" style:width="calc({logo.width} * var(--u))">
        <img src={logo.src} alt={logo.alt} class:invert={logo.dark} />
      </div>
    {/each}
  </div>
</div>

<style>
  /* The page is laid out for the unit's 800×480 screen and scales as a whole
     on a larger one: --u is 1px at 800×480 and grows with whichever of the
     width or height is the tighter fit, never below 1px. */
  .page {
    --u: max(1px, min(0.125vw, 0.20833vh));
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    height: 100vh;
    padding: calc(24 * var(--u)) calc(40 * var(--u));
    background-color: var(--color-bg);
    font-family: var(--font-family);
    color: var(--color-light);
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: calc(16 * var(--u));
  }

  h1 { margin: 0; font-size: calc(28 * var(--u)); font-weight: var(--fw-bold); }
  .es { color: var(--color-light-grey); }

  /* Text on the left, capped so the lines stay readable, and the QR code
     beside it. ch follows the scaled size set here. */
  .main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 68ch) auto;
    justify-content: start;
    gap: calc(40 * var(--u));
    align-items: start;
    font-size: calc(16 * var(--u));
  }

  .body {
    min-height: 0;
    max-height: 100%;
    overflow-y: auto;
    line-height: 1.5;
  }
  /* app.css sets a size on every p, so the paragraphs take it explicitly. */
  .body p { margin: 0 0 calc(12 * var(--u)); font-size: calc(16 * var(--u)); }
  .body .muted { color: var(--color-light-grey); }

  .scan {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(10 * var(--u));
    width: calc(180 * var(--u));
    margin: 0;
  }
  .qr { width: calc(180 * var(--u)); height: calc(180 * var(--u)); border-radius: calc(8 * var(--u)); }
  .scan figcaption {
    text-align: center;
    font-size: calc(12 * var(--u));
    line-height: 1.4;
    color: var(--color-light-grey);
  }

  .logos {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: calc(16 * var(--u));
    border-top: 1px solid var(--border-color);
  }

  .logo-box { height: calc(64 * var(--u)); flex: none; }
  .logo-box img { width: 100%; height: 100%; object-fit: contain; }
  .invert { filter: brightness(0) invert(1); }

  .btn {
    display: inline-flex;
    align-items: center;
    font-size: calc(16 * var(--u));
    font-weight: var(--fw-semibold);
    color: var(--color-secondary);
    text-decoration: none;
    border: 1.5px solid var(--color-secondary);
    border-radius: calc(8 * var(--u));
    padding: calc(10 * var(--u)) calc(24 * var(--u));
    min-height: calc(44 * var(--u));
    box-sizing: border-box;
    transition: background-color var(--transition-base);
  }
  .btn { background: none; font-family: inherit; cursor: pointer; }
  .btn:hover { background-color: rgba(150,177,240,0.1); }
</style>
