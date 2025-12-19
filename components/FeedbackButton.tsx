'use client';

/**
 * Floating Feedback Button Component
 * 
 * Displays a fixed-position button in the bottom-right corner (desktop only)
 * that redirects to the Google Form for feedback/bug submissions.
 */
export default function FeedbackButton() {
  return (
    <a
      href="https://docs.google.com/forms/d/e/1FAIpQLSc9n6RI4pVW4REBiw2FG2EFiJydNwshS6KgxcAXWEu00IAp3A/viewform?usp=dialog"
      target="_blank"
      rel="noopener noreferrer"
      className="hidden md:flex fixed bottom-6 right-6 z-40 items-center gap-2 px-4 py-3 bg-[#1a1a2e] border-2 border-[#ffd700] rounded-lg text-[#ffd700] text-xs tracking-wide hover:bg-[#2a2a3e] hover:border-[#ffee88] smooth-transition hover-lift group"
      style={{ 
        boxShadow: '0 4px 15px rgba(255, 215, 0, 0.2), 4px 4px 0 rgba(0,0,0,0.4)',
      }}
    >
      <span className="text-base group-hover:animate-pixel-bounce">📝</span>
      <span className="font-semibold">SUBMIT FEEDBACK / BUGS</span>
    </a>
  );
}
