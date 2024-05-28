import { CoinType } from "../../types";
import { CoinDecimal } from "../../types";
import { ObjectId, SuiAddress } from "./generalTypes";

// =========================================================================
//  Name Only
// =========================================================================

export type RpcEndpoint = string;

// =========================================================================
//  All Addresses
// =========================================================================

export interface ConfigAddresses {
	faucet?: FaucetAddresses;
	staking?: StakingAddresses;
	pools?: PoolsAddresses;
	suiFrens?: SuiFrensAddresses;
	nftAmm?: NftAmmAddresses;
	router?: RouterAddresses;
	referralVault?: ReferralVaultAddresses;
	perpetuals?: PerpetualsAddresses;
	oracle?: OracleAddresses;
	farms?: FarmsAddresses;
	dynamicGas?: DynamicGasAddresses;
	scallop?: ScallopAddresses;
	leveragedStaking?: LeveragedStakingAddresses;
}

// =========================================================================
//  Addresses By Package
// =========================================================================

export interface FaucetAddresses {
	packages: {
		faucet: SuiAddress;
		suiFrensGenesisWrapper: SuiAddress;
	};
	objects: {
		faucet: ObjectId;
		faucetRegistry: ObjectId;
		suiFrensMint: ObjectId;
	};
}

export interface StakingAddresses {
	packages: {
		lsd: SuiAddress;
		afsui: SuiAddress;
		events: SuiAddress;
	};
	objects: {
		stakedSuiVault: ObjectId;
		stakedSuiVaultState: ObjectId;
		safe: ObjectId;
		treasury: ObjectId;
		referralVault: ObjectId;
		validatorConfigsTable: ObjectId;
		aftermathValidator: ObjectId;
	};
}

export interface LeveragedStakingAddresses {
	packages: {
		leveragedAfSui: SuiAddress;
		leveragedAfSuiInitial: SuiAddress;
	};
	objects: {
		leveragedAfSuiState: ObjectId;
		afSuiSuiPoolId: ObjectId;
	};
}

export interface PoolsAddresses {
	packages: {
		amm: SuiAddress;
		ammInterface: SuiAddress;
		events: SuiAddress;
	};
	objects: {
		poolRegistry: ObjectId;
		protocolFeeVault: ObjectId;
		treasury: ObjectId;
		insuranceFund: ObjectId;
		lpCoinsTable: ObjectId;
	};
	other?: {
		createLpCoinPackageCompilations: Record<CoinDecimal, string>;
	};
}

export interface SuiFrensAddresses {
	packages: {
		suiFrens: SuiAddress;
		suiFrensBullshark: SuiAddress;
		accessories: SuiAddress;
		suiFrensVault: SuiAddress;
		suiFrensVaultCapyLabsExtension: SuiAddress;
	};
	objects: {
		capyLabsApp: ObjectId;
		suiFrensVault: ObjectId;
		suiFrensVaultStateV1: ObjectId;
		suiFrensVaultStateV1MetadataTable: ObjectId;
		suiFrensVaultCapyLabsExtension: ObjectId;
	};
}

export interface NftAmmAddresses {
	packages: {
		nftAmm: SuiAddress;
	};
	objects: {
		protocolFeeVault: ObjectId;
		treasury: ObjectId;
		insuranceFund: ObjectId;
		referralVault: ObjectId;
	};
}

export interface RouterAddresses {
	packages: {
		utils: SuiAddress;
	};
}

export interface ReferralVaultAddresses {
	packages: {
		referralVault: SuiAddress;
	};
	objects: {
		referralVault: ObjectId;
	};
}

export interface PerpetualsAddresses {
	packages: {
		perpetuals: SuiAddress;
		events: SuiAddress;
	};
	objects: {
		adminCapability: ObjectId;
		registry: ObjectId;
	};
}

export interface FarmsAddresses {
	packages: {
		vaults: SuiAddress;
		vaultsInitial: SuiAddress;
	};
}

export interface DynamicGasAddresses {
	sponsorAddress: SuiAddress;
}

export interface OracleAddresses {
	packages: {
		oracleReader: SuiAddress;
	};
}

export interface ScallopAddresses {
	objects: {
		version: ObjectId;
		afSuiMarket: ObjectId;
		coinDecimalsRegistry: ObjectId;
		xOracle: ObjectId;
	};
}
