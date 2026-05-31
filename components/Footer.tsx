// SWO V2 — shared site footer (extracted from app/page.tsx so every content
// page gets consistent chrome via SiteChrome). See docs/UI_V2_REDESIGN_PLAN.md §6.1.

import { DiscordIcon, XTwitterIcon, GitHubIcon } from '@/components/icons/SocialIcons';

export default function Footer() {
  return (
    <footer className="border-t-4 border-[#2a2a4e] mt-16 bg-[#0a0a15] smooth-transition relative">
      <div className="absolute top-4 left-4 text-[#ffd700] text-[10px] opacity-30">◢◣</div>
      <div className="absolute top-4 right-4 text-[#ffd700] text-[10px] opacity-30">◥◤</div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4 text-[8px] text-[#9966ff]">
            <span>════</span>
            <span className="text-[#ffd700]">★</span>
            <span>════</span>
          </div>

          <div className="flex items-center justify-center gap-2 mb-4">
            <span
              className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse"
              style={{ textShadow: '0 0 10px rgba(255, 215, 0, 0.5)' }}
            >
              ⭐ STAR WORLD ORDER ⭐
            </span>
          </div>
          <p
            className="text-[#c4a0ff] text-xs tracking-wide mb-4"
            style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.5)' }}
          >
            A DAO for Skrumpeys with the Constellation trait
          </p>

          <div className="flex items-center justify-center gap-6 mb-4">
            <a
              href="https://discord.gg/EUp7nQvUXy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-[#5865F2] transition-colors duration-200"
              title="Join our Discord"
            >
              <DiscordIcon />
            </a>
            <a
              href="https://x.com/StrWorldOrder"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors duration-200"
              title="Follow us on X"
            >
              <XTwitterIcon />
            </a>
            <a
              href="https://github.com/InverseAltruism/Star-World-Order"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors duration-200"
              title="View on GitHub"
            >
              <GitHubIcon />
            </a>
          </div>

          <p className="text-gray-600 text-[10px]">The Order is forming • @StrWorldOrder</p>

          <div className="flex items-center justify-center gap-2 mt-4 text-[8px] text-[#9966ff] opacity-50">
            <span>◆</span>
            <span>◇</span>
            <span>◆</span>
          </div>
        </div>
      </div>
      <div
        className="h-1 bg-gradient-to-r from-[#ff00ff] via-[#ffd700] to-[#00ffff]"
        style={{ boxShadow: '0 0 10px rgba(255, 215, 0, 0.5)' }}
      />
    </footer>
  );
}
