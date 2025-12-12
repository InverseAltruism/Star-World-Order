// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title StarSkrumpeyMarketplace
 * @author Star World Order DAO
 * @notice OTC Marketplace for Star Skrumpeys on Monad
 * @dev Direct peer-to-peer NFT trading with DAO treasury fee support
 * 
 * Key Features:
 * - Fixed-price listings for Star Skrumpey NFTs
 * - DAO Treasury fee on each sale (configurable, default 2.5%)
 * - Trustless and atomic transactions
 * - Only Star Skrumpey holders can list
 * - Pausable for emergency situations
 * 
 * Deployed on Monad (Chain ID: 143)
 */
contract StarSkrumpeyMarketplace is ReentrancyGuard, Ownable, Pausable {
    
    // ============ Constants ============
    
    /// @notice Basis points divisor (100% = 10000 bps)
    uint256 public constant BPS_DIVISOR = 10000;
    
    /// @notice Maximum fee in basis points (10%)
    uint256 public constant MAX_FEE_BPS = 1000;
    
    // ============ State Variables ============
    
    /// @notice Skrumpey NFT contract address
    IERC721 public immutable skrumpeyNFT;
    
    /// @notice DAO Treasury address for fee collection
    address public daoTreasury;
    
    /// @notice Fee in basis points (250 = 2.5%)
    uint256 public feeBps;
    
    /// @notice Counter for listing IDs
    uint256 public nextListingId;
    
    /// @notice Mapping of listing ID to Listing struct
    mapping(uint256 => Listing) public listings;
    
    /// @notice Mapping of token ID to active listing ID (0 if not listed)
    mapping(uint256 => uint256) public tokenToListing;
    
    // ============ Structs ============
    
    /// @notice Listing information
    struct Listing {
        uint256 tokenId;     // Skrumpey token ID
        address seller;      // NFT owner/seller
        uint256 price;       // Price in MON (wei)
        bool active;         // Whether listing is active
        uint256 createdAt;   // Timestamp of listing creation
    }
    
    // ============ Events ============
    
    /// @notice Emitted when a new listing is created
    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 price
    );
    
    /// @notice Emitted when a listing is purchased
    event ListingPurchased(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 tokenId,
        uint256 price,
        uint256 daoFee,
        uint256 sellerProceeds
    );
    
    /// @notice Emitted when a listing is cancelled
    event ListingCancelled(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId
    );
    
    /// @notice Emitted when DAO treasury address is updated
    event DAOTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    
    /// @notice Emitted when fee basis points is updated
    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);
    
    // ============ Errors ============
    
    /// @notice Thrown when caller is not the token owner
    error NotTokenOwner();
    
    /// @notice Thrown when token is not approved for marketplace
    error NotApproved();
    
    /// @notice Thrown when listing is not found
    error ListingNotFound();
    
    /// @notice Thrown when listing is not active
    error ListingNotActive();
    
    /// @notice Thrown when buyer tries to buy own listing
    error CannotBuyOwnListing();
    
    /// @notice Thrown when payment amount is incorrect
    error IncorrectPayment();
    
    /// @notice Thrown when price is zero
    error PriceMustBePositive();
    
    /// @notice Thrown when token is already listed
    error TokenAlreadyListed();
    
    /// @notice Thrown when caller is not the seller
    error NotSeller();
    
    /// @notice Thrown when fee is too high
    error FeeTooHigh();
    
    /// @notice Thrown when address is zero
    error ZeroAddress();
    
    /// @notice Thrown when transfer fails
    error TransferFailed();
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize the marketplace
     * @param _skrumpeyNFT Address of the Skrumpey NFT contract
     * @param _daoTreasury Address of the DAO treasury
     * @param _feeBps Initial fee in basis points (default 250 = 2.5%)
     */
    constructor(
        address _skrumpeyNFT,
        address _daoTreasury,
        uint256 _feeBps
    ) Ownable(msg.sender) {
        if (_skrumpeyNFT == address(0)) revert ZeroAddress();
        if (_daoTreasury == address(0)) revert ZeroAddress();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        
        skrumpeyNFT = IERC721(_skrumpeyNFT);
        daoTreasury = _daoTreasury;
        feeBps = _feeBps;
        nextListingId = 1; // Start from 1 to distinguish from unset
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Create a new listing for a Star Skrumpey
     * @param tokenId The Skrumpey token ID to list
     * @param price The listing price in MON (wei)
     * @return listingId The ID of the created listing
     * 
     * Requirements:
     * - Caller must own the token
     * - Token must be approved for this contract
     * - Price must be greater than zero
     * - Token must not already be listed
     */
    function createListing(
        uint256 tokenId,
        uint256 price
    ) external whenNotPaused nonReentrant returns (uint256 listingId) {
        // Validate caller owns the token
        if (skrumpeyNFT.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        
        // Validate token is approved
        if (
            skrumpeyNFT.getApproved(tokenId) != address(this) &&
            !skrumpeyNFT.isApprovedForAll(msg.sender, address(this))
        ) revert NotApproved();
        
        // Validate price
        if (price == 0) revert PriceMustBePositive();
        
        // Check if token is already listed
        if (tokenToListing[tokenId] != 0) revert TokenAlreadyListed();
        
        // Create listing
        listingId = nextListingId++;
        listings[listingId] = Listing({
            tokenId: tokenId,
            seller: msg.sender,
            price: price,
            active: true,
            createdAt: block.timestamp
        });
        tokenToListing[tokenId] = listingId;
        
        emit ListingCreated(listingId, msg.sender, tokenId, price);
    }
    
    /**
     * @notice Buy a listed Star Skrumpey
     * @param listingId The ID of the listing to purchase
     * 
     * Requirements:
     * - Listing must be active
     * - Caller cannot be the seller
     * - Exact payment must be sent
     * - Token must still be approved
     * - Seller must still own the token
     */
    function buyListing(uint256 listingId) external payable whenNotPaused nonReentrant {
        Listing storage listing = listings[listingId];
        
        // Validate listing exists and is active
        if (listing.seller == address(0)) revert ListingNotFound();
        if (!listing.active) revert ListingNotActive();
        
        // Validate buyer is not seller
        if (msg.sender == listing.seller) revert CannotBuyOwnListing();
        
        // Validate payment
        if (msg.value != listing.price) revert IncorrectPayment();
        
        // Validate seller still owns token and it's still approved
        if (skrumpeyNFT.ownerOf(listing.tokenId) != listing.seller) revert NotTokenOwner();
        if (
            skrumpeyNFT.getApproved(listing.tokenId) != address(this) &&
            !skrumpeyNFT.isApprovedForAll(listing.seller, address(this))
        ) revert NotApproved();
        
        // Mark listing as inactive
        listing.active = false;
        tokenToListing[listing.tokenId] = 0;
        
        // Calculate fee and seller proceeds
        uint256 daoFee = (listing.price * feeBps) / BPS_DIVISOR;
        uint256 sellerProceeds = listing.price - daoFee;
        
        // Transfer NFT to buyer
        skrumpeyNFT.safeTransferFrom(listing.seller, msg.sender, listing.tokenId);
        
        // Transfer funds
        if (daoFee > 0) {
            (bool treasurySuccess, ) = payable(daoTreasury).call{value: daoFee}("");
            if (!treasurySuccess) revert TransferFailed();
        }
        
        (bool sellerSuccess, ) = payable(listing.seller).call{value: sellerProceeds}("");
        if (!sellerSuccess) revert TransferFailed();
        
        emit ListingPurchased(
            listingId,
            msg.sender,
            listing.seller,
            listing.tokenId,
            listing.price,
            daoFee,
            sellerProceeds
        );
    }
    
    /**
     * @notice Cancel an active listing
     * @param listingId The ID of the listing to cancel
     * 
     * Requirements:
     * - Caller must be the seller
     * - Listing must be active
     */
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        
        // Validate listing exists
        if (listing.seller == address(0)) revert ListingNotFound();
        
        // Validate caller is seller
        if (listing.seller != msg.sender) revert NotSeller();
        
        // Validate listing is active
        if (!listing.active) revert ListingNotActive();
        
        // Mark listing as inactive
        listing.active = false;
        tokenToListing[listing.tokenId] = 0;
        
        emit ListingCancelled(listingId, msg.sender, listing.tokenId);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get listing details
     * @param listingId The listing ID
     * @return The listing struct
     */
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }
    
    /**
     * @notice Check if a token is currently listed
     * @param tokenId The token ID to check
     * @return Whether the token is listed
     */
    function isTokenListed(uint256 tokenId) external view returns (bool) {
        return tokenToListing[tokenId] != 0;
    }
    
    /**
     * @notice Get the listing ID for a token
     * @param tokenId The token ID
     * @return The listing ID (0 if not listed)
     */
    function getListingIdForToken(uint256 tokenId) external view returns (uint256) {
        return tokenToListing[tokenId];
    }
    
    /**
     * @notice Calculate the fee and seller proceeds for a price
     * @param price The sale price
     * @return daoFee The fee amount
     * @return sellerProceeds The seller's proceeds
     */
    function calculateFees(uint256 price) external view returns (uint256 daoFee, uint256 sellerProceeds) {
        daoFee = (price * feeBps) / BPS_DIVISOR;
        sellerProceeds = price - daoFee;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update the DAO treasury address
     * @param _daoTreasury New treasury address
     */
    function setDAOTreasury(address _daoTreasury) external onlyOwner {
        if (_daoTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = daoTreasury;
        daoTreasury = _daoTreasury;
        emit DAOTreasuryUpdated(oldTreasury, _daoTreasury);
    }
    
    /**
     * @notice Update the fee in basis points
     * @param _feeBps New fee in basis points
     */
    function setFeeBps(uint256 _feeBps) external onlyOwner {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        uint256 oldFeeBps = feeBps;
        feeBps = _feeBps;
        emit FeeUpdated(oldFeeBps, _feeBps);
    }
    
    /**
     * @notice Pause the marketplace
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause the marketplace
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Emergency function to recover stuck ETH
     * @dev Only callable by owner, should only be used in emergencies
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = payable(owner()).call{value: balance}("");
            if (!success) revert TransferFailed();
        }
    }
}
