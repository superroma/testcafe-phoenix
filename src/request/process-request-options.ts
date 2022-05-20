import { OutgoingHttpHeaders } from 'http';
import {
    castArray,
    isArrayBuffer,
    isBuffer,
    isObject,
    isUndefined,
} from 'lodash';
import isStream from 'is-stream';
import {
    AuthOptions,
    Credentials,
    ExternalRequestOptions,
    Params,
} from './interfaces';
import {
    RequestOptions,
    generateUniqueId,
} from 'testcafe-hammerhead';
import TestRun from '../test-run';
import CONTENT_TYPES from '../assets/content-types';
import HTTP_HEADERS from '../utils/http-headers';
import { RUNTIME_ERRORS } from '../errors/types';
import { APIError } from '../errors/runtime';
import { GetProxyUrlCommand } from '../test-run/commands/actions';

const DEFAULT_ACCEPT            = { [HTTP_HEADERS.accept]: `${CONTENT_TYPES.json}, ${CONTENT_TYPES.textPlain}, ${CONTENT_TYPES.all}` };
const DEFAULT_IS_REQUEST        = { [HTTP_HEADERS.isRequest]: true };
const METHODS_WITH_CONTENT_TYPE = ['post', 'put', 'patch'];
const DEFAULT_REQUEST_TIMEOUT   = 2 * 60 * 1000;
const DEFAULT_REQUEST_METHOD    = 'GET';

function setContentTypeIfUnset (headers: OutgoingHttpHeaders, value: string): void {
    if (!isUndefined(headers) && isUndefined(headers[HTTP_HEADERS.contentType]))
        headers[HTTP_HEADERS.contentType] = value;
}

function typeOf (value: unknown): string {
    if (value === null)
        return 'null';

    if (value && typeof value === 'object')
        return value.toString().slice(8, -1).toLowerCase();

    return typeof value;
}

function transformBody (headers: OutgoingHttpHeaders, body?: object): Buffer {
    if (!body)
        return Buffer.from('');

    if (typeOf(body) === 'formdata' ||
        typeOf(body) === 'file' ||
        typeOf(body) === 'blob' ||
        isArrayBuffer(body) ||
        isBuffer(body) ||
        isStream(body)
    )
        return Buffer.from(body);
    else if (ArrayBuffer.isView(body))
        return Buffer.from(body.buffer);

    else if (body instanceof URLSearchParams) {
        setContentTypeIfUnset(headers, `${CONTENT_TYPES.urlencoded};charset=utf-8`);
        return Buffer.from(body.toString());
    }
    else if (isObject(body) || headers && headers[HTTP_HEADERS.contentType] === CONTENT_TYPES.json) {
        setContentTypeIfUnset(headers, CONTENT_TYPES.json);
        return Buffer.from(JSON.stringify(body));
    }

    return body;
}

function getAuthString (auth: AuthOptions): string {
    return 'Basic ' + Buffer.from(auth.username + ':' + auth.password, 'utf8').toString('base64');
}

function changeHeaderNamesToLowercase (headers: OutgoingHttpHeaders): OutgoingHttpHeaders {
    const lowerCaseHeaders: OutgoingHttpHeaders = {};

    Object.keys(headers).forEach(headerName => {
        lowerCaseHeaders[headerName.toLowerCase()] = headers[headerName];
    });

    return lowerCaseHeaders;
}

