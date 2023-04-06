import {
	ObjectId,
	TransactionBlock,
	SuiAddress,
	TransactionArgument,
} from "@mysten/sui.js";
import { EventsApiHelpers } from "../../../general/api/eventsApiHelpers";
import { AftermathApi } from "../../../general/providers/aftermathApi";
import {
	Balance,
	CoinDecimal,
	CoinType,
	GasBudget,
	PoolDataPoint,
	PoolVolumeDataTimeframe,
	PoolVolumeDataTimeframeKey,
	PoolObject,
	PoolTradeEvent,
	PoolsAddresses,
	AnyObjectType,
	PoolCoins,
	CoinsToPrice,
	Slippage,
} from "../../../types";
import { Coin } from "../../coin/coin";
import { Pools } from "../pools";
import dayjs, { ManipulateType } from "dayjs";
import { CmmmCalculations } from "../utils/cmmmCalculations";

export class PoolsApiHelpers {
	/////////////////////////////////////////////////////////////////////
	//// Constants
	/////////////////////////////////////////////////////////////////////

	private static readonly constants = {
		moduleNames: {
			pools: "interface",
			swap: "swap",
			math: "math",
			events: "events",
		},
		functions: {
			swap: {
				name: "swap",
				defaultGasBudget: 100000000,
			},
			deposit: {
				name: "deposit_X_coins",
				defaultGasBudget: 2000000,
			},
			withdraw: {
				name: "withdraw_X_coins",
				defaultGasBudget: 2000000,
			},
			// publish 30000
		},
		eventNames: {
			swap: "SwapEvent",
			deposit: "DepositEvent",
			withdraw: "WithdrawEvent",
		},
	};

	/////////////////////////////////////////////////////////////////////
	//// Class Members
	/////////////////////////////////////////////////////////////////////

	public readonly addresses: PoolsAddresses;
	public readonly eventTypes: {
		trade: AnyObjectType;
		deposit: AnyObjectType;
		withdraw: AnyObjectType;
	};

	public readonly poolVolumeDataTimeframes: Record<
		PoolVolumeDataTimeframeKey,
		PoolVolumeDataTimeframe
	> = {
		"1D": {
			time: 24,
			timeUnit: "hour",
		},
		"1W": {
			time: 7,
			timeUnit: "day",
		},
		"1M": {
			time: 30,
			timeUnit: "day",
		},
		"3M": {
			time: 90,
			timeUnit: "day",
		},
	};

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	constructor(public readonly Provider: AftermathApi) {
		const addresses = this.Provider.addresses.pools;
		if (!addresses)
			throw new Error(
				"not all required addresses have been set in provider"
			);

		this.Provider = Provider;
		this.addresses = addresses;

		this.eventTypes = {
			trade: this.tradeEventType(),
			deposit: this.depositEventType(),
			withdraw: this.withdrawEventType(),
		};
	}

	/////////////////////////////////////////////////////////////////////
	//// Public Methods
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Move Calls
	/////////////////////////////////////////////////////////////////////

	// public spotPriceDevInspectTransaction = (
	// 	poolId: ObjectId,
	// 	coinInType: CoinType,
	// 	coinOutType: CoinType,
	// 	lpCoinType: CoinType
	// ): Transaction => {
	// 	const tx = new Transaction();

	// 	tx.moveCall({
	// 		target: AftermathApi.helpers.transactions.createTransactionTarget(
	// 			this.addresses.packages.cmmm,
	// 			PoolsApiHelpers.constants.moduleNames.math,
	// 			"calc_spot_price"
	// 		),
	// 		typeArguments: [lpCoinType, coinInType, coinOutType],
	// 		arguments: [tx.object(poolId)],
	// 	});

	// 	return tx;
	// };

	// public tradeAmountOutDevInspectTransaction = (
	// 	poolId: ObjectId,
	// 	coinInType: CoinType,
	// 	coinOutType: CoinType,
	// 	lpCoinType: CoinType,
	// 	coinInAmount: bigint
	// ): Transaction => {
	// 	const tx = new Transaction();

