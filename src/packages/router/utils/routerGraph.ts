import { CoinType } from "../../coin/coinTypes";
import { Helpers } from "../../../general/utils/helpers";
import {
	Balance,
	RouterCompleteTradeRoute,
	RouterExternalFee,
	RouterTradeCoin,
	RouterTradeInfo,
	RouterTradePath,
	RouterTradeRoute,
	UniqueId,
} from "../../../types";
import { RouterPoolInterface } from "./routerPoolInterface";
import { SuiAddress } from "@mysten/sui.js";
import { Router } from "../router";

/////////////////////////////////////////////////////////////////////
//// Internal Types
/////////////////////////////////////////////////////////////////////

interface CoinGraph {
	coinNodes: CoinNodes;
	pools: PoolsById;
}

type CoinNodes = Record<CoinType, CoinNode>;
type PoolsById = Record<UniqueId, RouterPoolInterface>;

interface CoinNode {
	coin: CoinType;
	coinOutThroughPoolEdges: CoinOutThroughPoolEdges;
}

type CoinOutThroughPoolEdges = Record<CoinType, UniqueId[]>;

type CompleteTradeRoute = {
	routes: TradeRoute[];
} & TradeInfo;

type TradeRoute = {
	paths: TradePath[];
} & TradeInfo;

type TradePath = TradeInfo & {
	poolUid: UniqueId;
};

type TradeInfo = RouterTradeInfo & {
	estimatedGasCost: Balance; // in SUI
};

/////////////////////////////////////////////////////////////////////
//// Class
/////////////////////////////////////////////////////////////////////

export class RouterGraph {
	/////////////////////////////////////////////////////////////////////
	//// Private Static Contstants
	/////////////////////////////////////////////////////////////////////

	private static readonly constants = {
		// NOTE: should these default values be public ?
		defaultMaxRouteLength: 3,
		tradePartitionCount: 10,
		minRoutesToCheck: 20,
		maxGasCost: BigInt(1_000_000_000), // 1 SUI
	};

	/////////////////////////////////////////////////////////////////////
	//// Private Class Members
	/////////////////////////////////////////////////////////////////////

	private readonly graph: CoinGraph;

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	constructor(public readonly pools: RouterPoolInterface[]) {
		this.pools = pools;
		this.graph = RouterGraph.createGraph(pools);
	}

	/////////////////////////////////////////////////////////////////////
	//// Public Methods
	/////////////////////////////////////////////////////////////////////

	public getCompleteRouteGivenAmountIn(
		coinIn: CoinType,
		coinInAmount: Balance,
		coinOut: CoinType,
		referrer?: SuiAddress,
		externalFee?: RouterExternalFee
	): RouterCompleteTradeRoute {
		return this.getCompleteRoute(
			coinIn,
			coinInAmount,
			coinOut,
			false,
			referrer,
			externalFee
		);
	}

	public getCompleteRouteGivenAmountOut(
		coinIn: CoinType,
		coinOut: CoinType,
		coinOutAmount: Balance,
		referrer?: SuiAddress,
		externalFee?: RouterExternalFee
	): RouterCompleteTradeRoute {
		return this.getCompleteRoute(
			coinIn,
			coinOutAmount,
			coinOut,
			true,
			referrer,
			externalFee
		);
	}

	/////////////////////////////////////////////////////////////////////
	//// Private Methods
	/////////////////////////////////////////////////////////////////////

	private getCompleteRoute(
		coinIn: CoinType,
		coinInAmount: Balance,
		coinOut: CoinType,
		isGivenAmountOut: boolean,
		referrer?: SuiAddress,
		externalFee?: RouterExternalFee,
		maxRouteLength: number = RouterGraph.constants.defaultMaxRouteLength
	): RouterCompleteTradeRoute {
		if (this.pools.length <= 0) throw new Error("pools has length of 0");
		if (
			externalFee &&
			externalFee.feePercentage >=
				Router.constants.maxExternalFeePercentage
		)
			throw new Error(
				`external fee percentage exceeds max of ${Router.constants.maxExternalFeePercentage}`
			);

		const routes = RouterGraph.findRoutes(
			Helpers.deepCopy(this.graph),
			coinIn,
			coinOut,
			maxRouteLength,
			isGivenAmountOut
		);

		const routesAfterTrades = RouterGraph.splitTradeBetweenRoutes(
			Helpers.deepCopy(this.graph),
			routes,
			coinInAmount,
			isGivenAmountOut,
			referrer
		);

		const completeRoute = RouterGraph.completeRouteFromRoutes(
			routesAfterTrades,
			coinIn,
			coinInAmount,
			coinOut
		);

		const transformedRoute = isGivenAmountOut
			? RouterGraph.transformCompleteRouteIfGivenAmountOut(completeRoute)
			: completeRoute;

		const completeTradeRoute =
			RouterGraph.routerCompleteTradeRouteFromCompleteTradeRoute(
				transformedRoute,
				this.graph.pools,
				referrer,
				externalFee
			);

		return completeTradeRoute;
	}

