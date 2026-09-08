/**
 * Shared SSR building blocks (nav/footer) reused across public pages.
 * Server-rendered Hono JSX, no client framework (D-004).
 *
 * Visual language (Phase 2 design overhaul): warm ivory background,
 * deep-teal primary + burnt-amber accent, soft rounded cards, glass header.
 */
import type { FC } from 'hono/jsx'

export const SiteHeader: FC = () => (
  <header class="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-stone-200">
    <div class="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 group">
        <span class="w-9 h-9 rounded-xl bg-teal-800 text-amber-300 flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
          <i class="fas fa-heart text-sm"></i>
        </span>
        <span class="text-lg font-display font-extrabold text-teal-900 tracking-tight">
          خانواده و رسانه
        </span>
      </a>

      <nav class="hidden md:flex items-center gap-1 text-sm">
        <a href="/contents" class="px-3 py-2 rounded-full text-stone-600 hover:text-teal-800 hover:bg-stone-100 transition-colors">
          محتوای مرجع
        </a>
        <a href="/porseshkadeh" class="px-3 py-2 rounded-full text-stone-600 hover:text-teal-800 hover:bg-stone-100 transition-colors">
          پرسش‌کده
        </a>
      </nav>

      <div class="flex items-center gap-2">
        <a
          href="/porseshkadeh"
          class="md:hidden text-stone-500 hover:text-teal-800 px-2 py-2 rounded-full hover:bg-stone-100"
          aria-label="پرسش‌کده"
        >
          <i class="fas fa-comments"></i>
        </a>
        <a
          href="/login"
          class="bg-teal-800 hover:bg-teal-900 text-white rounded-full px-5 py-2 text-sm font-bold shadow-sm hover:shadow transition-all"
        >
          ورود
        </a>
      </div>
    </div>
  </header>
)

export const SiteFooter: FC = () => (
  <footer class="border-t border-stone-200 bg-white/60 mt-16">
    <div class="max-w-6xl mx-auto px-4 md:px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-2 text-stone-500">
        <span class="w-7 h-7 rounded-lg bg-teal-800/10 text-teal-800 flex items-center justify-center">
          <i class="fas fa-heart text-xs"></i>
        </span>
        <span class="text-sm">© خانواده و رسانه — پلتفرم سواد رسانه‌ای برای والدین و مربیان</span>
      </div>
      <div class="flex items-center gap-4 text-sm text-stone-500">
        <a href="/contents" class="hover:text-teal-800">محتوای مرجع</a>
        <a href="/porseshkadeh" class="hover:text-teal-800">پرسش‌کده</a>
      </div>
    </div>
  </footer>
)
