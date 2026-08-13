/**
 * Turns whatever was thrown into something worth putting on screen.
 *
 * This exists because of where its output ends up. The office PC has no
 * developer sitting at it and nobody will ever open the webview console, so a
 * caught error either becomes visible text or it becomes an app that silently
 * looks empty. `SchemaMissingError` and friends already write messages meant to
 * be read by the person at the desk; this is the one line that makes sure the
 * message survives instead of being flattened into "[object Object]".
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "An unexpected error occurred, and it reported no message.";
}
