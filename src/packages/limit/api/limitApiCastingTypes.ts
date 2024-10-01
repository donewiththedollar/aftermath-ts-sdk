import { EventOnChain } from "../../../general/types/castingTypes";
import {
	Balance,
	BigIntAsString,
	CoinType,
	ObjectId,
	SerializedTransaction,
	ServiceCoinData,
	SuiAddress,
	Timestamp,
	TransactionDigest,
} from "../../../types";

// =========================================================================
// Objects
// =========================================================================

export interface LimitOrderFieldsOnChain {
	id: ObjectId;
	user: ObjectId;
	recipient: ObjectId;
	balance: BigIntAsString;
	gas: BigIntAsString;
	encrypted_fields: Uint8Array;
}

// =========================================================================
// Events
// =========================================================================

export type LimitCreatedOrderEventOnChain = EventOnChain<{
	order_id: ObjectId;
	user: ObjectId;
	user_pk: Uint8Array;
	recipient: ObjectId;
	input_amount: BigIntAsString;
	input_type: Uint8Array;
	output_type: Uint8Array;
	gas_amount: BigIntAsString;
	encrypted_fields: Uint8Array;
}>;

// =========================================================================
// Indexer
// =========================================================================

export type LimitIndexerOrdersRequest = {
	sender: SuiAddress;
};

export type LimitIndexerOrdersResponse = {
	orders: LimitIndexerOrderResponse[];
};

export type LimitIndexerOrderResponse = {
	order_object_id: ObjectId;
	coin_sell: String;
	coin_sell_amount: BigIntAsString;
	coin_buy: String;
	coin_buy_min_amount_out: BigIntAsString;
	recipient: SuiAddress;
	create_order_tx_info: {
		digest: TransactionDigest;
		timestamp: Timestamp;
	};
	finish_order_tx_info: {
		digest: TransactionDigest;
		timestamp: Timestamp;
	};
	expiry_timestamp_ms: Timestamp;
	status: string;
};

// =========================================================================
// Create Order
// =========================================================================

export type LimitIndexerOrderCreateRequest = {
	tx_kind: string;
	order: {
		input_coin: ServiceCoinData;
		input_coin_type: CoinType;
		output_coin_type: CoinType;
		gas_coin: ServiceCoinData;
		owner: SuiAddress;
		recipient: SuiAddress;
		min_amount_out: string;
		expiry_timestamp_ms: Timestamp;
	};
};

export type LimitIndexerOrderCreateResponse = {
	tx_data: SerializedTransaction;
};

// =========================================================================
// Cancel Order
// =========================================================================

export type LimitIndexerOrderCancelRequest = {
	wallet_address: string;
	signature: string;
	bytes: string;
};

export type LimitIndexerOrderCancelResponse = boolean;