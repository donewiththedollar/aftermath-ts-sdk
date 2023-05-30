import { EventId, ObjectId, SuiAddress } from "@mysten/sui.js";
import { AftermathApi } from "../../../general/providers/aftermathApi";
import { CapysApiCasting } from "./capysApiCasting";
import { CapysApiHelpers } from "./capysApiHelpers";
import {
	BreedCapysEvent,
	CapyAttribute,
	CapyBornEvent,
	StakedCapyFeesEarned,
	CapyObject,
	CapyStats,
	CapyVaultObject,
	StakeCapyEvent,
	StakedCapyReceiptObject,
	StakedCapyReceiptWithCapyObject,
	UnstakeCapyEvent,
} from "../capysTypes";
import {
	BreedCapyEventOnChain,
	CapyBornEventOnChain,
	StakeCapyEventOnChain,
	UnstakeCapyEventOnChain,
} from "./capysApiCastingTypes";
import { AmountInCoinAndUsd, CoinDecimal } from "../../coin/coinTypes";
import { Coin } from "../../coin/coin";
import { Helpers } from "../../../general/utils/helpers";
import { Capys } from "../capys";
import {
	Balance,
	DynamicFieldObjectsWithCursor,
	DynamicFieldsInputs,
	EventsInputs,
	SerializedTransaction,
} from "../../../types";

export class CapysApi {
	/////////////////////////////////////////////////////////////////////
	//// Class Members
	/////////////////////////////////////////////////////////////////////

	public readonly Helpers;

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	constructor(private readonly Provider: AftermathApi) {
		this.Provider = Provider;
		this.Helpers = new CapysApiHelpers(Provider);
	}

	/////////////////////////////////////////////////////////////////////
	//// Public Methods
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Inspections
	/////////////////////////////////////////////////////////////////////

	public fetchStakedCapyFeesEarned = async (
		stakedCapyReceiptObjectId: ObjectId
	): Promise<StakedCapyFeesEarned> => {
		const [capyFeesEarnedIndividual, capyFeesEarnedGlobal] =
			await Promise.all([
				this.Helpers.fetchStakedCapyFeesEarnedIndividual(
					stakedCapyReceiptObjectId
				),
				this.Helpers.fetchStakedCapyFeesEarnedGlobal(),
			]);

		return {
			individualFees: capyFeesEarnedIndividual,
			globalFees: capyFeesEarnedGlobal,
		};
	};

	public fetchIsCapyPackageOnChain = () =>
		this.Provider.Objects().fetchDoesObjectExist(
			this.Helpers.addresses.packages.capy
		);

	public fetchCapysStakedInCapyVaultWithAttributes = async (inputs: {
		attributes: CapyAttribute[];
		limitStepSize: number;
		cursor?: ObjectId;
		limit: number;
	}) => {
		const { limit, attributes } = inputs;

		const isComplete = (capys: CapyObject[]) => {
			return (
				this.Helpers.filterCapysWithAttributes(capys, attributes)
					.length >= limit
			);
		};

		const capysWithCursor =
			await this.Provider.DynamicFields().fetchDynamicFieldsUntil({
				...inputs,
				fetchFunc: this.fetchCapysStakedInCapyVault,
				isComplete,
			});

		const filteredCapys = this.Helpers.filterCapysWithAttributes(
			capysWithCursor.dynamicFieldObjects,
			attributes
		);
		const resizedCapysWithCursor: DynamicFieldObjectsWithCursor<CapyObject> =
			{
				nextCursor:
					capysWithCursor.nextCursor ?? limit < filteredCapys.length
						? filteredCapys[limit].objectId
						: capysWithCursor.nextCursor,
				dynamicFieldObjects: filteredCapys.slice(0, limit),
			};
		return resizedCapysWithCursor;
	};

	/////////////////////////////////////////////////////////////////////
	//// Events
	/////////////////////////////////////////////////////////////////////

	public fetchCapyBornEvents = async (inputs: EventsInputs) =>
		await this.Provider.Events().fetchCastEventsWithCursor<
			CapyBornEventOnChain,
			CapyBornEvent
		>({
			...inputs,
			query: {
				MoveEventType: this.Helpers.eventTypes.capyBorn,
			},
			eventFromEventOnChain: CapysApiCasting.capyBornEventFromOnChain,
		});

