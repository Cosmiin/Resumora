/** Any non-2xx API response (status 0 = network failure). `body` is the parsed JSON body, if any. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}