async function prepareHeaders (headers: OutgoingHttpHeaders, url: URL, body: Buffer, testRun: TestRun, options: ExternalRequestOptions): Promise<OutgoingHttpHeaders> {
    const { host, hostname, origin, href } = url;

    const preparedHeaders: OutgoingHttpHeaders = Object.assign(DEFAULT_ACCEPT, DEFAULT_IS_REQUEST, changeHeaderNamesToLowercase(headers));

    preparedHeaders[HTTP_HEADERS.host] = host;
    preparedHeaders[HTTP_HEADERS.origin] = origin;
    preparedHeaders[HTTP_HEADERS.contentLength] = body.length;

    if (headers.method && METHODS_WITH_CONTENT_TYPE.includes(String(headers.method)))
        preparedHeaders[HTTP_HEADERS.contentType] = CONTENT_TYPES.urlencoded;

    if (options.auth)
        preparedHeaders[HTTP_HEADERS.authorization] = getAuthString(options.auth);

    if (options.proxy?.auth)
        preparedHeaders[HTTP_HEADERS.proxyAuthorization] = getAuthString(options.proxy.auth);

    if (options.withCredentials) {
        const currentPageUrl     = new URL(await testRun.getCurrentUrl());
        const currentPageCookies = testRun.session.cookies.getHeader({
            url:      currentPageUrl.href,
            hostname: currentPageUrl.hostname,
        });

        const cookies = testRun.session.cookies.getHeader({ url: href, hostname });

        if (cookies)
            preparedHeaders[HTTP_HEADERS.cookie] = currentPageCookies || cookies;
    }

    return preparedHeaders;
}

async function prepareUrl (testRun: TestRun, url: string | URL, callsiteName: string): Promise<URL> {
    const currentPageUrl = new URL(await testRun.getCurrentUrl());
    let preparedUrl: URL;

    try {
        preparedUrl = url instanceof URL
            ? url
            : new URL(url, currentPageUrl.hostname ? currentPageUrl.origin : void 0);
    }
    catch (err) {
        throw new APIError(callsiteName, RUNTIME_ERRORS.requestUrlError, url);
    }

    return preparedUrl;
}

function prepareSearchParams (url: string, params?: Params): string {
    if (!params)
        return url;

    let searchParams: URLSearchParams;

    if (params instanceof URLSearchParams)
        searchParams = params;
    else {
        searchParams = new URLSearchParams();

        for (const key in params) {
            if (!params[key])
                continue;

            castArray(params[key]).forEach(v => {
                searchParams.append(key, typeof v === 'object' ? JSON.stringify(v) : String(v));
            });
        }
    }

    return `${url}${(url.includes('?') ? '&' : '?')}${searchParams.toString()}`;
}

export async function processRequestOptions (testRun: TestRun, options: ExternalRequestOptions, callsite: string): Promise<RequestOptions> {
    options.headers = options.headers || {};

    const url        = await prepareUrl(testRun, options.url, callsite);
    const proxiedUrl = await testRun.executeCommand(new GetProxyUrlCommand({
        url:    url.href,
        option: {
            credentials: options.withCredentials ? Credentials.include : Credentials.omit,
            isAjax:      options.isAjax,
        },
    }, testRun, true)) as string;

    const body       = transformBody(options.headers, options.body);
    const headers    = await prepareHeaders(options.headers, url, body, testRun, options);
    let auth         = options.auth;

    if (!auth && url.username && url.password) {
        auth = {
            username: url.username,
            password: url.password,
        };
    }

    const externalProxySettings = options.proxy ? {
        host:      options.proxy.host,
        hostname:  options.proxy.host,
        port:      options.proxy.port.toString(),
        proxyAuth: options.proxy.auth ? options.proxy.auth.username + ':' + options.proxy.auth.password : '',
    } : void 0;

    return new RequestOptions({
        method:                options.method || DEFAULT_REQUEST_METHOD,
        url:                   proxiedUrl,
        protocol:              url.protocol,
        hostname:              url.hostname,
        host:                  url.host,
        port:                  url.port,
        path:                  prepareSearchParams(url.pathname + url.search, options.params),
        auth:                  auth ? `${auth.username}:${auth.password}` : void 0,
        headers:               headers,
        externalProxySettings: externalProxySettings,
        credentials:           testRun.session.getAuthCredentials(),
        body:                  body,
        rawHeaders:            void 0,
        requestTimeout:        {
            ajax: options.timeout || DEFAULT_REQUEST_TIMEOUT,
            page: 0,
        },
        disableHttp2: testRun.session.isHttp2Disabled(),
        isAjax:       true,
        requestId:    generateUniqueId(),
        isWebSocket:  false,
    });
}
