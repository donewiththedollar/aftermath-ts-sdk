import { SuiAddress } from "@mysten/sui.js";
import { Event } from "../../general/types/generalTypes";
import { CoinType } from "../coin/coinTypes";

/////////////////////////////////////////////////////////////////////
//// Events
/////////////////////////////////////////////////////////////////////

export interface FaucetMintCoinEvent extends Event {
	minter: SuiAddress;
	coinMinted: CoinType;
	balanceMinted: BigInt;
}

export interface FaucetAddCoinEvent extends Event {
	coinSymbol: string;
	coinType: CoinType;
}

/////////////////////////////////////////////////////////////////////
//// API
/////////////////////////////////////////////////////////////////////

export interface ApiFaucetRequestBody {
	coin: CoinType;
	walletAddress: SuiAddress;
}