	// 	tx.moveCall({
	// 		target: AftermathApi.helpers.transactions.createTransactionTarget(
	// 			this.addresses.packages.cmmm,
	// 			PoolsApiHelpers.constants.moduleNames.math,
	// 			"calc_swap_amount_out"
	// 		),
	// 		typeArguments: [lpCoinType, coinInType, coinOutType],
	// 		arguments: [tx.object(poolId), tx.pure(coinInAmount.toString())],
	// 	});

	// 	return tx;
	// };

	// public depositLpMintAmountDevInspectTransaction = (
	// 	poolId: ObjectId,
	// 	lpCoinType: CoinType,
	// 	coinTypes: CoinType[],
	// 	coinAmounts: Balance[]
	// ): Transaction => {
	// 	return {
	// 		 this.addresses.packages.cmmm,
	// 		 PoolsApiHelpers.constants.moduleNames.math,
	// 		 "dev_inspect_calc_deposit_lp_mint_amount_u8",
	// 		typeArguments: [lpCoinType],
	// 		arguments: [
	// 			poolId,
	// 			CoinApiHelpers.formatCoinTypesForMoveCall(coinTypes),
	// 			coinAmounts.map((amount) => amount.toString()),
	// 		],
	// 	};
	// };

	// public withdrawAmountOutDevInspectTransaction = (
	// 	poolId: ObjectId,
	// 	lpCoinType: CoinType,
	// 	coinTypes: CoinType[],
	// 	coinAmounts: Balance[]
	// ): Transaction => {
	// 	return {
	// 		 this.addresses.packages.cmmm,
	// 		 PoolsApiHelpers.constants.moduleNames.math,
	// 		 "dev_inspect_calc_withdraw_amount_out_u8",
	// 		typeArguments: [lpCoinType],
	// 		arguments: [
	// 			poolId,
	// 			CoinApiHelpers.formatCoinTypesForMoveCall(coinTypes),
	// 			coinAmounts.map((amount) => amount.toString()),
	// 		],
	// 	};
	// };

	/////////////////////////////////////////////////////////////////////
	//// Transaction Creation
	/////////////////////////////////////////////////////////////////////

	public addTradeCommandToTransaction = (
		tx: TransactionBlock,
		poolId: ObjectId,
		coinInId: ObjectId | TransactionArgument,
		coinInType: CoinType,
		expectedAmountOut: Balance,
		coinOutType: CoinType,
		lpCoinType: CoinType,
		slippage: Slippage,
		gasBudget: GasBudget = PoolsApiHelpers.constants.functions.swap
			.defaultGasBudget
	): TransactionBlock => {
		tx.add({
			kind: "MoveCall",
			target: AftermathApi.helpers.transactions.createTransactionTarget(
				this.addresses.packages.cmmm,
				PoolsApiHelpers.constants.moduleNames.pools,
				"swap_exact_in"
			),
			typeArguments: [lpCoinType, coinInType, coinOutType],
			arguments: [
				tx.object(poolId),
				tx.object(
					this.Provider.addresses.aftermath.objects.protocolFeeVault
				),
				tx.object(this.Provider.addresses.aftermath.objects.treasury),
				tx.object(
					this.Provider.addresses.aftermath.objects.insuranceFund
				),
				typeof coinInId === "string" ? tx.object(coinInId) : coinInId,
				tx.pure(expectedAmountOut.toString()),
				tx.pure(Pools.normalizeSlippage(slippage)),
			],
		});
		tx.setGasBudget(gasBudget);

		return tx;
	};

