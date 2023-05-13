import { SuiAddress, TransactionBlock } from "@mysten/sui.js";
import { AftermathApi } from "../../../general/providers/aftermathApi";
import {
	Balance,
	CoinType,
	RouterCompleteTradeRoute,
	RouterExternalFee,
	RouterProtocolName,
	RouterSerializableCompleteGraph,
	Slippage,
	SuiNetwork,
	Url,
	isRouterAsyncProtocolName,
} from "../../../types";
import { RouterGraph } from "../utils/synchronous/routerGraph";
import { RouterAsyncApiHelpers } from "./routerAsyncApiHelpers";
import { RouterSynchronousApiHelpers } from "./routerSynchronousApiHelpers";
import { RouterAsyncGraph } from "../utils/async/routerAsyncGraph";

export class RouterApiHelpers {
	/////////////////////////////////////////////////////////////////////
	//// Constants
	/////////////////////////////////////////////////////////////////////

	public static readonly constants = {
		defaults: {
			tradePartitionCount: 3,
		},
	};

	/////////////////////////////////////////////////////////////////////
	//// Class Members
	/////////////////////////////////////////////////////////////////////

	public readonly SynchronousHelpers;
	public readonly AsyncHelpers;

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	constructor(private readonly Provider: AftermathApi) {
		this.Provider = Provider;

		this.SynchronousHelpers = new RouterSynchronousApiHelpers(Provider);
		this.AsyncHelpers = new RouterAsyncApiHelpers(Provider);
	}

	/////////////////////////////////////////////////////////////////////
	//// Public Methods
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Graph
	/////////////////////////////////////////////////////////////////////

	public fetchSerializableGraph = async (inputs: {
		protocols: RouterProtocolName[];
	}) => {
		const pools = await this.SynchronousHelpers.fetchAllPools(inputs);
		return RouterGraph.createGraph({ pools });
	};

	/////////////////////////////////////////////////////////////////////
	//// Routing
	/////////////////////////////////////////////////////////////////////

	public fetchCompleteTradeRouteGivenAmountIn = async (inputs: {
		protocols: RouterProtocolName[];
		network: SuiNetwork | Url;
		graph: RouterSerializableCompleteGraph;
		coinInType: CoinType;
		coinInAmount: Balance;
		coinOutType: CoinType;
		referrer?: SuiAddress;
		externalFee?: RouterExternalFee;
		// TODO: add options to set all these params ?
		// maxRouteLength?: number,
	}): Promise<RouterCompleteTradeRoute> => {
		if (inputs.protocols.length === 0)
			throw new Error("no protocols set in constructor");

		const { network, graph, coinInAmount } = inputs;

		const coinInAmounts = RouterApiHelpers.amountsInForRouterTrade({
			coinInAmount,
		});

		const tradeResults = await this.AsyncHelpers.fetchTradeResults({
			...inputs,
			protocols: inputs.protocols.filter(isRouterAsyncProtocolName),
			coinInAmounts,
		});

		const routerGraph = new RouterGraph(network, graph);

		if (tradeResults.results.length <= 0)
			return routerGraph.getCompleteRouteGivenAmountIn(inputs);

		const synchronousCompleteRoutes =
			routerGraph.getCompleteRoutesGivenAmountIns({
				...inputs,
				coinInAmounts,
			});

		return RouterAsyncGraph.createFinalCompleteRoute({
			tradeResults,
			synchronousCompleteRoutes,
			coinInAmounts,
		});
	};

	/////////////////////////////////////////////////////////////////////
	//// Transactions
	/////////////////////////////////////////////////////////////////////

	public async fetchTransactionForCompleteTradeRoute(inputs: {
		// TODO: make it so that api can be called with different rpc nodes ?
		network: SuiNetwork | Url;
		provider: AftermathApi;
		walletAddress: SuiAddress;
		completeRoute: RouterCompleteTradeRoute;
		slippage: Slippage;
	}): Promise<TransactionBlock> {
		return this.SynchronousHelpers.fetchBuildTransactionForCompleteTradeRoute(
			inputs
		);
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
			RouterApiHelpers.constants.defaults.tradePartitionCount;

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
}
