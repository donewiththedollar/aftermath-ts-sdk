import { CoinMetadata } from "@mysten/sui.js";
import { Coin } from "../coin";
import { AftermathApi } from "../../../general/providers/aftermathApi";
import { CoinType } from "../../../types";
import { Helpers } from "../../../general/utils/helpers";
import { Pools } from "../../pools/pools";
import { CoinApiHelpers } from "./coinApiHelpers";

export class CoinApi {
	/////////////////////////////////////////////////////////////////////
	//// Class Members
	/////////////////////////////////////////////////////////////////////

	public readonly Helpers;

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	constructor(private readonly Provider: AftermathApi) {
		this.Provider = Provider;
		this.Helpers = new CoinApiHelpers(Provider);
	}

	/////////////////////////////////////////////////////////////////////
	//// Inspections
	/////////////////////////////////////////////////////////////////////

	public fetchCoinMetadata = async (
		coin: CoinType
	): Promise<CoinMetadata> => {
		try {
			const coinMetadata = await this.Provider.provider.getCoinMetadata({
				coinType: Helpers.stripLeadingZeroesFromType(coin),
			});
			if (coinMetadata === null) throw new Error("coin metadata is null");

			return coinMetadata;
		} catch (error) {
			if (this.Provider.Pools().isLpCoin(coin)) {
				return this.createLpCoinMetadata({ lpCoinType: coin });
			}

			const coinClass = new Coin(coin);
			const symbol = coinClass.coinTypeSymbol;
			const packageName = coinClass.coinTypePackageName;
			return {
				symbol: symbol.toUpperCase(),
				id: null,
				description: `${symbol} (${packageName})`,
				name: symbol
					.split("_")
					.map((word) => Helpers.capitalizeOnlyFirstLetter(word))
					.join(" "),
				decimals: 9,
				iconUrl: null,
			};
		}
	};

	// NOTE: this is temporary until LP coin metadata issue is solved on Sui
	private createLpCoinMetadata = async (inputs: {
		lpCoinType: CoinType;
	}): Promise<CoinMetadata> => {
		try {
			const PoolsApi = this.Provider.Pools();

			// TODO: find the best way to do all of this using cached server data
			const poolObjectId = await PoolsApi.fetchPoolObjectIdForLpCoinType(
				inputs
			);
			const pool = await PoolsApi.fetchPool({ objectId: poolObjectId });

			const maxCoinSymbolLength = 5;
			const notPrettyCoinSymbol =
				pool.name.length > maxCoinSymbolLength
					? pool.name.toUpperCase().slice(0, maxCoinSymbolLength)
					: pool.name.toUpperCase();
			const coinSymbol =
				notPrettyCoinSymbol.slice(-1) === "_"
					? notPrettyCoinSymbol.slice(0, -1)
					: notPrettyCoinSymbol;

			const coinName = pool.name
				.split(" ")
				.map((word) => Helpers.capitalizeOnlyFirstLetter(word))
				.join(" ");

			const coinDescription =
				await PoolsApi.createLpCoinMetadataDescription({
					poolName: pool.name,
					coinTypes: Object.keys(pool.coins),
				});

			return {
				symbol: `AF_LP_${coinSymbol}`,
				id: null,
				description: coinDescription,
				name: `Af Lp ${coinName}`,
				decimals: Pools.constants.decimals.lpCoinDecimals,
				iconUrl: null,
			};
		} catch (e) {
			return {
				symbol: "AF_LP",
				id: null,
				description: "Aftermath Finance LP",
				name: "Af Lp",
				decimals: Pools.constants.decimals.lpCoinDecimals,
				iconUrl: null,
			};
		}
	};
}
