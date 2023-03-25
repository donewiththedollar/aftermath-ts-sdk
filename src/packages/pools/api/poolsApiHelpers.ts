import {
	GetObjectDataResponse,
	MoveCallTransaction,
	ObjectId,
	SignableTransaction,
	SuiAddress,
	getObjectId,
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
	PoolDynamicFields,
	PoolObject,
	PoolTradeEvent,
	PoolsAddresses,
	AnyObjectType,
} from "../../../types";
import { Coin } from "../../coin/coin";
import { Pools } from "../pools";
import dayjs, { ManipulateType } from "dayjs";
import { CoinApiHelpers } from "../../coin/api/coinApiHelpers";

export class PoolsApiHelpers {
	/////////////////////////////////////////////////////////////////////
	//// Constants
	/////////////////////////////////////////////////////////////////////

	private static readonly constants = {
		moduleNames: {
			pools: "interface",
			math: "math",
			events: "events",
		},
		functions: {
			swap: {
				name: "swap",
				defaultGasBudget: 10000,
			},
			deposit: {
				name: "deposit_X_coins",
				defaultGasBudget: 20000,
			},
			withdraw: {
				name: "withdraw_X_coins",
				defaultGasBudget: 20000,
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
	//// Fetching
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// public Methods
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Move Calls
	/////////////////////////////////////////////////////////////////////

	public spotPriceMoveCall = (
		poolId: ObjectId,
		coinInType: CoinType,
		coinOutType: CoinType,
		lpCoinType: CoinType
	): MoveCallTransaction => {
		return {
			packageObjectId: this.addresses.packages.cmmm,
			module: PoolsApiHelpers.constants.moduleNames.math,
			function: "calc_spot_price",
			typeArguments: [lpCoinType, coinInType, coinOutType],
			arguments: [poolId],
		};
	};

	public tradeAmountOutMoveCall = (
		poolId: ObjectId,
		coinInType: CoinType,
		coinOutType: CoinType,
		lpCoinType: CoinType,
		coinInAmount: bigint
	): MoveCallTransaction => {
		return {
			packageObjectId: this.addresses.packages.cmmm,
			module: PoolsApiHelpers.constants.moduleNames.math,
			function: "calc_swap_amount_out",
			typeArguments: [lpCoinType, coinInType, coinOutType],
			arguments: [poolId, coinInAmount.toString()],
		};
	};

	public depositLpMintAmountMoveCall = (
		poolId: ObjectId,
		lpCoinType: CoinType,
		coinTypes: CoinType[],
		coinAmounts: Balance[]
	): MoveCallTransaction => {
		return {
			packageObjectId: this.addresses.packages.cmmm,
			module: PoolsApiHelpers.constants.moduleNames.math,
			function: "dev_inspect_calc_deposit_lp_mint_amount_u8",
			typeArguments: [lpCoinType],
			arguments: [
				poolId,
				CoinApiHelpers.formatCoinTypesForMoveCall(coinTypes),
				coinAmounts.map((amount) => amount.toString()),
			],
		};
	};

	public withdrawAmountOutMoveCall = (
		poolId: ObjectId,
		lpCoinType: CoinType,
		coinTypes: CoinType[],
		coinAmounts: Balance[]
	): MoveCallTransaction => {
		return {
			packageObjectId: this.addresses.packages.cmmm,
			module: PoolsApiHelpers.constants.moduleNames.math,
			function: "dev_inspect_calc_withdraw_amount_out_u8",
			typeArguments: [lpCoinType],
			arguments: [
				poolId,
				CoinApiHelpers.formatCoinTypesForMoveCall(coinTypes),
				coinAmounts.map((amount) => amount.toString()),
			],
		};
	};

	/////////////////////////////////////////////////////////////////////
	//// Transaction Creation
	/////////////////////////////////////////////////////////////////////

	public tradeTransaction = (
		poolId: ObjectId,
		coinInId: ObjectId,
		coinInType: CoinType,
		coinOutMin: Balance,
		coinOutType: CoinType,
		lpCoinType: CoinType,
		gasBudget: GasBudget = PoolsApiHelpers.constants.functions.swap
			.defaultGasBudget
	): SignableTransaction => {
		return {
			kind: "moveCall",
			data: {
				packageObjectId: this.addresses.packages.cmmm,
				module: PoolsApiHelpers.constants.moduleNames.pools,
				function: "swap",
				typeArguments: [lpCoinType, coinInType, coinOutType],
				arguments: [poolId, coinInId, coinOutMin.toString()],
				gasBudget: gasBudget,
			},
		};
	};

	public singleCoinDepositTransaction = (
		poolId: ObjectId,
		coinId: ObjectId,
		coinType: CoinType,
		lpMintMin: Balance,
		lpCoinType: CoinType,
		gasBudget: GasBudget = PoolsApiHelpers.constants.functions.deposit
			.defaultGasBudget
	): SignableTransaction => {
		return {
			kind: "moveCall",
			data: {
				packageObjectId: this.addresses.packages.cmmm,
				module: PoolsApiHelpers.constants.moduleNames.pools,
				function: "single_coin_deposit",
				typeArguments: [lpCoinType, coinType],
				arguments: [poolId, coinId, lpMintMin.toString()],
				gasBudget: gasBudget,
			},
		};
	};

	public multiCoinDepositTransaction = (
		poolId: ObjectId,
		coinIds: ObjectId[],
		coinTypes: CoinType[],
		lpMintMin: Balance,
		lpCoinType: CoinType,
		gasBudget: GasBudget = PoolsApiHelpers.constants.functions.deposit
			.defaultGasBudget
	): SignableTransaction => {
		const poolSize = coinTypes.length;
		if (poolSize != coinIds.length)
			throw new Error(
				`invalid coinIds size: ${coinIds.length} != ${poolSize}`
			);

		return {
			kind: "moveCall",
			data: {
				packageObjectId: this.addresses.packages.cmmm,
				module: PoolsApiHelpers.constants.moduleNames.pools,
				function: `deposit_${poolSize}_coins`,
				typeArguments: [lpCoinType, ...coinTypes],
				arguments: [poolId, ...coinIds, lpMintMin.toString()],
				gasBudget: gasBudget,
			},
		};
	};

	public singleCoinWithdrawTransaction = (
		poolId: ObjectId,
		lpCoinId: ObjectId,
		lpCoinType: CoinType,
		amountOutMin: Balance,
		coinOutType: CoinType,
		gasBudget: GasBudget = PoolsApiHelpers.constants.functions.withdraw
			.defaultGasBudget
	): SignableTransaction => {
		return {
			kind: "moveCall",
			data: {
				packageObjectId: this.addresses.packages.cmmm,
				module: PoolsApiHelpers.constants.moduleNames.pools,
				function: "single_coin_withdraw",
				typeArguments: [lpCoinType, coinOutType],
				arguments: [poolId, lpCoinId, amountOutMin.toString()],
				gasBudget: gasBudget,
			},
		};
	};

	public multiCoinWithdrawTransaction = (
		poolId: ObjectId,
		lpCoinId: ObjectId,
		lpCoinType: CoinType,
		amountsOutMin: Balance[],
		coinsOutType: CoinType[],
		gasBudget: GasBudget = PoolsApiHelpers.constants.functions.withdraw
			.defaultGasBudget
	): SignableTransaction => {
		const poolSize = coinsOutType.length;
		return {
			kind: "moveCall",
			data: {
				packageObjectId: this.addresses.packages.cmmm,
				module: PoolsApiHelpers.constants.moduleNames.pools,
				function: `withdraw_${poolSize}_coins`,
				typeArguments: [lpCoinType, ...coinsOutType],
				arguments: [
					poolId,
					lpCoinId,
					amountsOutMin.map((amountOutMin) =>
						amountOutMin.toString()
					),
				],
				gasBudget: gasBudget,
			},
		};
	};

	/////////////////////////////////////////////////////////////////////
	//// Transaction Builders
	/////////////////////////////////////////////////////////////////////

	// TODO: abstract i and ii into a new function that can also be called by swap/deposit/withdraw.

	public fetchBuildTradeTransactions = async (
		walletAddress: SuiAddress,
		poolObjectId: ObjectId,
		poolLpType: CoinType,
		fromCoinType: CoinType,
		fromCoinAmount: Balance,
		toCoinType: CoinType
	): Promise<SignableTransaction[]> => {
		// i. obtain object ids of coin to swap from
		const response =
			await this.Provider.Coin().Helpers.fetchSelectCoinSetWithCombinedBalanceGreaterThanOrEqual(
				walletAddress,
				fromCoinType,
				fromCoinAmount
			);

		const coinInId = getObjectId(response[0]);

		let transactions: SignableTransaction[] = [];
		// ii. the user doesn't have a coin of type `fromCoinType` with exact
		// value of `fromCoinAmount`, so we need to create it
		const joinAndSplitTransactions =
			this.Provider.Coin().Helpers.coinJoinAndSplitWithExactAmountTransactions(
				response[0],
				response.slice(1),
				fromCoinType,
				fromCoinAmount
			);

		transactions.push(...joinAndSplitTransactions);

		// iii. trade `coinInId` to for coins of type `toCoinType`
		transactions.push(
			this.tradeTransaction(
				poolObjectId,
				coinInId,
				fromCoinType,
				BigInt(0), // TODO: calc slippage amount
				toCoinType,
				poolLpType
			)
		);

		return transactions;
	};

	public fetchBuildDepositTransactions = async (
		walletAddress: SuiAddress,
		poolObjectId: ObjectId,
		poolLpType: CoinType,
		coinTypes: CoinType[],
		coinAmounts: Balance[]
	): Promise<SignableTransaction[]> => {
		// i. obtain object ids of `coinTypes` to deposit
		const responses = (
			await Promise.all(
				coinTypes.map((coinType, index) =>
					this.Provider.Coin().Helpers.fetchSelectCoinSetWithCombinedBalanceGreaterThanOrEqual(
						walletAddress,
						coinType,
						coinAmounts[index]
					)
				)
			)
		)
			// safe check as responses is guaranteed to not contain undefined
			.filter(
				(response): response is GetObjectDataResponse[] => !!response
			);

		let allCoinIds: ObjectId[] = [];
		let allCoinIdsToJoin: [ObjectId[]] = [[]];

		let transactions: SignableTransaction[] = [];
		// ii. the user doesn't have a coin of type `coinType` with exact
		// value of `coinAmount`, so we need to create it
		responses.forEach((response, index) => {
			const joinAndSplitTransactions =
				this.Provider.Coin().Helpers.coinJoinAndSplitWithExactAmountTransactions(
					response[0],
					response.slice(1),
					coinTypes[index],
					coinAmounts[index]
				);
			if (!joinAndSplitTransactions) return;
			transactions.push(...joinAndSplitTransactions);

			const [coinId, ...coinIdsToJoin] = response.map(
				(getObjectDataResponse) => getObjectId(getObjectDataResponse)
			);
			allCoinIds.push(coinId);
			allCoinIdsToJoin.push(coinIdsToJoin);
		});

		// iii. deposit `allCoinIds` into `pool.objectId`
		transactions.push(
			this.multiCoinDepositTransaction(
				poolObjectId,
				allCoinIds,
				coinTypes,
				BigInt(0), // TODO: calc slippage amount
				poolLpType
			)
		);

		return transactions;
	};

	public fetchBuildWithdrawTransactions = async (
		walletAddress: SuiAddress,
		poolObjectId: ObjectId,
		poolLpType: CoinType,
		lpCoinAmount: Balance,
		coinTypes: CoinType[],
		coinAmounts: Balance[]
	): Promise<SignableTransaction[]> => {
		// i. obtain object ids of `lpCoinType` to burn
		const response =
			await this.Provider.Coin().Helpers.fetchSelectCoinSetWithCombinedBalanceGreaterThanOrEqual(
				walletAddress,
				poolLpType,
				lpCoinAmount
			);

		const lpCoinInId = getObjectId(response[0]);

		let transactions: SignableTransaction[] = [];
		// ii. the user doesn't have a coin of type `fromCoinType` with exact
		// value of `fromCoinAmount`, so we need to create it
		const joinAndSplitTransactions =
			this.Provider.Coin().Helpers.coinJoinAndSplitWithExactAmountTransactions(
				response[0],
				response.slice(1),
				poolLpType,
				lpCoinAmount
			);

		transactions.push(...joinAndSplitTransactions);

		// iii. burn `lpCoinInId` and withdraw a pro-rata amount of the Pool's underlying coins.
		transactions.push(
			this.multiCoinWithdrawTransaction(
				poolObjectId,
				lpCoinInId,
				poolLpType,
				coinAmounts, // TODO: calc slippage amount
				coinTypes
			)
		);

		return transactions;
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
		dynamicFields: PoolDynamicFields,
		prices: number[],
		coinsToDecimals: Record<CoinType, CoinDecimal>
	) => {
		const amountsWithDecimals: number[] = [];
		for (const amountField of dynamicFields.amountFields) {
			const amountWithDecimals = Coin.balanceWithDecimals(
				amountField.value,
				coinsToDecimals[amountField.coin]
			);
			amountsWithDecimals.push(amountWithDecimals);
		}

		const tvl = amountsWithDecimals
			.map((amount, index) => amount * prices[index])
			.reduce((prev, cur) => prev + cur, 0);

		return tvl;
	};

	public calcPoolSupplyPerLps = (dynamicFields: PoolDynamicFields) => {
		const lpSupply = dynamicFields.lpFields[0].value;
		const supplyPerLps = dynamicFields.amountFields.map(
			(field) => Number(field.value) / Number(lpSupply)
		);

		return supplyPerLps;
	};

	public calcPoolLpPrice = (
		dynamicFields: PoolDynamicFields,
		tvl: Number
	) => {
		const lpSupply = dynamicFields.lpFields[0].value;
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
				pool.fields.coins
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