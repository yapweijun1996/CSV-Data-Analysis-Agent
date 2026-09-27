/**
 * Parses a string that is expected to contain a JSON array, but might be malformed.
 * Handles cases where the array is wrapped in markdown, is inside an object, or is just a single object.
 * @param responseText The raw text response from the AI.
 * @returns A parsed array of objects.
 */
export const robustlyParseJsonArray = (responseText: string): any[] => {
    let content = responseText.trim();

    // 1. Try to extract JSON from markdown code blocks
    const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        content = markdownMatch[1];
    }

    try {
        const resultObject = JSON.parse(content);

        // Case 1: The result is already an array.
        if (Array.isArray(resultObject)) {
            return resultObject;
        }

        if (typeof resultObject === 'object' && resultObject !== null) {
            // Case 2: The result is an object containing an array.
            // Find the first value that is an array and return it.
            const nestedArray = Object.values(resultObject).find(v => Array.isArray(v));
            if (nestedArray && Array.isArray(nestedArray)) {
                return nestedArray;
            }
            
            // Case 3: The result is a single plan object, not in an array.
            if ('chartType' in resultObject && 'title' in resultObject) {
                return [resultObject];
            }
        }
    } catch (e) {
        console.error("Failed to parse AI response as JSON:", e, "Content:", content);
        throw new Error(`AI response could not be parsed as JSON. Content starts with: "${content.substring(0, 150)}..."`);
    }

    throw new Error("Response did not contain a recognizable JSON array or object of plans.");
};

/**
 * Parses a string that is expected to contain a JSON object, but might be malformed.
 * Handles cases where the object is wrapped in markdown.
 * @param responseText The raw text response from the AI.
 * @returns A parsed object.
 */
export const robustlyParseJsonObject = (responseText: string): any => {
    let content = responseText.trim();

    // 1. Try to extract JSON from markdown code blocks
    const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        content = markdownMatch[1];
    }

    try {
        return JSON.parse(content);
    } catch (e) {
        console.error("Failed to parse AI response as JSON:", e, "Content:", content);
        throw new Error(`AI response could not be parsed as JSON. Content starts with: "${content.substring(0, 150)}..."`);
    }
};
