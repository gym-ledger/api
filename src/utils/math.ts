export const prettyFloat = (value: string | number, precision: number = 2) => {
    if (typeof value === "string") {
        value = parseFloat(value);
    }
    if (isNaN(value)) {
        return 0;
    }
    if (value === undefined) {
        return 0;
    }
    if (value === null) {
        return 0;
    }
    if (!value) {
        return 0;
    }
    // if (typeof value !== "number") {
    //     return 0;
    // }
    if (isNaN(parseFloat(value.toString()))) {
        return 0;
    }
    return parseFloat(parseFloat(value.toString()).toFixed(precision));
}