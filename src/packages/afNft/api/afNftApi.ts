import { AftermathApi } from "../../../general/providers/aftermathApi";
import { AfNftAddresses, ObjectId, AnyObjectType } from "../../../types";
import { Helpers } from "../../../general/utils";
import { TransactionBlock } from "@mysten/sui.js/transactions";

export class AfNftApi {
	// =========================================================================
	//  Constants
	// =========================================================================

	private static readonly constants = {
		moduleNames: {
			whitelistManager: "wl_manager",
			egg: "egg",
			kioskLockRule: "kiosk_lock_rule",
			kioskRoyaltyRule: "royalty_rule",
		},
	};

	// =========================================================================
	//  Class Members
	// =========================================================================

	public readonly addresses: AfNftAddresses;

	// =========================================================================
	//  Constructor
	// =========================================================================

	constructor(private readonly Provider: AftermathApi) {
		const addresses = this.Provider.addresses.afNft;
		if (!addresses)
			throw new Error(
				"not all required addresses have been set in provider"
			);

		this.addresses = addresses;
	}

	// =========================================================================
	//  Public Methods
	// =========================================================================

	// =========================================================================
	//  Objects
	// =========================================================================

	// =========================================================================
	//  Transaction Builders
	// =========================================================================

	// =========================================================================
	//  Transaction Commands
	// =========================================================================

	public proveRuleTx = (inputs: {
		tx: TransactionBlock;
		nftType: AnyObjectType;
		kioskId: ObjectId;
		transferRequestId: ObjectId;
	}) => {
		const { tx, nftType, kioskId, transferRequestId } = inputs;

		return tx.moveCall({
			target: Helpers.transactions.createTxTarget(
				this.addresses.packages.afEgg,
				AfNftApi.constants.moduleNames.kioskLockRule,
				"prove"
			),
			typeArguments: [nftType],
			arguments: [tx.object(transferRequestId), tx.object(kioskId)],
		});
	};

	public payRoyaltyRuleTx = (inputs: {
		tx: TransactionBlock;
		nftType: AnyObjectType;
		suiCoinId: ObjectId;
		transferPolicyId: ObjectId;
		transferRequestId: ObjectId;
	}) => {
		const { tx, nftType, suiCoinId, transferPolicyId, transferRequestId } =
			inputs;

		return tx.moveCall({
			target: Helpers.transactions.createTxTarget(
				this.addresses.packages.afEgg,
				AfNftApi.constants.moduleNames.kioskRoyaltyRule,
				"pay"
			),
			typeArguments: [nftType],
			arguments: [
				tx.object(transferPolicyId),
				tx.object(transferRequestId),
				tx.object(suiCoinId),
			],
		});
	};
}