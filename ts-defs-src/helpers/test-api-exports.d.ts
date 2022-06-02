
// {{#allowReferences}}
/// <reference path="../test-api/request-hook.d.ts" />
/// <reference path="../test-api/user-variables.d.ts" />
/// <reference path="../test-api/role.d.ts" />
/// <reference path="../test-api/test-controller.d.ts" />
/// <reference path="../test-api/structure.d.ts" />
/// <reference path="../test-api/request.d.ts" />
// {{/allowReferences}}

// {{>selectors-exports.d.ts}}

/**
 * Creates a request mock
 */
export const RequestMock: RequestMockFactory;

/**
 * Creates a request logger
 */
export const RequestLogger: RequestLoggerFactory;

/** The RequestHook class used to create a custom HTTP request hook **/
export const RequestHook: RequestHookConstructor;

/**
 * Execute a request
 *
 * @param urlOpts - request url or options.
 * @param options - options.
 */
export const request: RequestFactory;


/**
 * Creates a user role.
 *
 * @param url - The URL of the login page.
 * @param fn - An asynchronous function that contains logic that authenticates the user.
 * @param fn `t` - The test controller used to access test run API.
 * @param options - Role options.
 */
export const Role: RoleFactory;

/**
 * The test controller used to access test run API.
 */
export const t: TestController;

/**
 * Object which contains userVariables data
 */
export const userVariables: UserVariables;

export const fixture: FixtureFn;
export const test: TestFn;
