/** How features talk to the API. */
export {
  API_BASE_PATH,
  type ApiClient,
  type HttpMethod,
  type ParsedRequestOptions,
  type QueryParams,
  type RequestOptions,
} from './api-client.js';
export { useApiClient } from './api-context.js';
export {
  ApiError,
  NetworkError,
  UnexpectedResponseError,
} from './api-error.js';
export { describeError, type ErrorDescription } from './describe-error.js';
export {
  sessionQueryKey,
  useSessionQuery,
  WORKSPACE_ROLES,
  type Session,
  type SessionWorkspace,
  type WorkspaceRole,
} from './session.js';
