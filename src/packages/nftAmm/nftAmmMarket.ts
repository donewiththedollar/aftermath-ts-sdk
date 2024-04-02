import {
	SuiNetwork,
	NftAmmMarketData,
	Balance,
	ObjectId,
	SuiAddress,
	Slippage,
	CoinType,
	AnyObjectType,
	CoinsToBalance,
} from "../../types";
import { Caller } from "../../general/utils/caller";
import { Pool } from "../pools";
import { AftermathApi } from "../../general/providers";
import {
	NftAmmMarketGetAllNfts,
	NftAmmMarketGetNfts,
	NftAmmMarketInterface,
} from "./nftAmmMarketInterface";

export class NftAmmMarket extends Caller {
	// =========================================================================
	//  Private Constants
	// =========================================================================

	private static readonly constants = {};

	// =========================================================================
	//  Public Class Members
	// =========================================================================

	public readonly pool: Pool;

	// =========================================================================
	//  Constructor
	// =========================================================================

	constructor(
		public readonly market: NftAmmMarketData,
		public readonly network?: SuiNetwork,
		private readonly Provider?: AftermathApi
	) {
		super(network, `nft-amm/markets/${market.vault.objectId}`);
		this.market = market;
		this.pool = new Pool(market.pool, network, Provider);
	}

	// =========================================================================
	//  Objects
	// =========================================================================

	getNfts: NftAmmMarketGetNfts = (inputs) => {
		return this.useProvider().fetchNftsInMarketWithCursor({
			...inputs,
			kioskId: this.market.vault.kioskStorage?.ownerCap.forObjectId!,
			kioskOwnerCapId: this.market.vault.kioskStorage?.ownerCap.objectId!,
		});
	};

	getAllNfts: NftAmmMarketGetAllNfts = () => {
		return this.useProvider().fetchNftsInKiosk({
			kioskId: this.market.vault.kioskStorage?.ownerCap.forObjectId!,
			kioskOwnerCapId: this.market.vault.kioskStorage?.ownerCap.objectId!,
		});
	};

	// =========================================================================
	//  Calculations
	// =========================================================================

	public getNftSpotPriceInAfSui = (inputs?: {
		withFees: boolean;
	}): Balance => {
		const assetToFractionalizedSpotPrice =
			this.getAfSuiToFractionalCoinSpotPrice(inputs);

		return BigInt(
			Math.round(
				assetToFractionalizedSpotPrice * Number(this.fractionsAmount())
			)
		);
	};

	public getFractionalCoinToAfSuiSpotPrice = (inputs?: {
		withFees: boolean;
	}): number => {
		return this.pool.getSpotPrice({
			coinInType: this.fractionalCoinType(),
			coinOutType: this.afSuiCoinType(),
			withFees: inputs?.withFees,
		});
	};

	public getAfSuiToFractionalCoinSpotPrice = (inputs?: {
		withFees: boolean;
	}): number => {
		return this.pool.getSpotPrice({
			coinInType: this.afSuiCoinType(),
			coinOutType: this.fractionalCoinType(),
			withFees: inputs?.withFees,
		});
	};

	public getBuyAfSuiAmountIn = (inputs: {
		nftsCount: number;
		// slippage: Slippage;
		referral?: boolean;
	}): Balance => {
		if (inputs.nftsCount <= 0) return BigInt(0);
		const amountIn = this.pool.getTradeAmountIn({
			coinOutAmount: BigInt(inputs.nftsCount) * this.fractionsAmount(),
			coinInType: this.afSuiCoinType(),
			coinOutType: this.fractionalCoinType(),
			referral: inputs.referral,
		});
		return amountIn;
		// increase amount to account for slippage
		// return BigInt(Math.ceil(Number(amountIn) * (1 + inputs.slippage)));
	};

	public getSellAfSuiAmountOut = (inputs: {
		nftsCount: number;
		referral?: boolean;
	}): Balance => {
		if (inputs.nftsCount <= 0) return BigInt(0);
		return this.pool.getTradeAmountOut({
			coinInAmount: BigInt(inputs.nftsCount) * this.fractionsAmount(),
			coinInType: this.fractionalCoinType(),
			coinOutType: this.afSuiCoinType(),
			referral: inputs.referral,
		});
	};