	public fetchBreedCapysEvents = async (inputs: EventsInputs) =>
		await this.Provider.Events().fetchCastEventsWithCursor<
			BreedCapyEventOnChain,
			BreedCapysEvent
		>({
			...inputs,
			query: {
				MoveEventType: this.Helpers.eventTypes.breedCapys,
			},
			eventFromEventOnChain: CapysApiCasting.breedCapysEventFromOnChain,
		});

	public fetchStakeCapyEvents = async (inputs: EventsInputs) =>
		await this.Provider.Events().fetchCastEventsWithCursor<
			StakeCapyEventOnChain,
			StakeCapyEvent
		>({
			...inputs,
			query: {
				MoveEventType: this.Helpers.eventTypes.stakeCapy,
			},
			eventFromEventOnChain: CapysApiCasting.stakeCapyEventFromOnChain,
		});

	public fetchUnstakeCapyEvents = async (inputs: EventsInputs) =>
		await this.Provider.Events().fetchCastEventsWithCursor<
			UnstakeCapyEventOnChain,
			UnstakeCapyEvent
		>({
			...inputs,
			query: {
				MoveEventType: this.Helpers.eventTypes.unstakeCapy,
			},
			eventFromEventOnChain: CapysApiCasting.unstakeCapyEventFromOnChain,
		});

	/////////////////////////////////////////////////////////////////////
	//// Objects
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Capy Objects
	/////////////////////////////////////////////////////////////////////

	public fetchCapys = async (capyIds: ObjectId[]): Promise<CapyObject[]> => {
		return this.Provider.Objects().fetchCastObjectBatch<CapyObject>({
			objectIds: capyIds,
			objectFromSuiObjectResponse:
				CapysApiCasting.capyObjectFromSuiObjectResponse,
		});
	};

	public fetchCapysOwnedByAddress = async (
		walletAddress: SuiAddress
	): Promise<CapyObject[]> => {
		return await this.Provider.Objects().fetchCastObjectsOwnedByAddressOfType(
			{
				walletAddress,
				objectType: this.Helpers.objectTypes.capyObjectType,
				objectFromSuiObjectResponse:
					CapysApiCasting.capyObjectFromSuiObjectResponse,
			}
		);
	};

	public fetchStakedCapys = async (
		capyIds: ObjectId[]
	): Promise<CapyObject[]> => {
		return this.Provider.Objects().fetchCastObjectBatch<CapyObject>({
			objectIds: capyIds,
			objectFromSuiObjectResponse:
				CapysApiCasting.capyObjectFromSuiObjectResponse,
		});
	};

	public fetchStakedCapysOwnedByAddress = async (
		walletAddress: SuiAddress
	): Promise<CapyObject[]> => {
		// i. obtain all owned StakingReceipt
		const capyIdsStakedByAddress = (
			await this.fetchStakedCapyReceiptOwnedByAddress(walletAddress)
		).map((capyStakingReceipt) => capyStakingReceipt.capyId);

		// ii. obtain a Capy object from each Capy ObjectId
		const stakedCapys = await this.fetchStakedCapys(capyIdsStakedByAddress);

		return stakedCapys;
	};

	public fetchCapyVault = async (
		capyVaultId: ObjectId
	): Promise<CapyVaultObject> => {
		return this.Provider.Objects().fetchCastObject<CapyVaultObject>({
			objectId: capyVaultId,
			objectFromSuiObjectResponse:
				CapysApiCasting.capyVaultObjectFromSuiObjectResponse,
		});
	};

	public fetchCapysStakedInCapyVault = async (
		inputs: DynamicFieldsInputs
	) => {
		const capyVaultId = this.Helpers.addresses.objects.capyVault;
		const capyType = this.Helpers.objectTypes.capyObjectType;

		return await this.Provider.DynamicFields().fetchCastDynamicFieldsOfTypeWithCursor(
			{
				...inputs,
				parentObjectId: capyVaultId,
				objectsFromObjectIds: this.fetchCapys,
				dynamicFieldType: capyType,
			}
		);
	};