	/////////////////////////////////////////////////////////////////////
	//// Private Static Methods
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Graph Creation
	/////////////////////////////////////////////////////////////////////

	private static createGraph(pools: RouterPoolInterface[]): CoinGraph {
		const graph: CoinGraph = pools.reduce(
			(graph, pool) => {
				const coinNodes = this.updateCoinNodesFromPool(
					graph.coinNodes,
					pool
				);
				const pools: PoolsById = {
					...graph.pools,
					[pool.uid]: pool,
				};

				return {
					coinNodes,
					pools,
				};
			},
			{
				coinNodes: {},
				pools: {},
			}
		);
		return graph;
	}

	private static updateCoinNodesFromPool = (
		coinNodes: CoinNodes,
		pool: RouterPoolInterface
	): CoinNodes => {
		const coinTypes = pool.coinTypes;
		const uid = pool.uid;

		let newCoinNodes: CoinNodes = { ...coinNodes };

		for (const coinA of coinTypes) {
			for (const coinB of coinTypes) {
				if (coinA === coinB) continue;

				newCoinNodes =
					coinA in newCoinNodes
						? {
								...newCoinNodes,
								[coinA]: {
									...newCoinNodes[coinA],
									coinOutThroughPoolEdges:
										coinB in
										newCoinNodes[coinA]
											.coinOutThroughPoolEdges
											? {
													...newCoinNodes[coinA]
														.coinOutThroughPoolEdges,
													[coinB]:
														Helpers.uniqueArray([
															...newCoinNodes[
																coinA
															]
																.coinOutThroughPoolEdges[
																coinB
															],
															uid,
														]),
											  }
											: {
													...newCoinNodes[coinA]
														.coinOutThroughPoolEdges,
													[coinB]: [uid],
											  },
								},
						  }
						: {
								...newCoinNodes,
								[coinA]: {
									coin: coinA,
									coinOutThroughPoolEdges: {
										[coinB]: [uid],
									},
								},
						  };
			}
		}

		return newCoinNodes;
	};

	/////////////////////////////////////////////////////////////////////
	//// Route Finding
	/////////////////////////////////////////////////////////////////////

	private static findRoutes = (
		graph: CoinGraph,
		coinIn: CoinType,
		coinOut: CoinType,
		maxRouteLength: number,
		isGivenAmountOut: boolean
	): TradeRoute[] => {
		const coinInEdges = graph.coinNodes[coinIn].coinOutThroughPoolEdges;
		const startingRoutes = this.createStartingRoutes(
			graph.pools,
			coinInEdges,
			coinIn,
			coinOut
		);

		const routes = this.findCompleteRoutes(
			graph,
			startingRoutes,
			coinOut,
			maxRouteLength,
			isGivenAmountOut
		);

		return routes;
	};

	private static createStartingRoutes = (
		pools: PoolsById,
		coinInEdges: CoinOutThroughPoolEdges,
		coinIn: CoinType,
		// NOTE: should this really be unused ?
		coinOut: CoinType
	): TradeRoute[] => {
		let routes: TradeRoute[] = [];
		for (const [coinOut, throughPools] of Object.entries(coinInEdges)) {
			for (const poolUid of throughPools) {
				const pool = pools[poolUid];
				routes.push({
					estimatedGasCost: pool.expectedGasCostPerHop,
					coinIn: {
						type: coinIn,
						amount: BigInt(0),
						tradeFee: BigInt(0),
					},
					coinOut: {
						type: coinOut,
						amount: BigInt(0),
						tradeFee: BigInt(0),
					},
					spotPrice: 0,
					paths: [
						{
							poolUid: pool.uid,
							estimatedGasCost: pool.expectedGasCostPerHop,
							coinIn: {
								type: coinIn,
								amount: BigInt(0),
								tradeFee: BigInt(0),
							},
							coinOut: {
								type: coinOut,
								amount: BigInt(0),
								tradeFee: BigInt(0),
							},
							spotPrice: 0,
						},
					],
				});
			}
		}

		return routes;
	};