	public addTradeCommandWithCoinOutToTransaction = (
		tx: TransactionBlock,
		poolId: ObjectId,
		coinInId: ObjectId | TransactionArgument,
		coinInType: CoinType,
		expectedAmountOut: Balance,
		coinOutType: CoinType,
		lpCoinType: CoinType,
		slippage: Slippage,
		gasBudget: GasBudget = PoolsApiHelpers.constants.functions.swap
			.defaultGasBudget
	): {
		tx: TransactionBlock;
		coinOut: TransactionArgument;
	} => {
		const [coinOut] = tx.add({
			kind: "MoveCall",
			target: AftermathApi.helpers.transactions.createTransactionTarget(
				this.addresses.packages.cmmm,
				PoolsApiHelpers.constants.moduleNames.swap,
				"swap_exact_in"
			),
			typeArguments: [lpCoinType, coinInType, coinOutType],
			arguments: [
				tx.object(poolId),
				tx.object(
					this.Provider.addresses.aftermath.objects.protocolFeeVault
				),
				tx.object(this.Provider.addresses.aftermath.objects.treasury),
				tx.object(
					this.Provider.addresses.aftermath.objects.insuranceFund
				),
				typeof coinInId === "string" ? tx.object(coinInId) : coinInId,
				tx.pure(expectedAmountOut.toString()),
				tx.pure(Pools.normalizeSlippage(slippage)),
			],
		});
		tx.setGasBudget(gasBudget);

		return {
			tx,
			coinOut,
		};
	};

	public addMultiCoinDepositCommandToTransaction = (
		tx: TransactionBlock,
		poolId: ObjectId,
		coinIds: ObjectId[] | TransactionArgument[],
		coinTypes: CoinType[],
		expectedLpRatio: Balance,
		lpCoinType: CoinType,
		slippage: Slippage,
		gasBudget: GasBudget = PoolsApiHelpers.constants.functions.deposit
			.defaultGasBudget
	): TransactionBlock => {
		const poolSize = coinTypes.length;
		if (poolSize != coinIds.length)
			throw new Error(
				`invalid coinIds size: ${coinIds.length} != ${poolSize}`
			);

		tx.add({
			kind: "MoveCall",
			target: AftermathApi.helpers.transactions.createTransactionTarget(
				this.addresses.packages.cmmm,
				PoolsApiHelpers.constants.moduleNames.pools,
				`deposit_${poolSize}_coins`
			),
			typeArguments: [lpCoinType, ...coinTypes],
			arguments: [
				tx.object(poolId),
				tx.object(
					this.Provider.addresses.aftermath.objects.protocolFeeVault
				),
				tx.object(this.Provider.addresses.aftermath.objects.treasury),
				tx.object(
					this.Provider.addresses.aftermath.objects.insuranceFund
				),
				...coinIds.map((coinId) =>
					typeof coinId === "string" ? tx.object(coinId) : coinId
				),
				tx.pure(expectedLpRatio.toString()),
				tx.pure(Pools.normalizeSlippage(slippage)),
			],
		});
		tx.setGasBudget(gasBudget);

		return tx;
	};

	public addMultiCoinWithdrawCommandToTransaction = (
		tx: TransactionBlock,
		poolId: ObjectId,
		lpCoinId: ObjectId | TransactionArgument,
		lpCoinType: CoinType,
		expectedAmountsOut: Balance[],
		coinsOutType: CoinType[],
		slippage: Slippage,
		gasBudget: GasBudget = PoolsApiHelpers.constants.functions.withdraw
			.defaultGasBudget
	): TransactionBlock => {
		const poolSize = coinsOutType.length;

		tx.add({
			kind: "MoveCall",
			target: AftermathApi.helpers.transactions.createTransactionTarget(
				this.addresses.packages.cmmm,
				PoolsApiHelpers.constants.moduleNames.pools,
				`withdraw_${poolSize}_coins`
			),
			typeArguments: [lpCoinType, ...coinsOutType],
			arguments: [
				tx.object(poolId),
				tx.object(
					this.Provider.addresses.aftermath.objects.protocolFeeVault
				),
				tx.object(this.Provider.addresses.aftermath.objects.treasury),
				tx.object(
					this.Provider.addresses.aftermath.objects.insuranceFund
				),
				typeof lpCoinId === "string" ? tx.object(lpCoinId) : lpCoinId,
				tx.pure(expectedAmountsOut.map((amount) => amount.toString())),
				tx.pure(Pools.normalizeSlippage(slippage)),
			],
		});
		tx.setGasBudget(gasBudget);

		return tx;
	};

	/////////////////////////////////////////////////////////////////////
	//// Transaction Builders
	/////////////////////////////////////////////////////////////////////

	// TODO: abstract i and ii into a new function that can also be called by swap/deposit/withdraw.