	/////////////////////////////////////////////////////////////////////
	//// Staked Capy Receipt Objects
	/////////////////////////////////////////////////////////////////////

	public fetchStakedCapyReceipt = async (
		capyStakingReceipt: ObjectId
	): Promise<StakedCapyReceiptObject> => {
		return this.Provider.Objects().fetchCastObject<StakedCapyReceiptObject>(
			{
				objectId: capyStakingReceipt,
				objectFromSuiObjectResponse:
					CapysApiCasting.stakedCapyReceiptObjectFromSuiObjectResponse,
			}
		);
	};

	public fetchStakedCapyReceipts = async (
		capyStakingReceipts: ObjectId[]
	): Promise<StakedCapyReceiptObject[]> => {
		return this.Provider.Objects().fetchCastObjectBatch<StakedCapyReceiptObject>(
			{
				objectIds: capyStakingReceipts,
				objectFromSuiObjectResponse:
					CapysApiCasting.stakedCapyReceiptObjectFromSuiObjectResponse,
			}
		);
	};

	public fetchStakedCapyReceiptOwnedByAddress = async (
		walletAddress: SuiAddress
	): Promise<StakedCapyReceiptObject[]> => {
		return await this.Provider.Objects().fetchCastObjectsOwnedByAddressOfType(
			{
				walletAddress,
				objectType:
					this.Helpers.objectTypes.stakedCapyReceiptObjectType,
				objectFromSuiObjectResponse:
					CapysApiCasting.stakedCapyReceiptObjectFromSuiObjectResponse,
			}
		);
	};

	public fetchStakedCapyReceiptWithCapysOwnedByAddress = async (
		walletAddress: SuiAddress
	): Promise<StakedCapyReceiptWithCapyObject[]> => {
		// i. obtain all owned StakingReceipt
		const stakingReceipts = await this.fetchStakedCapyReceiptOwnedByAddress(
			walletAddress
		);

		// ii. obtain all Capy Object Ids
		const capyIdsStakedByAddress = stakingReceipts.map(
			(capyStakingReceipt) => capyStakingReceipt.capyId
		);

		// iii. obtain a Capy object from each Capy ObjectId
		let indexStakedCapys: { [key: ObjectId]: CapyObject } = {};
		(await this.fetchStakedCapys(capyIdsStakedByAddress)).forEach(
			(stakedCapy) => {
				indexStakedCapys[stakedCapy.objectId] = stakedCapy;
			}
		);

		// iv. construct a StakingReceiptWithCapy object from each StakingReceipt <> Capy pair
		const capyStakingReceiptsWithCapy = stakingReceipts.map(
			(stakingReceipt) => {
				return {
					objectId: stakingReceipt.objectId,
					capy: indexStakedCapys[stakingReceipt.capyId],
					unlockEpoch: stakingReceipt.unlockEpoch,
				} as StakedCapyReceiptWithCapyObject;
			}
		);

		return capyStakingReceiptsWithCapy;
	};

	/////////////////////////////////////////////////////////////////////
	//// Transactions
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// Capy Staking
	/////////////////////////////////////////////////////////////////////

	public fetchStakeCapyTransaction = (
		capyId: ObjectId
	): Promise<SerializedTransaction> =>
		this.Provider.Transactions().fetchSetGasBudgetAndSerializeTransaction(
			this.Helpers.capyStakeCapyTransaction(capyId)
		);

	public fetchUnstakeCapyTransaction = (
		stakingReceiptId: ObjectId
	): Promise<SerializedTransaction> =>
		this.Provider.Transactions().fetchSetGasBudgetAndSerializeTransaction(
			this.Helpers.capyUnstakeCapyTransaction(stakingReceiptId)
		);

	public fetchWithdrawStakedCapyFeesTransaction = (
		stakingReceiptId: ObjectId
	): Promise<SerializedTransaction> =>
		this.Provider.Transactions().fetchSetGasBudgetAndSerializeTransaction(
			this.Helpers.capyWithdrawFeesTransaction(stakingReceiptId)
		);

