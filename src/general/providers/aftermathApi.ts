import { JsonRpcProvider } from "@mysten/sui.js";
import { ConfigAddresses } from "../types/configTypes";
import { PoolsApi } from "../../packages/pools/api/poolsApi";
import { FaucetApi } from "../../packages/faucet/api/faucetApi";
import { CoinApi } from "../../packages/coin/api/coinApi";
import { DynamicFieldsApiHelpers } from "../api/dynamicFieldsApiHelpers";
import { EventsApiHelpers } from "../api/eventsApiHelpers";
import { InspectionsApiHelpers } from "../api/inspectionsApiHelpers";
import { ObjectsApiHelpers } from "../api/objectsApiHelpers";
import { RpcApiHelpers } from "../api/rpcApiHelpers";
import { TransactionsApiHelpers } from "../api/transactionsApiHelpers";
import { SuiApi } from "../../packages/sui/api/suiApi";
import { WalletApi } from "../wallet/walletApi";
import { RouterApi } from "../../packages/router/api/routerApi";
import { PlaceholderPricesApi } from "../prices/placeholder/placeholderPricesApi";
import { CapysApi } from "../../packages/capys/api/capysApi";
import { StakingApi } from "../../packages/staking/api/stakingApi";

export class AftermathApi {
	/////////////////////////////////////////////////////////////////////
	//// Helpers
	/////////////////////////////////////////////////////////////////////

	public static helpers = {
		/////////////////////////////////////////////////////////////////////
		//// General
		/////////////////////////////////////////////////////////////////////

		dynamicFields: DynamicFieldsApiHelpers,
		events: EventsApiHelpers,
		inspections: InspectionsApiHelpers,
		objects: ObjectsApiHelpers,
		transactions: TransactionsApiHelpers,
		rpc: RpcApiHelpers,

		/////////////////////////////////////////////////////////////////////
		//// Utils
		/////////////////////////////////////////////////////////////////////

		wallet: WalletApi,

		/////////////////////////////////////////////////////////////////////
		//// General Packages
		/////////////////////////////////////////////////////////////////////

		coin: CoinApi,
		sui: SuiApi,
	};

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	public constructor(
		public readonly provider: JsonRpcProvider,
		public readonly addresses: Partial<ConfigAddresses>
	) {
		this.provider = provider;
		this.addresses = addresses;
	}

	/////////////////////////////////////////////////////////////////////
	//// Class Object Creation
	/////////////////////////////////////////////////////////////////////

	/////////////////////////////////////////////////////////////////////
	//// General
	/////////////////////////////////////////////////////////////////////

	public DynamicFields = () => new DynamicFieldsApiHelpers(this);
	public Events = () => new EventsApiHelpers(this);
	public Inspections = () => new InspectionsApiHelpers(this);
	public Objects = () => new ObjectsApiHelpers(this);
	public Transactions = () => new TransactionsApiHelpers(this);
	public Rpc = () => new RpcApiHelpers(this);

	/////////////////////////////////////////////////////////////////////
	//// Utils
	/////////////////////////////////////////////////////////////////////

	public Wallet = () => new WalletApi(this);
	public Prices = () => new PlaceholderPricesApi(this);

	/////////////////////////////////////////////////////////////////////
	//// General Packages
	/////////////////////////////////////////////////////////////////////

	public Coin = () => new CoinApi(this);
	public Sui = () => new SuiApi(this);

	/////////////////////////////////////////////////////////////////////
	//// Aftermath Packages
	/////////////////////////////////////////////////////////////////////

	public Pools = () => new PoolsApi(this);
	public Faucet = () => new FaucetApi(this);
	public Router = () => new RouterApi(this);
	public Capys = () => new CapysApi(this);
	public Staking = () => new StakingApi(this);
}