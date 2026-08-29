/**
 * Shared SSR building blocks (nav/footer) reused across public pages.
 * Server-rendered Hono JSX, no client framework (D-004).
 */
import type { FC } from 'hono/jsx'

export const SiteHeader: FC = () => (
  <header class="border-b bg-white sticky top-0 z-10">
    <div class="max-w-5xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
      <a href="/" class="text-lg font-bold text-teal-700">خانواده و رسانه</a>
      <nav class="flex items-center gap-4 text-sm">
        <a href="/contents" class="text-gray-700 hover:text-teal-700">محتوای مرجع</a>
        <a href="/login" class="bg-teal-700 text-white px-4 py-2 rounded-lg hover:bg-teal-800">ورود</a>
      </nav>
    </div>
  </header>
)

export const SiteFooter: FC = () => (
  <footer class="border-t bg-white mt-16">
    <div class="max-w-5xl mx-auto px-4 md:px-6 py-8 text-sm text-gray-500 text-center">
      © خانواده و رسانه — پلتفرم سواد رسانه‌ای برای والدین و مربیان
    </div>
  </footer>
)
