import delay from "./delay";

export default async function fetchFake(json, delayMs) {
	if (delayMs) {
		await delay(delayMs);
	}

	return json;
}