	private static findCompleteRoutes = (
		graph: CoinGraph,
		routes: TradeRoute[],
		coinOut: CoinType,
		maxRouteLength: number,
		isGivenAmountOut: boolean
	): TradeRoute[] => {
		let currentRoutes = [...routes];
		let completeRoutes: TradeRoute[] = [];

		while (currentRoutes.length > 0) {
			let newCurrentRoutes: TradeRoute[] = [];

			for (const route of currentRoutes) {
				const lastPath = route.paths[route.paths.length - 1];

				if (lastPath.coinOut.type === coinOut) {
					completeRoutes = [...completeRoutes, route];
					continue;
				}

				if (route.paths.length >= maxRouteLength) continue;

				for (const [coinOut, throughPools] of Object.entries(
					graph.coinNodes[lastPath.coinOut.type]
						.coinOutThroughPoolEdges
				)) {
					for (const poolUid of throughPools) {
						if (
							// route.paths.some(
							// 	// NOTE: would it ever make sense to go back into a pool ?
							// 	// (could relax this restriction)
							// 	(path) => path.poolUid === poolUid
							// )
							lastPath.poolUid === poolUid
						)
							continue;

						const pool = graph.pools[poolUid];
						const newRoute: TradeRoute = {
							...route,
							paths: [
								...route.paths,
								{
									poolUid: pool.uid,
									estimatedGasCost:
										pool.expectedGasCostPerHop,
									coinIn: lastPath.coinOut,
									coinOut: {
										type: coinOut,
										amount: BigInt(0),
										tradeFee: BigInt(0),
									},
									spotPrice: 0,
								},
							],
						};

						newCurrentRoutes = [...newCurrentRoutes, newRoute];
					}
				}
			}
			currentRoutes = [...newCurrentRoutes];
		}

		if (completeRoutes.length === 0)
			throw new Error("no routes found for this coin pair");

		const finalRoutes = isGivenAmountOut
			? completeRoutes.map((route) => {
					const newRoute = Helpers.deepCopy(route);
					return {
						...newRoute,
						paths: newRoute.paths.reverse(),
					};
			  })
			: completeRoutes;
		return finalRoutes;
	};

	private static splitTradeBetweenRoutes = (
		graph: CoinGraph,
		routes: TradeRoute[],
		coinInAmount: Balance,
		isGivenAmountOut: boolean,
		referrer?: SuiAddress
	): TradeRoute[] => {
		const coinInPartitionAmount =
			coinInAmount /
			BigInt(Math.floor(this.constants.tradePartitionCount));
		const coinInRemainderAmount =
			coinInAmount %
			BigInt(Math.floor(this.constants.tradePartitionCount));

		let currentPools = graph.pools;
		let currentRoutes = routes;

		const emptyArray = Array(this.constants.tradePartitionCount).fill(
			undefined
		);

		const linearCutStepSize =
			(routes.length - this.constants.minRoutesToCheck) /
			this.constants.tradePartitionCount;

		for (const [i] of emptyArray.entries()) {
			const { updatedPools, updatedRoutes } =
				this.findNextRouteAndUpdatePoolsAndRoutes(
					Helpers.deepCopy(currentPools),
					Helpers.deepCopy(currentRoutes),
					i === 0
						? coinInRemainderAmount + coinInPartitionAmount
						: coinInPartitionAmount,
					linearCutStepSize,
					isGivenAmountOut,
					referrer
				);

			currentPools = Helpers.deepCopy(updatedPools);
			currentRoutes = Helpers.deepCopy(updatedRoutes);
		}

		return currentRoutes;
	};

