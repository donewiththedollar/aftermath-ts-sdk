import { Aftermath } from "../../../general/providers";
import { Balance } from "../../../types";
import { CoinType } from "../../coin/coinTypes";
import { Router } from "../router";

const tradeAmounts = {
	max: BigInt(9_223_372_036_854_775_807),
	extraLarge: BigInt(100000000000000000),
	large: BigInt(10000000000000),
	medium: BigInt(1000000000),
	small: BigInt(10000),
};

const runMe = async () => {
	const AftermathSdk = new Aftermath("LOCAL");
	const pools = await AftermathSdk.Pools().getAllPools();
	const router = await AftermathSdk.Router(pools);

	const supportedCoins = await router.getSupportedCoins();

	// const coinIn = supportedCoins.find((coin) => coin.includes("lzeth")) ?? "";
	// const coinOut = supportedCoins.find((coin) => coin.includes("wheth")) ?? "";
	// const coinInAmount = tradeAmounts.medium;

	const coinIn = "0xc6d6a60b8edc8f50cb07f4ef64935e9ecbe43e8e::whusdt::WHUSDT";
	const coinOut =
		"0xc6d6a60b8edc8f50cb07f4ef64935e9ecbe43e8e::whusdc::WHUSDC";
	const coinInAmount = tradeAmounts.large;

	console.log("START");
	console.log("\n");

	try {
		// await runRoute(router, coinIn, coinInAmount, coinOut, 1);
		const coinOutAmount = await runRoute(
			router,
			coinIn,
			coinInAmount,
			coinOut,
			5,
			false
		);
		await runRoute(router, coinIn, coinOutAmount, coinOut, 5, true);
		// await runRoute(router, coinIn, coinInAmount, coinOut, 3);
		// await runRoute(router, coinIn, coinInAmount, coinOut, 4);
		// await runRoute(router, coinIn, coinInAmount, coinOut, 5);
		// await runRoute(router, coinIn, coinInAmount, coinOut, 6);
		// await runRoute(router, coinIn, coinInAmount, coinOut, 7);
	} catch (e) {
		console.error(e);
	}

	console.log("END");
};

const runRoute = async (
	router: Router,
	coinIn: CoinType,
	coinInAmount: Balance,
	coinOut: CoinType,
	maxRouteLength: number,
	isGivenAmountOut: boolean
): Promise<Balance> => {
	const start = performance.now();

	const completeRoute = isGivenAmountOut
		? await router.getCompleteTradeRouteGivenAmountOut(
				coinIn,
				coinOut,
				coinInAmount,
				maxRouteLength
		  )
		: await router.getCompleteTradeRouteGivenAmountIn(
				coinIn,
				coinInAmount,
				coinOut,
				maxRouteLength
		  );

	const end = performance.now();

	const stableCoinPercentLoss =
		(Number(completeRoute.coinInAmount - completeRoute.coinOutAmount) /
			Number(completeRoute.coinInAmount)) *
		100;

	console.log("Max Route Length:", maxRouteLength);
	console.log("Routes Used:", completeRoute.routes.length);

	// for (const route of completeRoute.routes) {
	// 	console.log("\n");
	// 	console.log(
	// 		route.paths.map((path) => {
	// 			return {
	// 				pool: path.poolObjectId,
	// 				coinIn: path.coinIn,
	// 				coinInAmount: path.coinInAmount,
	// 				coinOut: path.coinOut,
	// 				coinOutAmount: path.coinOutAmount,
	// 			};
	// 		})
	// 	);
	// }

	console.log("Coin In Amount:", completeRoute.coinInAmount);
	console.log("Coin Out Amount:", completeRoute.coinOutAmount);
	console.log(
		"Stable Coin Loss:",
		completeRoute.coinInAmount - completeRoute.coinOutAmount,
		`${stableCoinPercentLoss.toFixed(2)}%`
	);
	console.log("Execution time:", end - start, "ms");
	console.log("\n");

	return completeRoute.coinOutAmount;
};

runMe();