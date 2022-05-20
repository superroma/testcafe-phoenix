// Request API
//----------------------------------------------------------------------------------------------------------------------

type Method =
    | 'get' | 'GET'
    | 'delete' | 'DELETE'
    | 'head' | 'HEAD'
    | 'post' | 'POST'
    | 'put' | 'PUT'
    | 'patch' | 'PATCH';

type Params = URLSearchParams | {[key: string]: string | number | boolean}

interface AuthOptions {
    username: string;
    password: string;
}

interface ProxyOptions {
    protocol?: string;
    host: string;
    port: number | string;
    auth?: AuthOptions;
}

type RequestUrlOpts = string | URL | RequestOptions;

interface RequestOptions {
    /**
     *  Request url.
     */
    url: string | URL;
    /**
     * Request methods.
     */
    method?: Method;
    /**
     * Request headers.
     */
    headers?: Record<string, string>;
    /**
     * Request params.
     */
    params?: Params;
    /**
     * Request body.
     */
    body?: object;
    /**
     * Request timeout.
     */
    timeout?: number;
    /**
     * Request credentials.
     */
    withCredentials?: boolean;
    /**
     * Request auth.
     */
    auth?: AuthOptions;
    /**
     * Request proxy.
     */
    proxy?: ProxyOptions;
    /**
     * Process response.
     */
    processResponse?: boolean;
}

interface ResponseOptions {
    /**
     * Response status.
     */
    status: number;
    /**
     * Response status text.
     */
    statusText: string;
    /**
     * Response headers.
     */
    headers: object;
    /**
     * Response body.
     */
    body: unknown;
}

interface RequestAPI {
    /**
     * Response status.
     */
    status: Promise<number>;
    /**
     * Response status text.
     */
    statusText: Promise<string>;
    /**
     * Response headers.
     */
    headers: Promise<object>;
    /**
     * Response body.
     */
    body: Promise<unknown>;
}


type RequestPromise = RequestAPI | Promise<ResponseOptions>

interface RequestFactory {
    /**
     * Request
     *
     * @param urlOpts - request url or options.
     * @param options - options.
     */
    (urlOpts: RequestUrlOpts, options?: RequestOptions): RequestPromise;
    /**
     * Execute a request with method GET.
     *
     * @param urlOpts - request url or options.
     * @param options - options.
     */
    get(urlOpts: RequestUrlOpts, options?: RequestOptions): RequestPromise;
    /**
     * Execute a request with method DELETE.
     *
     * @param urlOpts - request url or options.
     * @param options - options.
     */
    delete(urlOpts: RequestUrlOpts, options?: RequestOptions): RequestPromise;
    /**
     * Execute a request with method HEAD.
     *
     * @param urlOpts - request url or options.
     * @param options - options.
     */
    head(urlOpts: RequestUrlOpts, options?: RequestOptions): RequestPromise;
    /**
     * Execute a request with method POST.
     *
     * @param urlOpts - request url or options.
     * @param options - options.
     */
    post(urlOpts: RequestUrlOpts, options?: RequestOptions): RequestPromise;
    /**
     * Execute a request with method PUT.
     *
     * @param urlOpts - request url or options.
     * @param options - options.
     */
    put(urlOpts: RequestUrlOpts, options?: RequestOptions): RequestPromise;
    /**
     * Execute a request with method PATCH.
     *
     * @param urlOpts - request url or options.
     * @param options - options.
     */
    patch(urlOpts: RequestUrlOpts, options?: RequestOptions): RequestPromise;
}
