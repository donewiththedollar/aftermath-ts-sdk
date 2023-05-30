import { SuiAddress, TransactionBlock } from "@mysten/sui.js";
import { AftermathApi } from "../../../general/providers/aftermathApi";
import { Balance, CoinType } from "../../../types";
import { ReferralVaultApiHelpers } from "./referralVaultApiHelpers";
import { Casting } from "../../../general/utils";

export class ReferralVaultApi {
	/////////////////////////////////////////////////////////////////////
	//// Class Members
	/////////////////////////////////////////////////////////////////////

	public readonly Helpers;

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	constructor(private readonly Provider: AftermathApi) {
		this.Provider = Provider;
		this.Helpers = new ReferralVaultApiHelpers(Provider);
	}

	/////////////////////////////////////////////////////////////////////
	//// Public Methods
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Inspections
	/////////////////////////////////////////////////////////////////////

	public fetchBalanceOfRebate = async (inputs: {
		coinType: CoinType;
		referrer: SuiAddress;
	}): Promise<Balance> => {
		const tx = new TransactionBlock();
		this.Helpers.balanceOfRebateTx({ ...inputs, tx });
		const bytes =
			await this.Provider.Inspections().fetchFirstBytesFromTxOutput(tx);
		return Casting.bigIntFromBytes(bytes);
	};

	public fetchReferrer = async (inputs: {
		referee: SuiAddress;
	}): Promise<SuiAddress | "None"> => {
		const tx = new TransactionBlock();
		this.Helpers.referrerForTx({ ...inputs, tx });
		const bytes =
			await this.Provider.Inspections().fetchFirstBytesFromTxOutput(tx);

		return Casting.optionAddressFromBytes(bytes);
	};
}
