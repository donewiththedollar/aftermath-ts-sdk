import {
	ApiUnstakeSuiFrenBody,
	ApiWithdrawSuiFrenFeesAmountBody,
	Balance,
	SerializedTransaction,
	StakedSuiFrenFeesEarned,
	StakedSuiFrenReceiptObject,
	SuiNetwork,
	Url,
} from "../../types";
import { SuiFren } from "./suiFren";
import { Caller } from "../../general/utils/caller";
import { TransactionBlock } from "@mysten/sui.js";

export class StakedSuiFrenReceipt extends Caller {
	// =========================================================================
	//  Constructor
	// =========================================================================

	constructor(
		public readonly stakedSuiFren: SuiFren,
		public readonly stakedSuiFrenReceipt: StakedSuiFrenReceiptObject,
		public readonly network?: SuiNetwork | Url
	) {
		super(network, "suiFrens");
		this.stakedSuiFrenReceipt = stakedSuiFrenReceipt;
	}

	// =========================================================================
	//  Inspections
	// =========================================================================

	public async getFeesEarned(): Promise<StakedSuiFrenFeesEarned> {
		return this.fetchApi(`fees-earned/${this.stakedSuiFrenReceipt.objectId}`);
	}

	// =========================================================================
	//  Transactions
	// =========================================================================

	public async getUnstakeSuiFrenTransaction() {
		return this.fetchApiTransaction<ApiUnstakeSuiFrenBody>(
			"transactions/stake",
			{
				stakingReceiptId: this.stakedSuiFrenReceipt.objectId,
			}
		);
	}

	public async getWithdrawFeesTransaction(amount: Balance | undefined) {
		return this.fetchApiTransaction<ApiWithdrawSuiFrenFeesAmountBody>(
			"transactions/withdraw-fees",
			{
				amount,
				stakingReceiptObjectId: this.stakedSuiFrenReceipt.objectId,
			}
		);
	}
}
