export default function Hero() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-20 text-center">
      <div className="mb-8">
        <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-pulse">
          Star World Order
        </h1>
        <p className="text-xl md:text-2xl text-gray-300 mb-4">
          The Premier NFT Collection of Skrumpeys on Monad
        </p>
        <p className="text-gray-400 max-w-2xl mx-auto">
          64x64 pixel art creatures with star traits. Join the DAO and become part of the Star World Order community.
        </p>
      </div>
      
      <div className="flex justify-center gap-4 mb-12">
        <button className="bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-lg font-medium transition-colors">
          View Collection
        </button>
        <button className="border border-gray-700 hover:border-gray-500 text-white px-8 py-3 rounded-lg font-medium transition-colors">
          Learn More
        </button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 max-w-3xl mx-auto">
        <div className="text-8xl mb-4">🐸⭐</div>
        <p className="text-gray-400">
          Skrumpey with Star Trait - Pixel Art NFT (64x64)
        </p>
      </div>
    </section>
  );
}