	public fetchBuildTradeTransaction = async (
		walletAddress: SuiAddress,
		poolObjectId: ObjectId,
		poolLpType: CoinType,
		fromCoinType: CoinType,
		fromCoinAmount: Balance,
		toCoinType: CoinType,
		slippage: Slippage
	): Promise<TransactionBlock> => {
		const tx = new TransactionBlock();

		const { coinArgument, txWithCoinWithAmount } =
			await this.Provider.Coin().Helpers.fetchAddCoinWithAmountCommandsToTransaction(
				tx,
				walletAddress,
				fromCoinType,
				fromCoinAmount
			);

		const amountOut = CmmmCalculations.calcOutGivenIn();

		const finalTx = this.addTradeCommandToTransaction(
			txWithCoinWithAmount,
			poolObjectId,
			coinArgument,
			fromCoinType,
			amountOut,
			toCoinType,
			poolLpType,
			slippage
		);

		return finalTx;
	};

	public fetchBuildDepositTransaction = async (
		walletAddress: SuiAddress,
		poolObjectId: ObjectId,
		poolLpType: CoinType,
		coinTypes: CoinType[],
		coinAmounts: Balance[],
		slippage: Slippage
	): Promise<TransactionBlock> => {
		const tx = new TransactionBlock();

		const { coinArguments, txWithCoinsWithAmount } =
			await this.Provider.Coin().Helpers.fetchAddCoinsWithAmountCommandsToTransaction(
				tx,
				walletAddress,
				coinTypes,
				coinAmounts
			);

		const expectedLpRatio = CmmmCalculations.

		const finalTx = this.addMultiCoinDepositCommandToTransaction(
			txWithCoinsWithAmount,
			poolObjectId,
			coinArguments,
			coinTypes,
			expectedLpRatio,
			poolLpType,
			slippage
		);

		return finalTx;
	};

	public fetchBuildWithdrawTransaction = async (
		walletAddress: SuiAddress,
		poolObjectId: ObjectId,
		poolLpType: CoinType,
		coinTypes: CoinType[],
		coinAmounts: Balance[],
		slippage: Slippage
	): Promise<TransactionBlock> => {
		const tx = new TransactionBlock();

		const lpCoinAmount = CmmmCalculations.

		const { coinArgument: lpCoinArgument, txWithCoinWithAmount } =
			await this.Provider.Coin().Helpers.fetchAddCoinWithAmountCommandsToTransaction(
				tx,
				walletAddress,
				poolLpType,
				lpCoinAmount
			);

		const finalTx = this.addMultiCoinWithdrawCommandToTransaction(
			txWithCoinWithAmount,
			poolObjectId,
			lpCoinArgument,
			poolLpType,
			coinAmounts, // TODO: calc slippage amount
			coinTypes,
			slippage
		);

		return finalTx;
	};

	/////////////////////////////////////////////////////////////////////
	//// Stats
	/////////////////////////////////////////////////////////////////////

	// NOTE: should this volume calculation also take into account deposits and withdraws
	// (not just swaps) ?
	public fetchCalcPoolVolume = (
		poolObjectId: ObjectId,
		poolCoins: CoinType[],
		tradeEvents: PoolTradeEvent[],
		prices: number[],
		coinsToDecimals: Record<CoinType, CoinDecimal>
	) => {
		const tradesForPool = tradeEvents.filter(
			(trade) => trade.poolId === poolObjectId
		);

		let volume = 0;
		for (const trade of tradesForPool) {
			const decimals = coinsToDecimals[trade.typeIn];
			const tradeAmount = Coin.balanceWithDecimals(
				trade.amountIn,
				decimals
			);

			const priceIndex = poolCoins.findIndex(
				(coin) => coin === trade.typeIn
			);
			const coinInPrice = prices[priceIndex];

			const amountUsd = tradeAmount * coinInPrice;
			volume += amountUsd;
		}

		return volume;
	};

	public fetchCalcPoolTvl = async (
		poolCoins: PoolCoins,
		prices: CoinsToPrice,
		coinsToDecimals: Record<CoinType, CoinDecimal>
	) => {
		const amountsWithDecimals: number[] = [];
		for (const [poolCoinType, poolCoin] of Object.entries(poolCoins)) {
			const amountWithDecimals = Coin.balanceWithDecimals(
				poolCoin.balance,
				coinsToDecimals[poolCoinType]
			);
			amountsWithDecimals.push(amountWithDecimals);
		}

		const tvl = amountsWithDecimals
			.map((amount, index) => amount * prices[index])
			.reduce((prev, cur) => prev + cur, 0);

		return tvl;
	};

