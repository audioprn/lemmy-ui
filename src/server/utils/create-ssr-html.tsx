import { getStaticDir } from "@utils/env";
import { renderToString } from "inferno-server";
import serialize from "serialize-javascript";
import sharp from "sharp";
import { favIconPngUrl, favIconUrl } from "@utils/config";
import { IsoDataOptionalSite } from "@utils/types";
import { fetchIconPng } from "./fetch-icon-png";
import { findLanguageChunkNames } from "@services/I18NextService";
import path from "path";
import { readFileSync, existsSync } from "node:fs";
import { enableEruda } from "./dev-env";
import { ServerUnhead } from "unhead/server";

const customHtmlHeader = process.env["LEMMY_UI_CUSTOM_HTML_HEADER"] || "";

let appleTouchIcon: string | undefined = undefined;

function readEmbeddedScript() {
  const scriptFile = "./dist/js/embedded.js";
  const embeddedScript = readFileSync(path.resolve(scriptFile)).toString();
  if (existsSync(scriptFile + ".map")) {
    return `${embeddedScript}\n//# sourceMappingURL=${getStaticDir()}/js/embedded.js.map`;
  }
  return embeddedScript;
}

let embeddedScript = readEmbeddedScript();

export async function createSsrHtml(
  root: string,
  head: ServerUnhead,
  isoData: IsoDataOptionalSite,
  cspNonce: string,
  languages: readonly string[],
  interfaceLanguage?: string,
) {
  const site = isoData.siteRes;

  if (process.env["NODE_ENV"] === "development") {
    embeddedScript = readEmbeddedScript();
  }

  const customHtmlHeaderScriptTag = new RegExp("<script", "g");

  const customHtmlHeaderWithNonce = customHtmlHeader.replace(
    customHtmlHeaderScriptTag,
    `<script nonce="${cspNonce}"`,
  );

  if (!appleTouchIcon) {
    try {
      appleTouchIcon = site?.site_view.site.icon
        ? `data:image/png;base64,${await sharp(
            await fetchIconPng(site.site_view.site.icon),
          )
            .resize(180, 180)
            .extend({
              bottom: 20,
              top: 20,
              left: 20,
              right: 20,
              background: "#222222",
            })
            .png()
            .toBuffer()
            .then(buf => buf.toString("base64"))}`
        : favIconPngUrl;
    } catch {
      console.warn(
        "Could not fetch site logo for apple touch icon. Using default icon.",
      );
      appleTouchIcon = favIconPngUrl;
    }
  }

  const erudaStr = enableEruda
    ? renderToString(
        <>
          <script
            nonce={cspNonce}
            src="https://cdn.jsdelivr.net/npm/eruda/eruda.js"
          ></script>
          <script nonce={cspNonce}>eruda.init();</script>
        </>,
      )
    : "";

  const lazyScripts = findLanguageChunkNames(languages, interfaceLanguage)
    .filter(x => x !== undefined)
    .map(x => `${getStaticDir()}/js/${x}.client.js`)
    .map(x => `<link rel="preload" as="script" href="${x}" />`)
    .join("");

  const headPayload = head.render();

  return `
    <!DOCTYPE html>
    <html ${headPayload.htmlAttrs}>
    <head>
    <script nonce="${cspNonce}">
    window.isoData = ${serialize(isoData)};

    ${embeddedScript}
    </script>
    ${lazyScripts}
  
    <!-- A remote debugging utility for mobile -->
    ${erudaStr}
  
    <!-- Custom injected script -->
    ${customHtmlHeaderWithNonce}
  
    ${headPayload.headTags}
  
    <style nonce="${cspNonce}">
    #app[data-adult-consent] {
      filter: blur(10px);
      -webkit-filter: blur(10px);
      -moz-filter: blur(10px);
      -o-filter: blur(10px);
      -ms-filter: blur(10px);
      pointer-events: none;
    }
    </style>

    <!-- Required meta tags -->
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <link
       id="favicon"
       rel="shortcut icon"
       type="image/x-icon"
       href=${site?.site_view.site.icon ?? favIconUrl}
     />
  
    <!-- Web app manifest -->
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="${appleTouchIcon}" />
    <link rel="apple-touch-startup-image" href="${appleTouchIcon}" />
  
    <!-- Styles -->
    <link rel="stylesheet" type="text/css" href="${getStaticDir()}/styles/styles.css" />
    <!-- audioprn: emoji in one colour (Noto Emoji, OFL licence in assets/fonts), only for emoji
         characters, so letters and digits keep the site font. Used in main.css. -->
    <style>
      @font-face {
        font-family: "audioprn emoji";
        src: url("${getStaticDir()}/assets/fonts/NotoEmoji.ttf") format("truetype");
        font-weight: 300 700;
        font-display: swap;
        /* Not arrows, ™ or shapes like ▶ ▪: Noto draws those as tiles, and they're used as text. */
        unicode-range: U+200D, U+203C, U+2049, U+231A-231B, U+2328, U+23CF, U+23E9-23F3,
          U+23F8-23FA, U+2600-27BF, U+2B1B-2B1C, U+2B50, U+2B55, U+3030, U+303D, U+3297,
          U+3299, U+FE0F, U+1F000-1FAFF, U+E0020-E007F;
      }
    </style>

    </head>
  
    <body ${headPayload.bodyAttrs}>
      <noscript>
        <div class="alert alert-danger rounded-0" role="alert">
          <b>Javascript is disabled. Actions will not work.</b>
        </div>
      </noscript>
  
      <div id='root'>${root}</div>
      <script defer src='${getStaticDir()}/js/client.js'></script>
    </body>
  </html>
  `;
}
