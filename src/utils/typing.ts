export function assertExists<T>(
	value: T,
	name: string,
): asserts value is NonNullable<T> {
	if (value == null) {
		throw new Error(`Expected ${name} value missing`);
	}
}

export function assertIsString(value: unknown): asserts value is string {
	const isOfExpectedType = typeof value === "string";

	if (!isOfExpectedType) {
		throw new Error("value is not of expected string type.");
	}
}

export function assertIsNumber(value: unknown): asserts value is number {
	const isOfExpectedType = typeof value === "number";

	if (!isOfExpectedType) {
		throw new Error("value is not of expected number type.");
	}
}

export function assertIsLang(value: string): asserts value is "en" | "fr" {
	if (["en", "fr"].includes(value)) {
		return;
	}
	throw new Error(`Invalid lang ${value}`);
}
