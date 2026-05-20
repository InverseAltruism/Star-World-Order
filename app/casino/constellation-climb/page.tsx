import HiLoContent from './HiLoContent';

export const metadata = {
  title: 'Constellation Climb | Cosmic Casino | Star World Order',
  description:
    'Climb the cosmic ladder — Hi-Lo session game on the Cosmic Casino. Open a session, step higher or lower, cash out at any compounded multiplier.',
};

export default function ConstellationClimbPage() {
  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <HiLoContent />
      </div>
    </main>
  );
}
