import StarForgeContent from './StarForgeContent';

export const metadata = {
  title: 'Star Forge | Star World Order',
  description: 'Provably fair 5x5 constellation grid game on Monad - Match star patterns to win!',
};

export default function StarForgePage() {
  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <StarForgeContent />
      </div>
    </main>
  );
}
