'use client';

import { useState } from 'react';
import AccessGate from '@/components/AccessGate';
import { useMarketplace, truncateAddress, ListingStatus, Listing, getDAOFeePercentage, calculateDAOFee, calculateSellerProceeds, formatPriceFromWei } from '@/lib/hooks/useMarketplace';
import { useDAOAccess } from '@/lib/hooks/useDAOAccess';
import { parseEther } from 'viem';

type TabId = 'browse' | 'create' | 'my-listings';

interface Tab {
  id: TabId;
  label: string;
  icon: string;
}

const tabs: Tab[] = [
  { id: 'browse', label: 'BROWSE', icon: '🔍' },
  { id: 'create', label: 'CREATE LISTING', icon: '📋' },
  { id: 'my-listings', label: 'MY LISTINGS', icon: '⭐' },
];

/**
 * Browse tab - view all active listings
 */
function BrowseTab({ 
  listings, 
  onBuy, 
  isPending,
  currentAddress,
  balanceFormatted,
}: { 
  listings: Listing[];
  onBuy: (listingId: string) => void;
  isPending: boolean;
  currentAddress?: string;
  balanceFormatted: string;
}) {
  if (listings.length === 0) {
    return (
      <div className="pixel-card p-8 text-center animate-slide-in-up">
        <div className="text-4xl mb-4 animate-pixel-float">🌌</div>
        <h3 className="text-[#ffd700] text-xs tracking-wider mb-2">NO ACTIVE LISTINGS</h3>
        <p className="text-gray-500 text-[8px] max-w-sm mx-auto">
          The cosmic marketplace awaits its first listing. Be the first to list a Star Skrumpey!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance Display */}
      <div className="flex justify-between items-center animate-slide-in-up">
        <h3 className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse">
          ACTIVE LISTINGS ({listings.length})
        </h3>
        <div className="bg-[#1a1a2e] px-3 py-1 rounded-lg border border-[#2a2a4e]">
          <span className="text-[#44ff88] text-[8px]">💎 {balanceFormatted} MON</span>
        </div>
      </div>
      
      {/* Listings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {listings.map((listing, index) => {
          const isOwnListing = currentAddress && 
            listing.seller.toLowerCase() === currentAddress.toLowerCase();
          const delayClass = `animate-delay-${Math.min(index + 1, 6)}`;
          
          return (
            <div 
              key={listing.id} 
              className={`pixel-card p-4 smooth-transition hover-lift animate-slide-in-up ${delayClass}`}
            >
              {/* NFT Info */}
              <div className="flex items-start gap-4 mb-4">
                <div className="w-16 h-16 bg-[#1a1a2e] rounded-lg flex items-center justify-center border border-[#2a2a4e]">
                  <span className="text-2xl animate-pixel-float">🐸⭐</span>
                </div>
                <div className="flex-1">
                  <h4 className="text-gray-200 text-[10px] font-bold mb-1">
                    Star Skrumpey #{listing.tokenId}
                  </h4>
                  {listing.starVariant && (
                    <span className="text-[#9966ff] text-[8px] uppercase">
                      ✦ {listing.starVariant}
                    </span>
                  )}
                  <p className="text-gray-500 text-[6px] mt-1">
                    Seller: {truncateAddress(listing.seller)}
                    {isOwnListing && <span className="text-[#ffd700] ml-1">(YOU)</span>}
                  </p>
                </div>
              </div>
              
              {/* Price and Action */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-[6px]">PRICE</p>
                  <p className="text-[#ffd700] text-sm font-bold">
                    {listing.priceFormatted} MON
                  </p>
                </div>
                {!isOwnListing && (
                  <button
                    onClick={() => onBuy(listing.id)}
                    disabled={isPending}
                    className="pixel-btn pixel-btn-gold text-[8px] !px-4 !py-2 smooth-transition hover-lift disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending ? 'PROCESSING...' : '💰 BUY NOW'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Create Listing tab - list a Star Skrumpey for sale
 */
function CreateListingTab({
  availableTokens,
  onCreateListing,
  isPending,
  isContractDeployed,
}: {
  availableTokens: Array<{ tokenId: number; starVariant?: string }>;
  onCreateListing: (tokenId: number, price: string, variant?: string) => void;
  isPending: boolean;
  isContractDeployed: boolean;
}) {
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!selectedToken) {
      setError('Please select a Star Skrumpey to list');
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      setError('Please enter a valid price');
      return;
    }
    setError(null);
    const token = availableTokens.find(t => t.tokenId === selectedToken);
    onCreateListing(selectedToken, price, token?.starVariant);
    setSelectedToken(null);
    setPrice('');
  };

  return (
    <div className="space-y-6">
      {/* Demo Mode Notice */}
      {!isContractDeployed && (
        <div className="pixel-card p-4 bg-[#ffd700]/10 border-2 border-[#ffd700]/30 animate-slide-in-up">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-[#ffd700] text-[10px] font-bold">DEMO MODE</p>
              <p className="text-gray-400 text-[8px]">
                Marketplace contract not deployed. Listings are stored locally for demonstration.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Create Listing Form */}
      <div className="pixel-card p-6 animate-slide-in-up animate-delay-1">
        <h3 className="text-[#ffd700] text-xs tracking-wider mb-6 animate-glow-pulse">
          ✦ CREATE NEW LISTING ✦
        </h3>

        {availableTokens.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4 animate-pixel-float">🌟</div>
            <p className="text-gray-400 text-[10px] mb-2">No Star Skrumpeys available to list</p>
            <p className="text-gray-500 text-[8px]">
              All your Star Skrumpeys are already listed or you don&apos;t own any.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Token Selection */}
            <div>
              <label className="text-[#9966ff] text-[8px] block mb-2">SELECT STAR SKRUMPEY</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableTokens.map((token) => (
                  <button
                    key={token.tokenId}
                    onClick={() => setSelectedToken(token.tokenId)}
                    className={`p-3 rounded-lg border-2 smooth-transition hover-lift ${
                      selectedToken === token.tokenId
                        ? 'bg-[#ffd700]/20 border-[#ffd700]'
                        : 'bg-[#1a1a2e] border-[#2a2a4e] hover:border-[#9966ff]'
                    }`}
                  >
                    <div className="text-xl mb-1 animate-pixel-float">🐸⭐</div>
                    <p className="text-gray-200 text-[8px]">#{token.tokenId}</p>
                    {token.starVariant && (
                      <p className="text-[#9966ff] text-[6px] uppercase">{token.starVariant}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Input */}
            <div>
              <label className="text-[#9966ff] text-[8px] block mb-2">LISTING PRICE (MON)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#0a0a15] border-2 border-[#2a2a4e] rounded-lg px-4 py-3 text-white text-sm focus:border-[#ffd700] focus:outline-none smooth-transition"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                  MON
                </span>
              </div>
              
              {/* Fee Breakdown */}
              {price && parseFloat(price) > 0 && !isNaN(parseFloat(price)) && (() => {
                try {
                  const priceWei = parseEther(price);
                  const daoFee = calculateDAOFee(priceWei);
                  const sellerProceeds = calculateSellerProceeds(priceWei);
                  return (
                    <div className="mt-3 bg-[#0a0a15] rounded-lg p-3 border border-[#2a2a4e]">
                      <p className="text-[#ffd700] text-[8px] mb-2">💰 FEE BREAKDOWN</p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[7px]">
                          <span className="text-gray-500">Sale Price:</span>
                          <span className="text-white">{price} MON</span>
                        </div>
                        <div className="flex justify-between text-[7px]">
                          <span className="text-gray-500">DAO Treasury Fee ({getDAOFeePercentage()}%):</span>
                          <span className="text-[#9966ff]">-{formatPriceFromWei(daoFee)} MON</span>
                        </div>
                        <div className="border-t border-[#2a2a4e] pt-1 mt-1">
                          <div className="flex justify-between text-[8px]">
                            <span className="text-[#44ff88]">You Receive:</span>
                            <span className="text-[#44ff88] font-bold">{formatPriceFromWei(sellerProceeds)} MON</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                } catch {
                  return null; // Invalid price format, don't show breakdown
                }
              })()}
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-[#ff4466] text-[8px] bg-[#ff4466]/10 px-3 py-2 rounded">
                ⚠️ {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={isPending || !selectedToken || !price}
              className="w-full pixel-btn pixel-btn-gold text-[10px] !py-3 smooth-transition hover-lift disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? '⏳ CREATING LISTING...' : '📋 CREATE LISTING'}
            </button>

            {/* Info */}
            <div className="bg-[#1a1a2e] rounded-lg p-3 mt-4">
              <p className="text-[#9966ff] text-[8px] mb-1">ℹ️ LISTING INFO</p>
              <ul className="text-gray-500 text-[6px] space-y-1">
                <li>• Your NFT will be listed for the exact price you set</li>
                <li>• Buyers pay the full amount in MON to purchase</li>
                <li>• A {getDAOFeePercentage()}% fee goes to the DAO Treasury on each sale</li>
                <li>• You can cancel your listing at any time</li>
                <li>• Transaction is trustless and atomic</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * My Listings tab - manage your own listings
 */
function MyListingsTab({
  listings,
  onCancel,
  isPending,
}: {
  listings: Listing[];
  onCancel: (listingId: string) => void;
  isPending: boolean;
}) {
  if (listings.length === 0) {
    return (
      <div className="pixel-card p-8 text-center animate-slide-in-up">
        <div className="text-4xl mb-4 animate-pixel-float">📭</div>
        <h3 className="text-[#ffd700] text-xs tracking-wider mb-2">NO ACTIVE LISTINGS</h3>
        <p className="text-gray-500 text-[8px] max-w-sm mx-auto">
          You haven&apos;t listed any Star Skrumpeys yet. Go to the Create Listing tab to list your first one!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-[#ffd700] text-xs tracking-wider animate-glow-pulse animate-slide-in-up">
        YOUR LISTINGS ({listings.length})
      </h3>
      
      <div className="space-y-4">
        {listings.map((listing, index) => {
          const delayClass = `animate-delay-${Math.min(index + 1, 6)}`;
          return (
            <div 
              key={listing.id} 
              className={`pixel-card p-4 smooth-transition hover-lift animate-slide-in-up ${delayClass}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1a1a2e] rounded-lg flex items-center justify-center border border-[#2a2a4e]">
                    <span className="text-xl animate-pixel-float">🐸⭐</span>
                  </div>
                  <div>
                    <h4 className="text-gray-200 text-[10px] font-bold">
                      Star Skrumpey #{listing.tokenId}
                    </h4>
                    <p className="text-[#ffd700] text-xs font-bold">
                      {listing.priceFormatted} MON
                    </p>
                    {listing.starVariant && (
                      <span className="text-[#9966ff] text-[6px] uppercase">
                        ✦ {listing.starVariant}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`text-[6px] px-2 py-1 rounded ${
                    listing.status === ListingStatus.Active
                      ? 'bg-[#44ff88]/20 text-[#44ff88]'
                      : 'bg-gray-500/20 text-gray-500'
                  }`}>
                    {listing.status.toUpperCase()}
                  </span>
                  {listing.status === ListingStatus.Active && (
                    <button
                      onClick={() => onCancel(listing.id)}
                      disabled={isPending}
                      className="pixel-btn text-[8px] !px-3 !py-1 !bg-[#ff4466] !border-[#ff6688_#aa2244_#aa2244_#ff6688] smooth-transition hover-lift disabled:opacity-50"
                    >
                      {isPending ? '...' : '✕ CANCEL'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Transaction Status Modal
 */
function TransactionModal({
  status,
  message,
  onClose,
}: {
  status: 'success' | 'error' | 'pending';
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="pixel-card p-6 max-w-sm w-full text-center animate-slide-in-up">
        <div className={`text-4xl mb-4 ${status === 'pending' ? 'animate-spin' : 'animate-pixel-float'}`}>
          {status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳'}
        </div>
        <h3 className={`text-sm tracking-wider mb-2 ${
          status === 'success' ? 'text-[#44ff88]' : 
          status === 'error' ? 'text-[#ff4466]' : 
          'text-[#ffd700]'
        }`}>
          {status === 'success' ? 'SUCCESS!' : status === 'error' ? 'ERROR' : 'PROCESSING...'}
        </h3>
        <p className="text-gray-400 text-[10px] mb-4">{message}</p>
        {status !== 'pending' && (
          <button
            onClick={onClose}
            className="pixel-btn text-[8px] smooth-transition hover-lift"
          >
            CLOSE
          </button>
        )}
      </div>
    </div>
  );
}

export default function MarketplaceContent() {
  const [activeTab, setActiveTab] = useState<TabId>('browse');
  const [modal, setModal] = useState<{ status: 'success' | 'error' | 'pending'; message: string } | null>(null);
  
  const {
    listings,
    userListings,
    isLoading,
    isPending,
    balanceFormatted,
    isContractDeployed,
    createListing,
    buyListing,
    cancelListing,
    availableForListing,
    refresh,
  } = useMarketplace();
  
  const { address } = useDAOAccess();

  // Handle create listing
  const handleCreateListing = async (tokenId: number, price: string, variant?: string) => {
    setModal({ status: 'pending', message: 'Creating your listing...' });
    const result = await createListing(tokenId, price, variant);
    if (result.success) {
      setModal({ status: 'success', message: `Star Skrumpey #${tokenId} listed for ${price} MON!` });
      setActiveTab('my-listings');
    } else {
      setModal({ status: 'error', message: result.error || 'Failed to create listing' });
    }
  };

  // Handle buy listing
  const handleBuyListing = async (listingId: string) => {
    const listing = listings.find(l => l.id === listingId);
    if (!listing) return;
    
    setModal({ status: 'pending', message: 'Processing purchase...' });
    const result = await buyListing(listingId);
    if (result.success) {
      setModal({ status: 'success', message: `Successfully purchased Star Skrumpey #${listing.tokenId}!` });
    } else {
      setModal({ status: 'error', message: result.error || 'Failed to buy listing' });
    }
  };

  // Handle cancel listing
  const handleCancelListing = async (listingId: string) => {
    setModal({ status: 'pending', message: 'Cancelling listing...' });
    const result = await cancelListing(listingId);
    if (result.success) {
      setModal({ status: 'success', message: 'Listing cancelled successfully!' });
    } else {
      setModal({ status: 'error', message: result.error || 'Failed to cancel listing' });
    }
  };

  return (
    <>
      {/* Transaction Modal */}
      {modal && (
        <TransactionModal
          status={modal.status}
          message={modal.message}
          onClose={() => setModal(null)}
        />
      )}

      {/* Page Header */}
      <div className="text-center mb-8 animate-slide-in-up">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-2xl animate-pixel-float hover-lift smooth-transition">🔄</span>
          <h1 className="text-lg md:text-xl text-[#ffd700] pixel-glow-gold tracking-wider">
            COSMIC EXCHANGE
          </h1>
          <span className="text-2xl animate-pixel-float hover-lift smooth-transition" style={{ animationDelay: '0.5s' }}>⭐</span>
        </div>
        <p className="text-[#9966ff] text-[10px] tracking-wide animate-glow-pulse">
          ✦ OTC MARKETPLACE FOR STAR SKRUMPEYS ✦
        </p>
      </div>

      {/* Access-gated content */}
      <AccessGate
        title="MARKETPLACE LOCKED"
        message="Only Star Skrumpey holders may access the Cosmic Exchange."
      >
        {/* Loading State */}
        {isLoading ? (
          <div className="pixel-card p-8 text-center animate-slide-in-up">
            <div className="text-4xl mb-4 animate-spin">⭐</div>
            <p className="text-[#ffd700] text-xs animate-pixel-pulse">LOADING MARKETPLACE...</p>
          </div>
        ) : (
          <>
            {/* Tab Navigation */}
            <div className="flex justify-center gap-2 mb-8 animate-slide-in-up animate-delay-1">
              {tabs.map((tab, index) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pixel-btn text-[8px] !px-4 !py-2 smooth-transition hover-lift ${
                    activeTab === tab.id 
                      ? 'pixel-btn-gold' 
                      : '!bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e]'
                  }`}
                  style={{ animationDelay: `${0.1 + index * 0.1}s` }}
                >
                  <span className="mr-1">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
              {/* Refresh Button */}
              <button
                onClick={refresh}
                className="pixel-btn text-[8px] !px-2 !py-2 !bg-[#1a1a2e] !border-[#3a3a5e_#1a1a2e_#1a1a2e_#3a3a5e] smooth-transition hover-lift"
                title="Refresh listings"
              >
                🔄
              </button>
            </div>

            {/* Tab Content */}
            <div className="max-w-3xl mx-auto">
              {activeTab === 'browse' && (
                <BrowseTab
                  listings={listings}
                  onBuy={handleBuyListing}
                  isPending={isPending}
                  currentAddress={address}
                  balanceFormatted={balanceFormatted}
                />
              )}
              {activeTab === 'create' && (
                <CreateListingTab
                  availableTokens={availableForListing}
                  onCreateListing={handleCreateListing}
                  isPending={isPending}
                  isContractDeployed={isContractDeployed}
                />
              )}
              {activeTab === 'my-listings' && (
                <MyListingsTab
                  listings={userListings}
                  onCancel={handleCancelListing}
                  isPending={isPending}
                />
              )}
            </div>

            {/* Info Footer */}
            <div className="pixel-card p-4 mt-8 max-w-3xl mx-auto animate-slide-in-up animate-delay-6">
              <div className="flex items-center gap-3">
                <span className="text-xl animate-pixel-float">ℹ️</span>
                <div className="flex-1">
                  <p className="text-[#9966ff] text-[8px] mb-1">DIRECT CONTRACT TRADING • {getDAOFeePercentage()}% DAO FEE</p>
                  <p className="text-gray-500 text-[6px]">
                    Trade Star Skrumpeys directly without Magic Eden or OpenSea. 
                    A {getDAOFeePercentage()}% fee from each sale goes to the DAO Treasury to fund community initiatives.
                    {!isContractDeployed && ' Currently running in demo mode.'}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </AccessGate>
    </>
  );
}