	private static findNextRouteAndUpdatePoolsAndRoutes = (
		pools: PoolsById,
		routes: TradeRoute[],
		coinInAmount: Balance,
		linearCutStepSize: number,
		isGivenAmountOut: boolean,
		referrer?: SuiAddress
	): {
		updatedPools: PoolsById;
		updatedRoutes: TradeRoute[];
	} => {
		const currentGasCost = this.gasCostForRoutes(routes);

		const routesAndPools = routes.map((route) =>
			this.getUpdatedPoolsAndRouteAfterTrade(
				Helpers.deepCopy(pools),
				Helpers.deepCopy(route),
				coinInAmount,
				currentGasCost,
				isGivenAmountOut,
				referrer
			)
		);
		const updatedRoutesAndPools = routesAndPools.filter(
			(data) => data !== undefined
		) as {
			updatedPools: PoolsById;
			updatedRoute: TradeRoute;
			coinOutAmount: Balance;
			startingRoute: TradeRoute;
			isOverMaxGasCost: boolean;
		}[];

		const routesAndPoolsUnderGasCost = updatedRoutesAndPools.filter(
			(data) => !data.isOverMaxGasCost
		);
		if (routesAndPoolsUnderGasCost.length > 0)
			return this.cutUpdatedRoutesAndPools(
				Helpers.deepCopy(routesAndPoolsUnderGasCost),
				isGivenAmountOut
				// "LINEAR",
				// linearCutStepSize
			);

		const routesAndPoolsOverGasCost = updatedRoutesAndPools.filter(
			(data) => data.isOverMaxGasCost
		);
		if (routesAndPoolsOverGasCost.length > 0)
			return this.cutUpdatedRoutesAndPools(
				Helpers.deepCopy(routesAndPoolsOverGasCost),
				isGivenAmountOut
				// "LINEAR",
				// linearCutStepSize
			);

		throw Error("unable to find route");
	};

	private static cutUpdatedRoutesAndPools = (
		routesAndPools: {
			updatedPools: PoolsById;
			updatedRoute: TradeRoute;
			coinOutAmount: Balance;
			startingRoute: TradeRoute;
		}[],
		isGivenAmountOut: boolean,
		routeDecreaseType: "QUADRATIC" | "LINEAR" = "QUADRATIC",
		linearCutStepSize?: number
	): {
		updatedRoutes: TradeRoute[];
		updatedPools: PoolsById;
		coinOutAmount: Balance;
	} => {
		if (routeDecreaseType === "LINEAR" && linearCutStepSize === undefined)
			throw new Error("linear cut step size has not been provided");

		// TODO: speed this up further by not sorting routesAndPools is already at minRoutesToCheck length

		const sortedRoutesAndPoolsByAmountOut = routesAndPools.sort((a, b) =>
			isGivenAmountOut
				? Number(a.coinOutAmount - b.coinOutAmount)
				: Number(b.coinOutAmount - a.coinOutAmount)
		);

		const firstUnusedRouteIndex = sortedRoutesAndPoolsByAmountOut.findIndex(
			(route) => route.startingRoute.coinOut.amount <= BigInt(0)
		);

		let newEndIndex;
		if (routeDecreaseType === "QUADRATIC") {
			const minRouteIndexToCheck =
				firstUnusedRouteIndex > this.constants.minRoutesToCheck
					? firstUnusedRouteIndex
					: this.constants.minRoutesToCheck;

			newEndIndex = Math.floor(
				(minRouteIndexToCheck +
					sortedRoutesAndPoolsByAmountOut.length) /
					2
			);
		} else {
			newEndIndex =
				sortedRoutesAndPoolsByAmountOut.length -
				(linearCutStepSize ?? 0);
		}

		const cutRoutesAndPools = sortedRoutesAndPoolsByAmountOut.slice(
			0,
			newEndIndex > sortedRoutesAndPoolsByAmountOut.length
				? sortedRoutesAndPoolsByAmountOut.length
				: newEndIndex < this.constants.minRoutesToCheck
				? this.constants.minRoutesToCheck
				: newEndIndex
		);

		const updatedRoutes = [
			cutRoutesAndPools[0].updatedRoute,
			...cutRoutesAndPools
				.slice(1)
				.map((udpatedData) => udpatedData.startingRoute),
		];

		return {
			updatedPools: cutRoutesAndPools[0].updatedPools,
			updatedRoutes,
			coinOutAmount: cutRoutesAndPools[0].updatedRoute.coinOut.amount,
		};
	};

