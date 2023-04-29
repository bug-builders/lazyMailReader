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
