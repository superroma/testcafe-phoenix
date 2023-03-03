const { noop }         = require('lodash');
const delay            = require('../../../lib/utils/delay');
const Test             = require('../../../lib/api/structure/test');
const { EventEmitter } = require('events');

const browserConnectionGatewayMock = {
    startServingConnection: noop,
    stopServingConnection:  noop,
    getConnections:         () => ({}),

    proxy: {
        resolveRelativeServiceUrl: noop,
        switchToProxyless:         noop,
        start:                     noop,
    },

    switchToProxyless: noop,
};

class BrowserSetMock extends EventEmitter {
    constructor () {
        super();

        this.browserConnectionGroups = [];
    }

    async dispose () {}
}

const configurationMock = {
    getOption:         noop,
    calculateHostname: noop,

    startOptions: {
        hostname: 'localhost',
        port1:    1337,
        port2:    1338,
    },
};

function createBrowserProviderMock ({ local, headless } = { local: false, headless: false }) {
    return {
        openBrowser:       async () => {},
        closeBrowser:      async () => {},
        isLocalBrowser:    () => local,
        isHeadlessBrowser: () => headless,
    };
}

const compilerServiceMock = {
    init:     noop,
    getTests: async () => {
        await delay(1500);

        return [ new Test({ currentFixture: void 0 }) ];
    },
    setUserVariables: noop,
};

class BrowserSetMock extends EventEmitter {
    constructor () {
        super();

        this.browserConnectionGroups = [];
    }

    async dispose () {}
}

const configurationMock = {
    getOption: noop,

    startOptions: {
        hostname: 'localhost',
        port1:    1337,
        port2:    1338,
    },
};

function createBrowserProviderMock ({ local, headless } = { local: false, headless: false }) {
    return {
        openBrowser:       async () => {},
        closeBrowser:      async () => {},
        isLocalBrowser:    () => local,
        isHeadlessBrowser: () => headless,
    };
}

const compilerServiceMock = {
    init:     noop,
    getTests: async () => {
        await delay(1500);

        return [ new Test({ currentFixture: void 0 }) ];
    },
    setUserVariables: noop,
};

module.exports = {
    browserConnectionGatewayMock,
    browserSetMock: new BrowserSetMock(),
    configurationMock,
    createBrowserProviderMock,
    compilerServiceMock,
};
