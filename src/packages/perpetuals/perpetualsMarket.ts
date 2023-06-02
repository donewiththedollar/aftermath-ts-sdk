import { Caller } from "../../general/utils/caller";
import { PerpetualsMarketParams, SuiNetwork, Url } from "../../types";

export class PerpetualsMarket extends Caller {
	/////////////////////////////////////////////////////////////////////
	//// Constants
	/////////////////////////////////////////////////////////////////////

	public static readonly constants = {};

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	constructor(
		public readonly marketId: bigint,
		public readonly marketParams: PerpetualsMarketParams,
		public readonly network?: SuiNetwork | Url
	) {
		super(network, `perpetuals/markets/${marketId}`);
	}

	// get market state
}
