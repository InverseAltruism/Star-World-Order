/**
 * Direct RPC NFT Fetcher (DEPRECATED - Use Magic Eden API instead)
 * 
 * This module is deprecated due to lack of ERC721Enumerable support in most Monad NFT contracts.
 * The current implementation relies on ERC721Enumerable interface which is not widely supported.
 * 
 * Use lib/magiceden.ts for NFT fetching instead.
 * 
 * @deprecated Use Magic Eden API (lib/magiceden.ts) for reliable NFT fetching
 * 
 * Original Purpose:
 * Fetches NFT holdings directly from blockchain via RPC calls.
 * Used as a free alternative to BlockVision API indexer.
 * 
 * Supports ERC721Enumerable collections using:
 * - balanceOf(address) - Get count of NFTs owned
 * - tokenOfOwnerByIndex(address, index) - Get token ID at index
 * - tokenURI(tokenId) - Get metadata URI
 * 
 * NOTE: Only fetches from tracked collections due to Monad lacking
 * affordable NFT indexing APIs. See TRACKED_COLLECTIONS below.
 * 
 * ISSUE: None of the tracked collections actually support ERC721Enumerable,
 * making this approach non-functional. Magic Eden API is the recommended solution.
 */

import { getResilientClient, retryWithBackoff } from './rpcClient';
import { logger } from './logger';
import { Address, parseAbi, encodeFunctionData, decodeFunctionResult } from 'viem';

/**
 * Multicall3 contract address (deployed on all networks)
 */
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

/**
 * ERC721Enumerable interface ID
 * bytes4(keccak256('totalSupply()')) ^
 * bytes4(keccak256('tokenByIndex(uint256)')) ^
 * bytes4(keccak256('tokenOfOwnerByIndex(address,uint256)'))
 */
const ERC721_ENUMERABLE_INTERFACE_ID = '0x780e9d63';

/**
 * ERC721Enumerable ABI - only the functions we need
 */
const ERC721_ENUMERABLE_ABI = parseAbi([
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function name() view returns (string)',
]);

/**
 * Multicall3 ABI - for batch calls
 */
const MULTICALL3_ABI = parseAbi([
  'struct Call { address target; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate(Call[] calldata calls) external payable returns (uint256 blockNumber, bytes[] memory returnData)',
  'function tryAggregate(bool requireSuccess, Call[] calldata calls) external payable returns (Result[] memory returnData)',
]);

/**
 * Tracked NFT Collections (LEGACY - Most do NOT support ERC721Enumerable)
 * 
 * NOTE: This list is maintained for reference only.
 * Use Magic Eden API (lib/magiceden.ts) instead for actual NFT fetching.
 * 
 * Verification Status:
 * - Skrumpeys: Does NOT support ERC721Enumerable ❌
 * - 10k Squad: Does NOT support ERC721Enumerable ❌
 * - Chads: Does NOT support ERC721Enumerable ❌
 * - Sealuminati: Does NOT support ERC721Enumerable ❌
 * - The Daks: Does NOT support ERC721Enumerable ❌
 * - llamao: Does NOT support ERC721Enumerable ❌
 * 
 * Original invalid Spiky address (38 chars): 0x43577CC08c03d4017177EB1e43F8077C41C765
 * Removed due to invalid address format.
 */
export interface TrackedCollection {
  name: string;
  address: Address;
}

export const TRACKED_COLLECTIONS: TrackedCollection[] = [
  {
    name: 'Skrumpeys',
    address: '0xB0DAD798C80e40Dd6b8E8545074C6a5B7B97D2c0',
  },
  {
    name: '10k Squad',
    address: '0x818030837E8350ba63E64d7dC01A547fA73c8279',
  },
  {
    name: 'Chads',
    address: '0xe217a5517105a97616B09C05c685a7e125e6E753',
  },
  {
    name: 'Sealuminati',
    address: '0xaEAA920165fD7ce58a0E0772Ffc97F06626572cD',
  },
  {
    name: 'The Daks',
    address: '0x9F8514cEBee138b61806d4651f51d26C8098b463',
  },
  {
    name: 'llamao',
    address: '0x21D95aDDceBe87BEA4e49534595F242Af002D068',
  },
  // Spiky removed - invalid address (only 38 hex chars instead of 40)
  // Original: 0x43577CC08c03d4017177EB1e43F8077C41C765
];

