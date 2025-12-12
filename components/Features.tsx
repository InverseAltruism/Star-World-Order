export default function Features() {
  const features = [
    {
      icon: '🖼️',
      title: 'Unique NFTs',
      description: '64x64 pixel art Skrumpeys, each with unique traits and star attributes',
    },
    {
      icon: '⚡',
      title: 'Monad Chain',
      description: 'Built on Monad - the high-performance blockchain for next-gen applications',
    },
    {
      icon: '🤝',
      title: 'DAO Governance',
      description: 'Community-driven decisions through decentralized autonomous organization',
    },
    {
      icon: '🔐',
      title: 'Multi-Wallet Support',
      description: 'Connect with MetaMask, Trust Wallet, or Phantom seamlessly',
    },
  ];

  return (
    <section id="about" className="max-w-7xl mx-auto px-4 py-20">
      <h2 className="text-4xl font-bold text-center mb-12">Why Star World Order?</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, index) => (
          <div
            key={index}
            className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-primary transition-colors"
          >
            <div className="text-5xl mb-4">{feature.icon}</div>
            <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
            <p className="text-gray-400">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