	public calcPoolSupplyPerLps = (poolCoins: PoolCoins, lpSupply: Balance) => {
		const supplyPerLps = Object.values(poolCoins).map(
			(poolCoin) => Number(poolCoin.balance) / Number(lpSupply)
		);

		return supplyPerLps;
	};

	public calcPoolLpPrice = (lpSupply: Balance, tvl: number) => {
		const lpCoinDecimals = Pools.constants.lpCoinDecimals;
		const lpPrice = Number(
			Number(tvl) / Coin.balanceWithDecimals(lpSupply, lpCoinDecimals)
		);

		return lpPrice;
	};

	/////////////////////////////////////////////////////////////////////
	//// Prices
	/////////////////////////////////////////////////////////////////////

	public findPriceForCoinInPool = (
		coin: CoinType,
		lpCoins: CoinType[],
		nonLpCoins: CoinType[],
		lpPrices: number[],
		nonLpPrices: number[]
	) => {
		if (Pools.isLpCoin(coin)) {
			const index = lpCoins.findIndex((lpCoin) => lpCoin === coin);
			return lpPrices[index];
		}

		const index = nonLpCoins.findIndex((nonLpCoin) => nonLpCoin === coin);
		return nonLpPrices[index];
	};

	/////////////////////////////////////////////////////////////////////
	//// Graph Data
	/////////////////////////////////////////////////////////////////////

	public fetchCalcPoolVolumeData = async (
		pool: PoolObject,
		tradeEvents: PoolTradeEvent[],
		timeUnit: ManipulateType,
		time: number,
		buckets: number
	) => {
		// TODO: use promise.all for pool fetching and swap fetching

		const coinsToDecimalsAndPrices =
			await this.Provider.Coin().Helpers.fetchCoinsToDecimalsAndPrices(
				Object.keys(pool.coins)
			);

		const now = Date.now();
		const maxTimeAgo = dayjs(now).subtract(time, timeUnit);
		const timeGap = dayjs(now).diff(maxTimeAgo);

		const bucketTimestampSize = timeGap / buckets;
		const emptyDataPoints: PoolDataPoint[] = Array(buckets)
			.fill({
				time: 0,
				value: 0,
			})
			.map((dataPoint, index) => {
				return {
					...dataPoint,
					time: maxTimeAgo.valueOf() + index * bucketTimestampSize,
				};
			});

		const dataPoints = tradeEvents.reduce((acc, trade) => {
			const bucketIndex =
				acc.length -
				Math.floor(
					dayjs(now).diff(trade.timestamp) / bucketTimestampSize
				) -
				1;
			const amountUsd = Coin.balanceWithDecimalsUsd(
				trade.amountIn,
				coinsToDecimalsAndPrices[trade.typeIn].decimals,
				coinsToDecimalsAndPrices[trade.typeIn].price
			);

			acc[bucketIndex].value += amountUsd;

			return acc;
		}, emptyDataPoints);

		return dataPoints;
	};

	/////////////////////////////////////////////////////////////////////
	//// Private
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Event Types
	/////////////////////////////////////////////////////////////////////

	private tradeEventType = () =>
		EventsApiHelpers.createEventType(
			this.addresses.packages.cmmm,
			PoolsApiHelpers.constants.moduleNames.events,
			PoolsApiHelpers.constants.eventNames.swap
		);

	private depositEventType = () =>
		EventsApiHelpers.createEventType(
			this.addresses.packages.cmmm,
			PoolsApiHelpers.constants.moduleNames.events,
			PoolsApiHelpers.constants.eventNames.deposit
		);

	private withdrawEventType = () =>
		EventsApiHelpers.createEventType(
			this.addresses.packages.cmmm,
			PoolsApiHelpers.constants.moduleNames.events,
			PoolsApiHelpers.constants.eventNames.withdraw
		);
}
