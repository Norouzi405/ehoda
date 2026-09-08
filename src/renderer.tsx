import { jsxRenderer } from 'hono/jsx-renderer'

/**
 * Base HTML layout for all server-rendered (SSR) pages. Persian/RTL by
 * default (client spec: fully Persian, RTL-first product). Uses CDN
 * Tailwind + Vazirmatn per project conventions (no separate frontend
 * build pipeline — D-004: server-rendered Hono JSX, not a SPA).
 */
export const renderer = jsxRenderer(({ children, title }) => {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ? `${title} — خانواده و رسانه` : 'خانواده و رسانه'}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>{`
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  teal: {
                    50: '#eef5f5', 100: '#d7e8e9', 200: '#b0d1d3', 300: '#84b6b9',
                    400: '#5a9a9e', 500: '#3d8084', 600: '#2c666a',
                    700: '#1f5257', 800: '#0F4C5C', 900: '#0a3540',
                  },
                },
                fontFamily: {
                  sans: ['Vazirmatn', 'Tahoma', 'Arial', 'sans-serif'],
                  display: ['Baloo Bhaijaan 2', 'Vazirmatn', 'Tahoma', 'sans-serif'],
                },
              },
            },
          }
        `}</script>
        {/*
          Font fix: the previous rastikerdar/vazirmatn jsDelivr @font-face link
          returned 404 (repo restructured) and silently fell back to Arial —
          this is why the whole site looked "system-default" instead of Persian.
          Now loaded from Google Fonts' official, CDN-mirrored, always-on
          endpoint: Vazirmatn for body text, Baloo Bhaijaan 2 (a warm, rounded
          Persian display face) for headings/logo — matches the calming,
          family-friendly art direction.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&family=Baloo+Bhaijaan+2:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
        <link href="/static/style.css" rel="stylesheet" />
      </head>
      <body class="bg-stone-50 text-stone-800 font-sans">
        {children}
      </body>
    </html>
  )
})

declare module 'hono' {
  interface ContextRenderer {
    (content: string | Promise<string>, props?: { title?: string }): Response | Promise<Response>
  }
}
