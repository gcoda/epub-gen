declare module '@zeit/fetch-retry' {
  import nodeFetch, { FetchError } from 'node-fetch'
  type FirstArg<F extends Function> = F extends (...args: infer A) => any
    ? A[0]
    : never
  type SecondArg<F extends Function> = F extends (...args: infer A) => any
    ? A[1]
    : never

  type FetchRetryOptions = {
    /** The maximum amount of times to retry the operation. Default is 10. Seting this to 1 means do it once, then retry it once. */
    retries?: number
    /** factor: The exponential factor to use. Default is 2. */
    factor?: number
    /** minTimeout: The number of milliseconds before starting the first retry. Default is 1000. */
    minTimeout?: number
    /** maxTimeout: The maximum number of milliseconds between two retries. Default is Infinity. */
    maxTimeout?: number
    /** randomize: Randomizes the timeouts by multiplying with a factor between 1 to 2. Default is false */
    randomize?: boolean
    /** Max wait time according to the Retry-After header. If it exceeds the option value, stop retrying and returns the error response. It defaults to 20. */
    maxRetryAfter?: number
  }
  type Fetch = typeof nodeFetch
  type FetchUrl = FirstArg<Fetch>
  type FetchInit = SecondArg<Fetch> & {
    retry?: FetchRetryOptions
    /**  an optional Function that is invoked after a new retry is performed. It's passed the Error that triggered it as a parameter. */
    onRetry?: (error: FetchError, init: FetchInit) => void
  }
  type RetryFetch = (
    fetch: Fetch
  ) => (url: FetchUrl, init?: FetchInit) => ReturnType<Fetch>
  const fetch: RetryFetch

  export type RequestInit = FetchInit
  export default fetch
}