	public getDepositLpAmountOut = (inputs: {
		amountsIn: CoinsToBalance;
		referral?: boolean;
	}): {
		lpAmountOut: Balance;
		lpRatio: number;
	} => {
		return this.pool.getDepositLpAmountOut(inputs);
	};

	public getDepositNftsLpAmountOut = (inputs: {
		nftsCount: number;
		referral?: boolean;
	}): {
		lpAmountOut: Balance;
		lpRatio: number;
	} => {
		if (inputs.nftsCount <= 0)
			return {
				lpAmountOut: BigInt(0),
				lpRatio: 1,
			};
		return this.getDepositLpAmountOut({
			...inputs,
			amountsIn: {
				[this.fractionalCoinType()]:
					BigInt(Math.round(inputs.nftsCount)) *
					this.fractionsAmount(),
			},
		});
	};

	public getWithdrawFractionalCoinAmountOut = (inputs: {
		lpCoinAmount: Balance;
		referral?: boolean;
	}): Balance => {
		const lpRatio = this.pool.getMultiCoinWithdrawLpRatio({
			...inputs,
			lpCoinAmountOut: inputs.lpCoinAmount,
		});
		const amountsOut = this.pool.getWithdrawAmountsOut({
			lpRatio,
			amountsOutDirection: {
				[this.fractionalCoinType()]: this.fractionsAmount(),
			},
			referral: inputs.referral,
		});
		return Object.values(amountsOut)[0];
	};

	public getWithdrawAfSuiAmountOut = (inputs: {
		lpCoinAmount: Balance;
		referral?: boolean;
	}): Balance => {
		const lpRatio = this.pool.getMultiCoinWithdrawLpRatio({
			...inputs,
			lpCoinAmountOut: inputs.lpCoinAmount,
		});
		const amountsOut = this.pool.getWithdrawAmountsOut({
			lpRatio,
			amountsOutDirection: {
				[this.afSuiCoinType()]: BigInt(
					Math.round(
						Number(this.fractionsAmount()) *
							this.getAfSuiToFractionalCoinSpotPrice()
					)
				),
			},
			referral: inputs.referral,
		});
		return Object.values(amountsOut)[0];
	};

	public getWithdrawNftsCountOut = (inputs: {
		lpCoinAmount: Balance;
		referral?: boolean;
	}): number => {
		const fractionalCoinAmountOut =
			this.getWithdrawFractionalCoinAmountOut(inputs);
		return Number(fractionalCoinAmountOut / this.fractionsAmount());
	};

	public getWithdrawLpAmountIn = (inputs: {
		nftsCount: number;
		slippage: Slippage;
		referral?: boolean;
	}): Balance => {
		const amountIn = this.pool.getWithdrawLpAmountIn({
			amountsOut: {
				[this.fractionalCoinType()]:
					this.fractionsAmount() * BigInt(inputs.nftsCount),
			},
			referral: inputs.referral,
		});
		// increase amount to account for slippage
		return BigInt(Math.ceil(Number(amountIn) * (1 + inputs.slippage)));
	};

	// =========================================================================
	//  Getters
	// =========================================================================

	public fractionalCoinType = (): CoinType => {
		return this.market.vault.fractionalCoinType;
	};

	public afSuiCoinType = (): CoinType => {
		return Object.keys(this.market.pool.coins).find(
			(coin) => coin !== this.fractionalCoinType()
		)!;
	};

	public lpCoinType = (): CoinType => {
		return this.market.pool.lpCoinType;
	};

	public nftType = (): AnyObjectType => {
		return this.market.vault.nftType;
	};

	public fractionsAmount = (): Balance => {
		return this.market.vault.fractionsAmount;
	};

	// =========================================================================
	//  Protected Helpers
	// =========================================================================

	protected useProvider = () => {
		const provider = this.Provider?.NftAmm();
		if (!provider) throw new Error("missing AftermathApi Provider");
		return provider;
	};
}
