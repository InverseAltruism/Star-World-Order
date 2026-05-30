// SWO V2 — shared site footer (extracted from app/page.tsx so every content
// page gets consistent chrome via SiteChrome). See docs/UI_V2_REDESIGN_PLAN.md §6.1.

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
  </svg>
);

const XTwitterIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

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