	public fetchWithdrawStakedCapyFeesAmountTransaction = (
		stakingReceiptId: ObjectId,
		amount: Balance
	): Promise<SerializedTransaction> =>
		this.Provider.Transactions().fetchSetGasBudgetAndSerializeTransaction(
			this.Helpers.capyWithdrawFeesAmountTransaction(
				stakingReceiptId,
				amount
			)
		);

	public fetchCapyTransferTransaction = (
		stakingReceiptId: ObjectId,
		recipient: SuiAddress
	): Promise<SerializedTransaction> =>
		this.Provider.Transactions().fetchSetGasBudgetAndSerializeTransaction(
			this.Helpers.capyTransferTransaction(stakingReceiptId, recipient)
		);

	/////////////////////////////////////////////////////////////////////
	//// Capy Breeding
	/////////////////////////////////////////////////////////////////////

	public fetchBreedCapysTransaction = async (
		walletAddress: SuiAddress,
		parentOneId: ObjectId,
		parentTwoId: ObjectId
	): Promise<SerializedTransaction> => {
		const [parentOneIsOwned, parentTwoIsOwned] = await Promise.all([
			this.Provider.Objects().fetchIsObjectOwnedByAddress({
				objectId: parentOneId,
				walletAddress,
			}),
			this.Provider.Objects().fetchIsObjectOwnedByAddress({
				objectId: parentTwoId,
				walletAddress,
			}),
		]);

		const transaction = await this.Helpers.fetchCapyBuildBreedTransaction(
			walletAddress,
			parentOneId,
			parentOneIsOwned,
			parentTwoId,
			parentTwoIsOwned
		);

		return this.Provider.Transactions().fetchSetGasBudgetAndSerializeTransaction(
			transaction
		);
	};

	/////////////////////////////////////////////////////////////////////
	//// Stats
	/////////////////////////////////////////////////////////////////////

	// TODO: make this function not exported from sdk (only internal use)
	// NOTE: this calculation will be  incorrect if feeCoinType is different for each fee
	public calcCapyBreedingFees = (
		breedCapyEvents: BreedCapysEvent[],
		feeCoinDecimals: CoinDecimal,
		feeCoinPrice: number
	): AmountInCoinAndUsd => {
		const breedingFeesInFeeCoin = Helpers.sum(
			breedCapyEvents.map((event) =>
				Coin.balanceWithDecimals(
					event.feeCoinWithBalance.balance,
					feeCoinDecimals
				)
			)
		);

		const breedingFeesUsd = feeCoinPrice * breedingFeesInFeeCoin;
		return {
			amount: breedingFeesInFeeCoin,
			amountUsd: breedingFeesUsd,
		};
	};

	public fetchCapyStats = async (): Promise<CapyStats> => {
		const breedCapyEventsWithinTime =
			await this.Provider.Events().fetchEventsWithinTime({
				fetchEventsFunc: this.fetchBreedCapysEvents,
				timeUnit: "hour",
				time: 24,
			});

		const feeCoin =
			breedCapyEventsWithinTime.length === 0
				? Capys.constants.breedingFees.coinType
				: breedCapyEventsWithinTime[0].feeCoinWithBalance.coin;
		const feeCoinDecimals = (
			await this.Provider.Coin().fetchCoinMetadata(feeCoin)
		).decimals;
		const feeCoinPrice = await this.Provider.Prices().fetchPrice(feeCoin);

		const breedingFeesDaily = this.calcCapyBreedingFees(
			breedCapyEventsWithinTime,
			feeCoinDecimals,
			feeCoinPrice
		);

		const capyVault = await this.fetchCapyVault(
			this.Helpers.addresses.objects.capyVault
		);

		const { bredCapys, stakedCapys, breedingFeesGlobal } =
			await this.Helpers.fetchCapyVaultStats(
				capyVault,
				feeCoinDecimals,
				feeCoinPrice
			);

		return {
			bredCapys,
			stakedCapys,
			breedingFeeCoin: feeCoin,
			breedingFeesGlobal,
			breedingFeesDaily,
			breedingVolumeDaily: breedCapyEventsWithinTime.length,
		};
	};
}