	private static getUpdatedPoolsAndRouteAfterTrade = (
		pools: PoolsById,
		route: TradeRoute,
		coinInAmount: Balance,
		currentGasCost: Balance,
		isGivenAmountOut: boolean,
		referrer?: SuiAddress
	):
		| {
				updatedPools: PoolsById;
				updatedRoute: TradeRoute;
				coinOutAmount: Balance;
				startingRoute: TradeRoute;
				isOverMaxGasCost: boolean;
		  }
		| undefined => {
		const originalRoute = Helpers.deepCopy(route);

		const isOverMaxGasCost =
			originalRoute.coinIn.amount <= BigInt(0) &&
			this.gasCostForRoute(originalRoute) + currentGasCost >
				this.constants.maxGasCost;

		let currentPools = Helpers.deepCopy(pools);
		let currentCoinInAmount = coinInAmount;
		let newRoute: TradeRoute = { ...originalRoute, paths: [] };
		let routeSpotPrice = 1;

		try {
			for (const path of originalRoute.paths) {
				const pool = currentPools[path.poolUid];

				const spotPrice = pool.getSpotPrice({
					coinInType: path.coinIn.type,
					coinOutType: path.coinOut.type,
				});

				const poolBeforePathTrades = pool.getUpdatedPoolAfterTrade(
					isGivenAmountOut
						? {
								coinIn: path.coinIn.type,
								coinInAmount: -path.coinIn.amount,
								coinOut: path.coinOut.type,
								coinOutAmount: -path.coinOut.amount,
						  }
						: {
								coinIn: path.coinIn.type,
								coinInAmount: -path.coinOut.amount,
								coinOut: path.coinOut.type,
								coinOutAmount: -path.coinIn.amount,
						  }
				);

				const totalCoinInAmount =
					currentCoinInAmount + path.coinIn.amount;

				const totalCoinOutAmount = isGivenAmountOut
					? poolBeforePathTrades.getTradeAmountIn({
							coinInType: path.coinIn.type,
							coinOutType: path.coinOut.type,
							coinOutAmount: totalCoinInAmount,
							referrer,
					  })
					: poolBeforePathTrades.getTradeAmountOut({
							coinInType: path.coinIn.type,
							coinOutType: path.coinOut.type,
							coinInAmount: totalCoinInAmount,
							referrer,
					  });

				const coinOutAmountFromTrade =
					totalCoinOutAmount - path.coinOut.amount;

				// let updatedPool: RouterPoolInterface;
				// if (
				// 	(totalCoinOutAmount ||
				// 		coinOutAmountFromTrade ||
				// 		currentCoinInAmount) === failedAmount
				// ) {
				// 	totalCoinOutAmount = failedAmount;
				// 	coinOutAmountFromTrade = failedAmount;
				// 	currentCoinInAmount = failedAmount;

				// 	updatedPool = Helpers.deepCopy(pool);
				// } else {
				const updatedPool = pool.getUpdatedPoolAfterTrade(
					isGivenAmountOut
						? {
								coinIn: path.coinIn.type,
								coinInAmount: currentCoinInAmount,
								coinOut: path.coinOut.type,
								coinOutAmount: coinOutAmountFromTrade,
						  }
						: {
								coinIn: path.coinIn.type,
								coinInAmount: coinOutAmountFromTrade,
								coinOut: path.coinOut.type,
								coinOutAmount: currentCoinInAmount,
						  }
				);
				// }

				let newPath: TradePath = {
					...path,
					coinIn: {
						...path.coinIn,
						amount: totalCoinInAmount,
					},
					coinOut: {
						...path.coinOut,
						amount: totalCoinOutAmount,
					},
					spotPrice,
				};

				newRoute = {
					...newRoute,
					paths: [...newRoute.paths, newPath],
				};

				currentCoinInAmount = coinOutAmountFromTrade;
				currentPools = {
					...currentPools,
					[path.poolUid]: updatedPool,
				};

				routeSpotPrice *= spotPrice;
			}

			const updatedRoute: TradeRoute = {
				...newRoute,
				coinIn: {
					...newRoute.coinIn,
					amount: newRoute.paths[0].coinIn.amount,
				},
				coinOut: {
					...newRoute.coinOut,
					amount: newRoute.paths[newRoute.paths.length - 1].coinOut
						.amount,
				},
				spotPrice: routeSpotPrice,
			};

			return {
				updatedPools: currentPools,
				updatedRoute,
				coinOutAmount: currentCoinInAmount,
				startingRoute: route,
				isOverMaxGasCost,
			};
		} catch (e) {
			return undefined;
		}
	};

