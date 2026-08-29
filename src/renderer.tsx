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
        <link
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Farsi-Digits/font-face.css"
          rel="stylesheet"
        />
        <link href="/static/style.css" rel="stylesheet" />
      </head>
      <body class="bg-gray-50 text-gray-900" style="font-family: Vazirmatn, Arial, sans-serif;">
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