/**
 * RPC-fetched NFT holding
 */
export interface RPCNFTHolding {
  tokenId: string;
  name: string;
  collectionName: string;
  contractAddress: string;
  imageUrl: string;
  metadataUri: string;
  quantity: number;
}

/**
 * Convert IPFS URI to HTTP gateway URL
 */
function ipfsToHttp(uri: string): string {
  if (!uri) return '';
  
  // Handle ipfs:// protocol
  if (uri.startsWith('ipfs://')) {
    const hash = uri.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${hash}`;
  }
  
  // Handle /ipfs/ path
  if (uri.includes('/ipfs/')) {
    const hash = uri.split('/ipfs/')[1];
    return `https://ipfs.io/ipfs/${hash}`;
  }
  
  // Already HTTP or data URI
  return uri;
}

/**
 * Fetch metadata from URI with timeout
 */
async function fetchMetadata(uri: string): Promise<{
  name?: string;
  image?: string;
  description?: string;
} | null> {
  try {
    const httpUri = ipfsToHttp(uri);
    
    // Set a timeout for metadata fetching (5 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(httpUri, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      logger.warn('Failed to fetch NFT metadata', {
        uri: httpUri,
        status: response.status,
      });
      return null;
    }
    
    const metadata = await response.json();
    return metadata;
  } catch (error) {
    logger.debug('Error fetching NFT metadata', {
      uri,
      error: String(error),
    });
    return null;
  }
}

/**
 * Check if a collection supports ERC721Enumerable interface
 * 
 * @deprecated This function is part of a deprecated RPC-based approach.
 *             Use Magic Eden API (lib/magiceden.ts) instead.
 */
export async function supportsEnumerable(
  contractAddress: Address
): Promise<boolean> {
  try {
    const client = await getResilientClient();
    
    const supports = await retryWithBackoff(async () => {
      return await client.readContract({
        address: contractAddress,
        abi: ERC721_ENUMERABLE_ABI,
        functionName: 'supportsInterface',
        args: [ERC721_ENUMERABLE_INTERFACE_ID as `0x${string}`],
      });
    });
    
    return supports as boolean;
  } catch (error) {
    logger.warn('Failed to check ERC721Enumerable support', {
      contractAddress,
      error: String(error),
    });
    return false;
  }
}

/**
 * Fetch NFTs from a specific collection for a wallet
 * 
 * @deprecated This function is part of a deprecated RPC-based approach.
 *             Use Magic Eden API (lib/magiceden.ts) instead.
 *             Most NFT contracts on Monad do NOT support ERC721Enumerable.
 */
