export default function Features() {
  const features = [
    {
      icon: '🏛️',
      title: 'THE ORDER',
      description: 'EXCLUSIVE REALM FOR THOSE CHOSEN BY THE STARS',
      color: '#ffd700',
    },
    {
      icon: '⚡',
      title: 'MONAD REALM',
      description: 'BLAZING FAST COSMIC INFRASTRUCTURE',
      color: '#4488ff',
    },
    {
      icon: '🗳️',
      title: 'COSMIC VOTING',
      description: 'SHAPE DESTINY WITH YOUR FELLOW STAR BEARERS',
      color: '#9966ff',
    },
    {
      icon: '💎',
      title: 'TREASURY',
      description: 'COLLECTIVE COSMIC RESOURCES',
      color: '#44ff88',
    },
    {
      icon: '💬',
      title: 'STAR COUNCIL',
      description: 'COMMUNE WITH FELLOW CHOSEN ONES',
      color: '#ff8844',
    },
    {
      icon: '🔄',
      title: 'COSMIC EXCHANGE',
      description: 'TRADE AMONGST THE STARS (SOON™)',
      color: '#ff4466',
    },
  ];

  return (
    <section id="about" className="relative py-16 md:py-24">
      {/* Section header */}
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-lg md:text-xl text-[#ffd700] mb-4 pixel-glow-gold tracking-wider">
            ✦ 𓆩 THE ORDER AWAITS 𓆪 ✦
          </h2>
          <div className="w-32 h-1 bg-gradient-to-r from-transparent via-[#9966ff] to-transparent mx-auto" />
        </div>

        {/* Features grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="pixel-card p-6 hover:translate-y-[-4px] transition-transform duration-200 group"
            >
              {/* Icon */}
              <div 
                className="text-4xl mb-4 animate-pixel-float"
                style={{ animationDelay: `${index * 0.2}s` }}
              >
                {feature.icon}
              </div>
              
              {/* Title */}
              <h3 
                className="text-xs mb-3 tracking-wider"
                style={{ color: feature.color }}
              >
                {feature.title}
              </h3>
              
              {/* Description */}
              <p className="text-gray-500 text-[8px] leading-relaxed tracking-wide">
                {feature.description}
              </p>
              
              {/* Bottom accent line */}
              <div 
                className="h-[2px] mt-4 opacity-50 transition-opacity group-hover:opacity-100"
                style={{ background: `linear-gradient(90deg, ${feature.color}, transparent)` }}
              />
            </div>
          ))}
        </div>

        {/* Call to action */}
        <div className="text-center mt-12">
          <div className="pixel-card inline-block px-8 py-6">
            <p className="text-[#ffd700] text-[10px] mb-3 tracking-wide">
              ✦ ARE YOU CHOSEN? ✦
            </p>
            <p className="text-gray-500 text-[8px] mb-4">
              connect thy wallet • reveal thy star
            </p>
            <button className="pixel-btn pixel-btn-gold text-[8px]">
              CONNECT WALLET
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
