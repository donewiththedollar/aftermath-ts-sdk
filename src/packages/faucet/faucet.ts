import { ApiFaucetRequestBody, CoinType, SuiNetwork, Url } from "../../types";
import { Caller } from "../../general/utils/caller";

export class Faucet extends Caller {
	// =========================================================================
	//  Constants
	// =========================================================================

	public static readonly constants = {
		defaultRequestAmountUsd: 10,
	};

	// =========================================================================
	//  Constructor
	// =========================================================================

	constructor(public readonly network?: SuiNetwork | Url) {
		super(network, "faucet");
	}

	// =========================================================================
	//  Inspections
	// =========================================================================

	public async getIsPackageOnChain(): Promise<boolean> {
		return this.fetchApi("status");
	}

	public async getSupportedCoins(): Promise<CoinType[]> {
		return this.fetchApi("supported-coins");
	}

	// =========================================================================
	//  Events
	// =========================================================================

	// TODO: add mint coin event getter

	// =========================================================================
	//  Transactions
	// =========================================================================

	public async getRequestCoinTransaction(inputs: ApiFaucetRequestBody) {
		return this.fetchApiTransaction<ApiFaucetRequestBody>(
			"transactions/request",
			inputs
		);
	}
}
