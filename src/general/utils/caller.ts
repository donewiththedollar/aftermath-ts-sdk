import { TransactionBlock } from "@mysten/sui.js";
import {
	ApiEventsBody,
	EventsWithCursor,
	SerializedTransaction,
	SuiNetwork,
	Url,
} from "../../types";
import { Helpers } from "./helpers";

export class Caller {
	private readonly baseUrl?: Url;

	/////////////////////////////////////////////////////////////////////
	//// Constructor
	/////////////////////////////////////////////////////////////////////

	constructor(
		public readonly network?: SuiNetwork | Url,
		private readonly urlPrefix: Url = ""
	) {
		this.network = network;
		this.urlPrefix = urlPrefix;
		this.baseUrl =
			network === undefined
				? undefined
				: Caller.baseUrlForNetwork(network);
	}

	/////////////////////////////////////////////////////////////////////
	//// Private Methods
	/////////////////////////////////////////////////////////////////////

	private static baseUrlForNetwork(network: SuiNetwork | Url): Url {
		if (network === "DEVNET") return "https://devnet.aftermath.finance";
		if (network === "TESTNET") return "https://aftermath.finance";
		if (network === "LOCAL") return "http://localhost:3000";
		return network;
	}

	private static async fetchResponseToType<OutputType>(
		response: Response
	): Promise<OutputType> {
		const json = JSON.stringify(await response.json());
		const output = Helpers.parseJsonWithBigint(json);
		return output as OutputType;
	}

	private urlForApiCall = (url: string): Url => {
		if (this.baseUrl === undefined)
			throw new Error("no baseUrl: unable to fetch data");

		// TODO: handle url prefixing and api calls based on network differently
		return `${this.baseUrl}/api/${
			this.urlPrefix === "" ? "" : this.urlPrefix + "/"
		}${url}`;
	};

	/////////////////////////////////////////////////////////////////////
	//// Protected Methods
	/////////////////////////////////////////////////////////////////////

	protected async fetchApi<Output, BodyType = undefined>(
		url: Url,
		body?: BodyType,
		signal?: AbortSignal
	): Promise<Output> {
		// this allows BigInt to be JSON serialized (as string)
		(BigInt.prototype as any).toJSON = function () {
			return this.toString() + "n";
		};

		const apiCallUrl = this.urlForApiCall(url);

		const uncastResponse = await (body === undefined
			? fetch(apiCallUrl, { signal })
			: fetch(apiCallUrl, {
					method: "POST",
					body: JSON.stringify(body),
					signal,
			  }));

		const response = await Caller.fetchResponseToType<Output>(
			uncastResponse
		);
		return response;
	}

	protected async fetchApiTransaction<BodyType = undefined>(
		url: Url,
		body?: BodyType,
		signal?: AbortSignal
	) {
		return TransactionBlock.from(
			await this.fetchApi<SerializedTransaction, BodyType>(
				url,
				body,
				signal
			)
		);
	}

	protected async fetchApiEvents<EventType, BodyType = ApiEventsBody>(
		url: Url,
		body: BodyType,
		signal?: AbortSignal
	) {
		return this.fetchApi<EventsWithCursor<EventType>, BodyType>(
			url,
			body,
			signal
		);
	}
}
