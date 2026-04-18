import { type PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ar" translate="no" className="notranslate">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="google" content="notranslate" />
        <meta name="google" translate="no" />
        <meta httpEquiv="Content-Language" content="ar" />
        <title>music&amp;sk</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                translate: no;
                -webkit-touch-callout: none;
              }
              * {
                user-select: none !important;
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                -webkit-tap-highlight-color: transparent;
              }
              input, textarea, [contenteditable] {
                user-select: none !important;
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
              }
              ::selection { background: transparent; }
              ::-moz-selection { background: transparent; }
              body { overflow: hidden; }
              #root { overflow: auto; height: 100dvh; }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