	private static completeRouteFromRoutes = (
		routes: TradeRoute[],
		coinIn: CoinType,
		coinInAmount: Balance,
		coinOut: CoinType
	): CompleteTradeRoute => {
		const nonZeroRoutes = routes.filter(
			(route) => route.coinIn.amount > BigInt(0)
		);
		const totalCoinOutAmount = nonZeroRoutes.reduce(
			(acc, cur) => acc + cur.coinOut.amount,
			BigInt(0)
		);
		const spotPrice = nonZeroRoutes.reduce(
			(acc, cur) =>
				acc +
				(Number(cur.coinIn.amount) / Number(coinInAmount)) *
					cur.spotPrice,
			0
		);
		const estimatedGasCost = this.gasCostForRoutes(routes);

		return {
			estimatedGasCost,
			coinIn: {
				type: coinIn,
				amount: coinInAmount,
				tradeFee: BigInt(0),
			},
			coinOut: {
				type: coinOut,
				amount: totalCoinOutAmount,
				tradeFee: BigInt(0),
			},
			routes: nonZeroRoutes,
			spotPrice,
		};
	};

	private static transformCompleteRouteIfGivenAmountOut = (
		completeRoute: CompleteTradeRoute
	): CompleteTradeRoute => {
		const newCompleteRoute =
			this.transformRouterTradeInfoIfGivenAmountOut(completeRoute);
		const newRoutes = completeRoute.routes.map((route) => {
			const newRoute =
				this.transformRouterTradeInfoIfGivenAmountOut(route);
			let newPaths = route.paths.map(
				this.transformRouterTradeInfoIfGivenAmountOut
			);
			newPaths.reverse();

			return {
				...newRoute,
				paths: newPaths,
			};
		});

		return {
			...newCompleteRoute,
			routes: newRoutes,
		};
	};

	private static transformRouterTradeInfoIfGivenAmountOut = <
		T extends Required<TradeInfo>
	>(
		tradeInfo: T
	) => {
		const { coinIn, coinOut } = tradeInfo;
		return {
			...tradeInfo,
			coinIn: {
				...coinIn,
				amount: coinOut.amount,
			},
			coinOut: {
				...coinOut,
				amount: coinIn.amount,
			},
		};
	};

	private static gasCostForRoutes = (routes: TradeRoute[]): Balance =>
		routes
			.filter((route) => route.coinIn.amount > BigInt(0))
			.reduce(
				(acc, route) => acc + this.gasCostForRoute(route),
				BigInt(0)
			);

	private static gasCostForRoute = (route: TradeRoute): Balance =>
		route.paths.reduce(
			(acc, route) => acc + route.estimatedGasCost,
			BigInt(0)
		);

	private static routerCompleteTradeRouteFromCompleteTradeRoute = (
		completeRoute: CompleteTradeRoute,
		pools: PoolsById,
		referrer?: SuiAddress,
		externalFee?: RouterExternalFee
	): RouterCompleteTradeRoute => {
		const { coinIn, coinOut, spotPrice } = completeRoute;

		const newRoutes: RouterTradeRoute[] = completeRoute.routes.map(
			(route) => {
				const { coinIn, coinOut, spotPrice } = route;

				const newPaths: RouterTradePath[] = route.paths.map((path) => {
					const { coinIn, coinOut, spotPrice, poolUid } = path;
					const pool = pools[poolUid];
					return {
						coinIn,
						coinOut,
						spotPrice,
						protocolName: pool.protocolName,
						pool: pool.pool,
					};
				});

				return {
					coinIn,
					coinOut,
					spotPrice,
					paths: newPaths,
				};
			}
		);

		const newCoinOut: RouterTradeCoin = externalFee
			? {
					...coinOut,
					amount: BigInt(
						Math.floor(
							(1 - externalFee.feePercentage) *
								Number(coinOut.amount)
						)
					),
			  }
			: coinOut;

		return {
			coinIn,
			coinOut: newCoinOut,
			spotPrice,
			routes: newRoutes,
			externalFee,
			referrer,
		};
	};
}