export async function fetchCollectionNFTs(
  walletAddress: Address,
  contractAddress: Address,
  collectionName: string
): Promise<RPCNFTHolding[]> {
  try {
    logger.info('Fetching NFTs via RPC', {
      wallet: walletAddress,
      collection: collectionName,
      contract: contractAddress,
    });
    
    const client = await getResilientClient();
    
    // Step 1: Check if collection supports enumeration
    const isEnumerable = await supportsEnumerable(contractAddress);
    if (!isEnumerable) {
      logger.warn('Collection does not support ERC721Enumerable, skipping', {
        collection: collectionName,
        contract: contractAddress,
      });
      return [];
    }
    
    // Step 2: Get balance of NFTs owned
    const balance = await retryWithBackoff(async () => {
      return await client.readContract({
        address: contractAddress,
        abi: ERC721_ENUMERABLE_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      });
    }) as bigint;
    
    const balanceNum = Number(balance);
    
    if (balanceNum === 0) {
      logger.debug('No NFTs found in collection', {
        collection: collectionName,
        wallet: walletAddress,
      });
      return [];
    }
    
    logger.info('Found NFTs in collection', {
      collection: collectionName,
      count: balanceNum,
    });
    
    // Step 3: Fetch all token IDs using multicall for efficiency
    const tokenIdCalls = Array.from({ length: balanceNum }, (_, index) => ({
      target: contractAddress,
      callData: encodeFunctionData({
        abi: ERC721_ENUMERABLE_ABI,
        functionName: 'tokenOfOwnerByIndex',
        args: [walletAddress, BigInt(index)],
      }),
    }));
    
    const tokenIdsResult = await retryWithBackoff(async () => {
      return await client.readContract({
        address: MULTICALL3_ADDRESS,
        abi: MULTICALL3_ABI,
        functionName: 'tryAggregate',
        args: [false, tokenIdCalls],
      });
    }) as Array<{ success: boolean; returnData: `0x${string}` }>;
    
    // Decode token IDs
    const tokenIds: bigint[] = [];
    for (const result of tokenIdsResult) {
      if (result.success && result.returnData !== '0x') {
        try {
          const decoded = decodeFunctionResult({
            abi: ERC721_ENUMERABLE_ABI,
            functionName: 'tokenOfOwnerByIndex',
            data: result.returnData,
          }) as bigint;
          tokenIds.push(decoded);
        } catch (error) {
          logger.debug('Failed to decode token ID', { error: String(error) });
        }
      }
    }
    
    if (tokenIds.length === 0) {
      logger.warn('No valid token IDs decoded', { collection: collectionName });
      return [];
    }
    
    // Step 4: Fetch token URIs using multicall
    const uriCalls = tokenIds.map(tokenId => ({
      target: contractAddress,
      callData: encodeFunctionData({
        abi: ERC721_ENUMERABLE_ABI,
        functionName: 'tokenURI',
        args: [tokenId],
      }),
    }));
    
    const urisResult = await retryWithBackoff(async () => {
      return await client.readContract({
        address: MULTICALL3_ADDRESS,
        abi: MULTICALL3_ABI,
        functionName: 'tryAggregate',
        args: [false, uriCalls],
      });
    }) as Array<{ success: boolean; returnData: `0x${string}` }>;
    
    // Step 5: Process results and fetch metadata
    const holdings: RPCNFTHolding[] = [];
    
    for (let i = 0; i < tokenIds.length; i++) {
      const tokenId = tokenIds[i];
      const uriResult = urisResult[i];
      
      let tokenURI = '';
      if (uriResult.success && uriResult.returnData !== '0x') {
        try {
          tokenURI = decodeFunctionResult({
            abi: ERC721_ENUMERABLE_ABI,
            functionName: 'tokenURI',
            data: uriResult.returnData,
          }) as string;
        } catch (error) {
          logger.debug('Failed to decode tokenURI', { 
            tokenId: tokenId.toString(),
            error: String(error),
          });
        }
      }
      
      // Fetch metadata if URI is available
      let name = `${collectionName} #${tokenId}`;
      let imageUrl = '';
      
      if (tokenURI) {
        const metadata = await fetchMetadata(tokenURI);
        if (metadata) {
          name = metadata.name || name;
          imageUrl = metadata.image ? ipfsToHttp(metadata.image) : '';
        }
      }
      
      holdings.push({
        tokenId: tokenId.toString(),
        name,
        collectionName,
        contractAddress,
        imageUrl,
        metadataUri: tokenURI,
        quantity: 1,
      });
    }
    
    logger.info('Successfully fetched NFTs via RPC', {
      collection: collectionName,
      count: holdings.length,
    });
    
    return holdings;
  } catch (error) {
    logger.error('Failed to fetch collection NFTs via RPC', {
      collection: collectionName,
      contract: contractAddress,
      error: String(error),
    });
    return [];
  }
}

/**
 * Fetch all NFTs for a wallet from tracked collections
 * 
 * @deprecated This function is part of a deprecated RPC-based approach.
 *             Use Magic Eden API (lib/magiceden.ts) instead.
 *             Most NFT contracts on Monad do NOT support ERC721Enumerable.
 */
export async function fetchNFTsViaRPC(
  walletAddress: Address
): Promise<RPCNFTHolding[]> {
  logger.info('Fetching all NFTs via RPC for wallet', { wallet: walletAddress });
  
  const allHoldings: RPCNFTHolding[] = [];
  
  // Fetch from each tracked collection sequentially to avoid overwhelming RPC
  for (const collection of TRACKED_COLLECTIONS) {
    try {
      const holdings = await fetchCollectionNFTs(
        walletAddress,
        collection.address,
        collection.name
      );
      allHoldings.push(...holdings);
    } catch (error) {
      logger.error('Failed to fetch from collection', {
        collection: collection.name,
        error: String(error),
      });
      // Continue with next collection
    }
  }
  
  logger.info('Completed RPC NFT fetch', {
    wallet: walletAddress,
    totalNFTs: allHoldings.length,
    collections: TRACKED_COLLECTIONS.length,
  });
  
  return allHoldings;
}
