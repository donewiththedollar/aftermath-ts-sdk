import {
	SuiAddress,
	TransactionArgument,
	TransactionBlock,
} from "@mysten/sui.js";
import { AftermathApi } from "../../../general/providers/aftermathApi";
import {
	RouterCompleteTradeRoute,
	RouterProtocolName,
	RouterSerializablePool,
} from "../routerTypes";
import { Balance, CoinType, Slippage, SuiNetwork, Url } from "../../../types";
import { createRouterPool } from "../utils/synchronous/interfaces/routerPoolInterface";
import { Router } from "../router";
import { RouterApiInterface } from "../utils/synchronous/interfaces/routerApiInterface";
import { PoolsApi } from "../../pools/api/poolsApi";
import { NojoAmmApi } from "../../external/nojo/nojoAmmApi";
import { DeepBookApi } from "../../external/deepBook/deepBookApi";
import { Helpers } from "../../../general/utils";
import { CetusApi } from "../../external/cetus/cetusApi";
import { TurbosApi } from "../../external/turbos/turbosApi";

export class RouterSynchronousApiHelpers {
	/////////////////////////////////////////////////////////////////////
	//// Constants
	/////////////////////////////////////////////////////////////////////

	private readonly protocolNamesToApi: Record<
		RouterProtocolName,
		() => RouterApiInterface<any>
	> = {
		Aftermath: () => new PoolsApi(this.Provider),
		Nojo: () => new NojoAmmApi(this.Provider),
		DeepBook: () => new DeepBookApi(this.Provider),
		Cetus: () => new CetusApi(this.Provider),
		Turbos: () => new TurbosApi(this.Provider),
	};

	public static readonly constants = {
		defaults: {
			tradePartitionCount: 3,
		},
	};

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	constructor(private readonly Provider: AftermathApi) {
		this.Provider = Provider;
	}

	/////////////////////////////////////////////////////////////////////
	//// Objects
	/////////////////////////////////////////////////////////////////////

	public fetchAllPools = async (inputs: {
		protocols: RouterProtocolName[];
	}): Promise<RouterSerializablePool[]> => {
		const apis = this.protocolApisFromNames(inputs);

		const poolsByProtocol = await Promise.all(
			apis.map((api) => api.fetchAllPools())
		);

		const pools = poolsByProtocol.reduce(
			(arr, acc) => [...acc, ...arr],
			[]
		);

		return pools;
	};

	/////////////////////////////////////////////////////////////////////
	//// Inspections
	/////////////////////////////////////////////////////////////////////

	public fetchSupportedCoins = async (inputs: {
		protocols: RouterProtocolName[];
	}): Promise<CoinType[]> => {
		const apis = this.protocolApisFromNames({
			protocols: inputs.protocols,
		});

		const arrayOfArraysOfCoins = await Promise.all(
			apis.map((api) => api.fetchSupportedCoins())
		);

		const allCoins = arrayOfArraysOfCoins.reduce(
			(arr, acc) => [...acc, ...arr],
			[]
		);
		const coins = Helpers.uniqueArray(allCoins);

		return coins;
	};

	/////////////////////////////////////////////////////////////////////
	//// Transaction Building
	/////////////////////////////////////////////////////////////////////

	public async fetchBuildTransactionForCompleteTradeRoute(inputs: {
		network: SuiNetwork | Url;
		provider: AftermathApi;
		walletAddress: SuiAddress;
		completeRoute: RouterCompleteTradeRoute;
		slippage: Slippage;
	}): Promise<TransactionBlock> {
		const { network, provider, walletAddress, completeRoute, slippage } =
			inputs;

		const referrer = completeRoute.referrer;
		const externalFee = completeRoute.externalFee;
		if (
			externalFee &&
			externalFee.feePercentage >=
				Router.constants.maxExternalFeePercentage
		)
			throw new Error(
				`external fee percentage exceeds max of ${Router.constants.maxExternalFeePercentage}`
			);

		const tx = new TransactionBlock();
		tx.setSender(walletAddress);

		if (referrer)
			this.Provider.ReferralVault().Helpers.addUpdateReferrerCommandToTransaction(
				{
					tx,
					referrer,
				}
			);

		const coinInArg =
			await this.Provider.Coin().Helpers.fetchCoinWithAmountTx({
				tx,
				walletAddress,
				coinType: completeRoute.coinIn.type,
				coinAmount: completeRoute.coinIn.amount,
			});

		let coinsOut: TransactionArgument[] = [];

		const splitCoins = [
			...(completeRoute.routes.length > 1
				? tx.add({
						kind: "SplitCoins",
						coin: coinInArg,
						amounts: completeRoute.routes
							.slice(0, -1)
							.map((route) => tx.pure(route.coinIn.amount)),
				  })
				: []),
			coinInArg,
		];

		for (const [routeIndex, route] of completeRoute.routes.entries()) {
			const splitCoinArg = splitCoins[routeIndex];

			let coinIn: TransactionArgument | undefined = splitCoinArg;

			for (const path of route.paths) {
				const poolForPath = createRouterPool({
					pool: path.pool,
					network,
				});

				if (!coinIn)
					throw new Error(
						"no coin in argument given for router trade command"
					);

				const newCoinIn = poolForPath.addTradeCommandToTransaction({
					provider,
					tx,
					coinIn,
					coinInAmount: route.coinIn.amount,
					coinInType: path.coinIn.type,
					coinOutType: path.coinOut.type,
					expectedAmountOut: path.coinOut.amount,
					slippage,
					referrer,
				});

				coinIn = poolForPath.noHopsAllowed ? undefined : newCoinIn;
			}

			if (coinIn) coinsOut.push(coinIn);
		}

		if (coinsOut.length > 0) {
			const coinOut = coinsOut[0];

			// merge all coinsOut into a single coin
			if (coinsOut.length > 1) tx.mergeCoins(coinOut, coinsOut.slice(1));

			if (externalFee) {
				const feeAmount =
					externalFee.feePercentage *
					Number(completeRoute.coinOut.amount);

				const [feeCoin] = tx.add({
					kind: "SplitCoins",
					coin: coinOut,
					amounts: [tx.pure(feeAmount)],
				});
				tx.transferObjects([feeCoin], tx.pure(externalFee.recipient));
			}

			tx.transferObjects([coinOut], tx.pure(walletAddress));
		}

		return tx;
	}

	/////////////////////////////////////////////////////////////////////
	//// Public Static Methods
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Helpers
	/////////////////////////////////////////////////////////////////////

	public static amountsInForRouterTrade = (inputs: {
		coinInAmount: Balance;
		partitions?: number;
	}): Balance[] => {
		const { coinInAmount } = inputs;

		const partitions =
			inputs.partitions ||
			RouterSynchronousApiHelpers.constants.defaults.tradePartitionCount;

		const coinInPartitionAmount =
			coinInAmount / BigInt(Math.floor(partitions));
		const coinInRemainderAmount =
			coinInAmount % BigInt(Math.floor(partitions));

		const amountsIn = Array(partitions)
			.fill(0)
			.map((_, index) =>
				index === 0
					? coinInRemainderAmount + coinInPartitionAmount
					: BigInt(1 + index) * coinInPartitionAmount
			);

		return amountsIn;
	};

	/////////////////////////////////////////////////////////////////////
	//// Private Methods
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Helpers
	/////////////////////////////////////////////////////////////////////

	private protocolApisFromNames = (inputs: {
		protocols: RouterProtocolName[];
	}): RouterApiInterface<any>[] => {
		const { protocols } = inputs;
		return protocols.map((name) => this.protocolNamesToApi[name]());
	};
}